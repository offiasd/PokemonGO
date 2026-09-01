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
    merkki: String(formData.get("merkki") ?? "").trim() || null,
    malli: String(formData.get("malli") ?? "").trim() || null,
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
const TOISEN_KULUTUKSEN_KATEGORIAT = new Set(["candy", "metallic", "illusion"]);

interface KategoriahintaSyote {
  maali_tyyppi: (typeof MYYTAVAT_MAALI_TYYPIT)[number]["arvo"];
  hinta: number | null;
  arvioitu_kulutus_g: number;
  toinen_arvioitu_kulutus_g: number | null;
}

// Palauttaa [käytössä-olevat kategoriahinnat, pois-jätettyjen kategorioiden tyypit].
// Kategorian aktivointi vaatii vain maalinkulutuksen. Hinta on valinnainen
// kiinteä ylikirjoitus - jos sitä ei aseteta, asiakashinta lasketaan värin
// ostohinnasta + katteesta (ks. kustannusarvio.ts / osat-listan hintaskaala).
function lueKategoriahinnat(formData: FormData) {
  const kaytossa: KategoriahintaSyote[] = [];
  const poistettavat: (typeof MYYTAVAT_MAALI_TYYPIT)[number]["arvo"][] = [];

  for (const { arvo } of MYYTAVAT_MAALI_TYYPIT) {
    const kaytossaTama = formData.get(`kategoria_${arvo}_kaytossa`) === "on";
    const hinta = tyhjaksiNumeroksi(formData.get(`kategoria_${arvo}_hinta`));
    const kulutus = tyhjaksiNumeroksi(formData.get(`kategoria_${arvo}_kulutus`));
    const toinenKulutus = tyhjaksiNumeroksi(formData.get(`kategoria_${arvo}_toinen_kulutus`));
    const toinenVaadittu = TOISEN_KULUTUKSEN_KATEGORIAT.has(arvo);

    if (
      kaytossaTama &&
      (hinta === null || hinta >= 0) &&
      kulutus !== null &&
      kulutus >= 0 &&
      (!toinenVaadittu || (toinenKulutus !== null && toinenKulutus >= 0))
    ) {
      kaytossa.push({
        maali_tyyppi: arvo,
        hinta,
        arvioitu_kulutus_g: kulutus,
        toinen_arvioitu_kulutus_g: toinenVaadittu ? toinenKulutus : null,
      });
    } else {
      poistettavat.push(arvo);
    }
  }
  return { kaytossa, poistettavat };
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

  const { data, error } = await supabase.from("osat").insert(kentat).select("id").single();
  if (error || !data) {
    return { virhe: error?.message ?? "Osan luonti epäonnistui." };
  }

  const vaiheet = lueTyovaiheet(formData).map((v) => ({ ...v, osa_id: data.id }));
  const { error: vaiheVirhe } = await supabase.from("osa_tyovaiheet").insert(vaiheet);
  if (vaiheVirhe) {
    return { virhe: vaiheVirhe.message };
  }

  const kategoriaVirhe = await tallennaKategoriahinnat(supabase, data.id, formData);
  if (kategoriaVirhe) {
    return { virhe: kategoriaVirhe };
  }

  revalidatePath("/osat");
  redirect(`/osat/${data.id}`);
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

  const kategoriaVirhe = await tallennaKategoriahinnat(supabase, osaId, formData);
  if (kategoriaVirhe) {
    return { virhe: kategoriaVirhe };
  }

  revalidatePath("/osat");
  revalidatePath(`/osat/${osaId}`);
  return { virhe: null };
}

export async function asetaOsanAktiivisuus(osaId: string, aktiivinen: boolean) {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("osat").update({ aktiivinen }).eq("id", osaId);
  if (error) throw new Error(error.message);

  revalidatePath("/osat");
  revalidatePath(`/osat/${osaId}`);
}
