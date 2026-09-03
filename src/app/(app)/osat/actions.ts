"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import type { AjoneuvoTyyppi, TyoVaihe, VariTyyppi } from "@/lib/supabase/database.types";
import { MYYTAVAT_MAALI_TYYPIT, TYO_VAIHEET } from "@/lib/vakiot";

export interface OsaLomakeTila {
  virhe: string | null;
}

function tyhjaksiNumeroksi(arvo: FormDataEntryValue | null) {
  return arvo === null || arvo === "" ? null : Number(arvo);
}

function lueOsaKentat(formData: FormData) {
  return {
    nimi: String(formData.get("nimi") ?? "").trim(),
    ajoneuvotyyppi: String(formData.get("ajoneuvotyyppi") ?? "auto") as AjoneuvoTyyppi,
    lisatiedot: String(formData.get("lisatiedot") ?? "").trim() || null,
    hakusanat: String(formData.get("hakusanat") ?? "").trim() || null,
    vari_tyyppi: String(formData.get("vari_tyyppi") ?? "yksivarinen") as VariTyyppi,
    kuva_url: String(formData.get("kuva_url") ?? "").trim() || null,
    kate_prosentti: tyhjaksiNumeroksi(formData.get("kate_prosentti")),
    kate_kiintea: tyhjaksiNumeroksi(formData.get("kate_kiintea")),
    manuaalinen_hinta: tyhjaksiNumeroksi(formData.get("manuaalinen_hinta")),
    lakkaus_kulutus_g: tyhjaksiNumeroksi(formData.get("lakkaus_kulutus_g")),
  };
}

function lueTyovaiheet(formData: FormData) {
  return TYO_VAIHEET.map(({ arvo }) => ({
    vaihe: arvo as TyoVaihe,
    tarvitaan: formData.get(`vaihe_${arvo}_tarvitaan`) === "on",
    arvioitu_kesto_min: Number(formData.get(`vaihe_${arvo}_kesto`) ?? 0),
  }));
}

// Candy vaatii pohjavärin kulutuksen, metallic ja illusion lakan kulutuksen.
// Solidin lakkauskulutus tallentuu osan omaan sarakkeeseen (lakkaus_kulutus_g).
const TOISEN_KULUTUKSEN_KATEGORIAT = new Set(["candy", "metallic", "illusion"]);

interface KategoriahintaSyote {
  maali_tyyppi: (typeof MYYTAVAT_MAALI_TYYPIT)[number]["arvo"];
  hinta: number | null;
  /** Kiinteä hinta lakatulle työlle; null = käytä hinta-kenttää. */
  hinta_lakattu: number | null;
  arvioitu_kulutus_g: number;
  toinen_arvioitu_kulutus_g: number | null;
}

// Kategorian aktivointi vaatii maalinkulutuksen. Hinta on valinnainen kiinteä
// ylikirjoitus - jos sitä ei aseteta, asiakashinta lasketaan värin
// ostohinnasta + katteesta (ks. kustannusarvio.ts / osat-listan hintaskaala).
//
// Puutteellinen kategoria on oma tuloksensa eikä sama kuin pois valittu:
// aiemmin valittu mutta vajaa kategoria putosi hiljaa poistettaviin, jolloin
// tallennus ilmoitti onnistuneensa mutta hinnat katosivat.
function lueKategoriahinnat(formData: FormData) {
  const kaytossa: KategoriahintaSyote[] = [];
  const poistettavat: (typeof MYYTAVAT_MAALI_TYYPIT)[number]["arvo"][] = [];
  const puutteelliset: string[] = [];

  for (const { arvo, nimi } of MYYTAVAT_MAALI_TYYPIT) {
    const kaytossaTama = formData.get(`kategoria_${arvo}_kaytossa`) === "on";
    const hinta = tyhjaksiNumeroksi(formData.get(`kategoria_${arvo}_hinta`));
    const hintaLakattu = tyhjaksiNumeroksi(formData.get(`kategoria_${arvo}_hinta_lakattu`));
    const kulutus = tyhjaksiNumeroksi(formData.get(`kategoria_${arvo}_kulutus`));
    const toinenKulutus = tyhjaksiNumeroksi(formData.get(`kategoria_${arvo}_toinen_kulutus`));
    const lakkausKulutus = tyhjaksiNumeroksi(formData.get("lakkaus_kulutus_g"));
    const toinenVaadittu = TOISEN_KULUTUKSEN_KATEGORIAT.has(arvo);

    // Kulutuksen pitää olla yli nollan: nolla varaisi ja kuluttaisi varastosta
    // nolla grammaa, eli saldo ei enää vastaisi todellisuutta.
    const omaKulutus = arvo === "solid" ? lakkausKulutus : toinenKulutus;
    if (
      kaytossaTama &&
      (hinta === null || hinta >= 0) &&
      kulutus !== null &&
      kulutus > 0 &&
      omaKulutus !== null &&
      omaKulutus > 0
    ) {
      kaytossa.push({
        maali_tyyppi: arvo,
        hinta,
        hinta_lakattu: hintaLakattu !== null && hintaLakattu >= 0 ? hintaLakattu : null,
        arvioitu_kulutus_g: kulutus,
        toinen_arvioitu_kulutus_g: toinenVaadittu ? toinenKulutus : null,
      });
    } else if (kaytossaTama) {
      puutteelliset.push(nimi);
    } else {
      poistettavat.push(arvo);
    }
  }
  return { kaytossa, poistettavat, puutteelliset };
}

/**
 * Virheteksti puutteellisista kategorioista, tai null kun kaikki on kunnossa.
 * Tarkistetaan ennen kuin mitään tallennetaan, jottei osa jää puolitiehen.
 */
function kategorioidenVirhe(formData: FormData): string | null {
  const { puutteelliset } = lueKategoriahinnat(formData);
  if (puutteelliset.length === 0) return null;
  return `Täytä kaikki kulutukset kategorioille: ${puutteelliset.join(", ")}. Varasto varataan ja vähennetään kulutusten mukaan, joten kategoria ei tallennu ilman niitä.`;
}

/**
 * Poikkeukset tulevat lomakkeelta JSONina, koska niitä lisätään ja poistetaan
 * selaimessa ennen tallennusta. Vanhat korvataan kokonaan: poistettu rivi
 * katoaa myös kannasta, mutta jo tehdyillä työriveillä poikkeuksen nimi
 * säilyy, koska se on kopioitu riville.
 */
async function tallennaPoikkeukset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  osaId: string,
  formData: FormData
) {
  let syotteet: { nimi: string; lisahinta_eur: number }[] = [];
  try {
    const raaka = JSON.parse(String(formData.get("poikkeukset") ?? "[]"));
    if (Array.isArray(raaka)) {
      syotteet = raaka
        .map((r) => ({
          nimi: String(r?.nimi ?? "").trim(),
          lisahinta_eur: Number(r?.lisahinta_eur) || 0,
        }))
        .filter((r) => r.nimi !== "" && r.lisahinta_eur >= 0);
    }
  } catch {
    return "Poikkeusten luku epäonnistui.";
  }

  // Sama nimi kahdesti rikkoisi kannan yksilöivän ehdon, ja kaksi samannimistä
  // poikkeusta olisi työtä koottaessa muutenkin mahdoton erottaa toisistaan.
  const nimet = new Set(syotteet.map((r) => r.nimi.toLowerCase()));
  if (nimet.size !== syotteet.length) {
    return "Poikkeuksilla pitää olla eri nimet.";
  }

  const { error: poistoVirhe } = await supabase
    .from("osan_poikkeukset")
    .delete()
    .eq("osa_id", osaId);
  if (poistoVirhe) return poistoVirhe.message;

  if (syotteet.length > 0) {
    const { error } = await supabase.from("osan_poikkeukset").insert(
      syotteet.map((r, jarjestys) => ({ ...r, osa_id: osaId, jarjestys }))
    );
    if (error) return error.message;
  }
  return null;
}

async function tallennaKategoriahinnat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  osaId: string,
  formData: FormData
) {
  const { kaytossa, poistettavat } = lueKategoriahinnat(formData);

  if (kaytossa.length > 0) {
    const { error } = await supabase
      .from("osa_kategoriahinnat")
      .upsert(
        kaytossa.map((k) => ({ ...k, osa_id: osaId })),
        { onConflict: "osa_id,maali_tyyppi" }
      );
    if (error) return error.message;
  }
  if (poistettavat.length > 0) {
    const { error } = await supabase
      .from("osa_kategoriahinnat")
      .delete()
      .eq("osa_id", osaId)
      .in("maali_tyyppi", poistettavat);
    if (error) return error.message;
  }
  return null;
}

export async function luoOsa(
  _edellinenTila: OsaLomakeTila,
  formData: FormData
): Promise<OsaLomakeTila> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const kentat = lueOsaKentat(formData);
  if (!kentat.nimi) {
    return { virhe: "Nimi vaaditaan." };
  }
  const kategoriaVirhe = kategorioidenVirhe(formData);
  if (kategoriaVirhe) {
    return { virhe: kategoriaVirhe };
  }

  const { data, error } = await supabase.from("osat").insert(kentat).select("id").single();
  if (error || !data) {
    return { virhe: error?.message ?? "Osan luonti epäonnistui." };
  }

  const vaiheet = lueTyovaiheet(formData).map((v) => ({ ...v, osa_id: data.id }));
  const { error: vaiheVirhe } = await supabase.from("osa_tyovaiheet").insert(vaiheet);
  if (vaiheVirhe) {
    return { virhe: vaiheVirhe.message };
  }

  const tallennusVirhe = await tallennaKategoriahinnat(supabase, data.id, formData);
  if (tallennusVirhe) {
    return { virhe: tallennusVirhe };
  }

  const poikkeusVirhe = await tallennaPoikkeukset(supabase, data.id, formData);
  if (poikkeusVirhe) {
    return { virhe: poikkeusVirhe };
  }

  revalidatePath("/osat");
  revalidatePath(`/osat/${data.id}`);
  // Takaisin listaan, ja ilmoitus osoiteparametrina: toast tarvitsee
  // selainpuolen, mutta tallennus päättyy palvelimen ohjaukseen.
  redirect("/osat?ilmoitus=lisatty");
}

export async function paivitaOsa(
  osaId: string,
  _edellinenTila: OsaLomakeTila,
  formData: FormData
): Promise<OsaLomakeTila> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const kentat = lueOsaKentat(formData);
  if (!kentat.nimi) {
    return { virhe: "Nimi vaaditaan." };
  }
  const kategoriaVirhe = kategorioidenVirhe(formData);
  if (kategoriaVirhe) {
    return { virhe: kategoriaVirhe };
  }

  const { error } = await supabase.from("osat").update(kentat).eq("id", osaId);
  if (error) {
    return { virhe: error.message };
  }

  const vaiheet = lueTyovaiheet(formData).map((v) => ({ ...v, osa_id: osaId }));
  const { error: vaiheVirhe } = await supabase
    .from("osa_tyovaiheet")
    .upsert(vaiheet, { onConflict: "osa_id,vaihe" });
  if (vaiheVirhe) {
    return { virhe: vaiheVirhe.message };
  }

  const tallennusVirhe = await tallennaKategoriahinnat(supabase, osaId, formData);
  if (tallennusVirhe) {
    return { virhe: tallennusVirhe };
  }

  const poikkeusVirhe = await tallennaPoikkeukset(supabase, osaId, formData);
  if (poikkeusVirhe) {
    return { virhe: poikkeusVirhe };
  }

  revalidatePath("/osat");
  revalidatePath(`/osat/${osaId}`);
  redirect("/osat?ilmoitus=tallennettu");
}

export async function asetaOsanAktiivisuus(osaId: string, aktiivinen: boolean) {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("osat").update({ aktiivinen }).eq("id", osaId);
  if (error) throw new Error(error.message);

  revalidatePath("/osat");
  revalidatePath(`/osat/${osaId}`);
}
