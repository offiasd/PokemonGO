"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin, vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import type { Alkupera, Kiiltotaso, MaaliTyyppi, Varisavy } from "@/lib/supabase/database.types";
import { MAALI_TYYPIT, varinLisavaatimus, varinVaatiiPohjavarin } from "@/lib/vakiot";

export interface VariLomakeTila {
  virhe: string | null;
  viesti?: string | null;
}

// Tyyppi on aina yksi kategorioista - luetaan lisäkategoria-checkboxit erikseen
// ja tallennetaan koko joukko (tyyppi + lisäkategoriat) vari_kategoriat-tauluun.
async function tallennaVarinKategoriat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  variId: string,
  formData: FormData,
  tyyppi: MaaliTyyppi
) {
  const kategoriat = new Set<MaaliTyyppi>([tyyppi]);
  for (const { arvo } of MAALI_TYYPIT) {
    if (formData.get(`lisakategoria_${arvo}`) === "on") {
      kategoriat.add(arvo);
    }
  }

  const { error: poistoVirhe } = await supabase
    .from("vari_kategoriat")
    .delete()
    .eq("vari_id", variId)
    .not("maali_tyyppi", "in", `(${[...kategoriat].join(",")})`);
  if (poistoVirhe) return poistoVirhe.message;

  const { error: upsertVirhe } = await supabase
    .from("vari_kategoriat")
    .upsert(
      [...kategoriat].map((maali_tyyppi) => ({ vari_id: variId, maali_tyyppi })),
      { onConflict: "vari_id,maali_tyyppi" }
    );
  if (upsertVirhe) return upsertVirhe.message;

  return null;
}

function lueKiiltotaso(formData: FormData): Kiiltotaso | null {
  const arvo = String(formData.get("kiiltotaso") ?? "");
  return arvo && arvo !== "ei_asetettu" ? (arvo as Kiiltotaso) : null;
}

function lueVarisavy(formData: FormData): Varisavy | null {
  const arvo = String(formData.get("varisavy") ?? "");
  return arvo && arvo !== "ei_asetettu" ? (arvo as Varisavy) : null;
}

function lueVariKentat(formData: FormData) {
  const tyhjaksiNumeroksi = (arvo: FormDataEntryValue | null) =>
    arvo === null || arvo === "" ? null : Number(arvo);
  const tyhjaksiTekstiksi = (arvo: FormDataEntryValue | null) =>
    String(arvo ?? "").trim() || null;

  const tyyppi = String(formData.get("tyyppi") ?? "solid") as MaaliTyyppi;

  return {
    nimi: String(formData.get("nimi") ?? "").trim(),
    valmistaja: tyhjaksiTekstiksi(formData.get("valmistaja")),
    alkupera: String(formData.get("alkupera") ?? "EU") as Alkupera,
    ostohinta_per_kg: Number(formData.get("ostohinta_per_kg") ?? 0),
    // Toimituskulu, tullimaksu ja ALV tulevat aina Asetukset-sivun arvoista:
    // null jättää ne SQL-funktion coalesce-oletuksille (vari_kokonaishinta).
    tullimaksu_prosentti: null,
    alv_prosentti: null,
    toimituskulu_per_kg: null,
    myyja_linkki: tyhjaksiTekstiksi(formData.get("myyja_linkki")),
    kuva_url: tyhjaksiTekstiksi(formData.get("kuva_url")),
    ohjeet: tyhjaksiTekstiksi(formData.get("ohjeet")),
    ohje_tiedosto_url: tyhjaksiTekstiksi(formData.get("ohje_tiedosto_url")),
    kiiltoaste: tyhjaksiTekstiksi(formData.get("kiiltoaste")),
    // Tyhjä kiiltotaso tarkoittaa "päättele kiiltoasteesta": kanta täyttää
    // sen triggerillä. Valittu taso jää voimaan sellaisenaan.
    kiiltotaso: lueKiiltotaso(formData),
    hakusanat: tyhjaksiTekstiksi(formData.get("hakusanat")),
    tyyppi,
    varisavy: lueVarisavy(formData),
    // Pohjavärivaatimus johdetaan maalityypistä, ei syötetä käsin.
    vaatii_pohjavarin: varinVaatiiPohjavarin(tyyppi),
    // Lakkausvaatimus sen sijaan on värikohtainen: kaikki saman kategorian
    // värit eivät sitä tarvitse, joten se tulee lomakkeen kytkimestä.
    vaatii_lakkauksen: formData.get("vaatii_lakkauksen") === "1",
    pohjavari_kuvaus: varinLisavaatimus(tyyppi),
    alkuperainen_hinta: tyhjaksiNumeroksi(formData.get("alkuperainen_hinta")),
    alkuperainen_valuutta: tyhjaksiTekstiksi(formData.get("alkuperainen_valuutta")),
    alkuperainen_yksikko: tyhjaksiTekstiksi(formData.get("alkuperainen_yksikko")),
    halytysraja_g: tyhjaksiNumeroksi(formData.get("halytysraja_g")),
    taysiraja_g: tyhjaksiNumeroksi(formData.get("taysiraja_g")),
  };
}

export async function luoVari(
  _edellinenTila: VariLomakeTila,
  formData: FormData
): Promise<VariLomakeTila> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const kentat = lueVariKentat(formData);
  if (!kentat.nimi) {
    return { virhe: "Nimi vaaditaan.", viesti: null };
  }

  const alkuSaldo = Number(formData.get("saldo_g") ?? 0);

  const { data, error } = await supabase
    .from("varit")
    .insert({ ...kentat, saldo_g: alkuSaldo })
    .select("id")
    .single();

  if (error || !data) {
    return { virhe: error?.message ?? "Värin luonti epäonnistui.", viesti: null };
  }

  const kategoriaVirhe = await tallennaVarinKategoriat(supabase, data.id, formData, kentat.tyyppi);
  if (kategoriaVirhe) {
    return { virhe: kategoriaVirhe, viesti: null };
  }

  revalidatePath("/varit");
  revalidatePath(`/varit/${data.id}`);
  return { virhe: null, viesti: "Väri tallennettu." };
}

export async function paivitaVari(
  variId: string,
  _edellinenTila: VariLomakeTila,
  formData: FormData
): Promise<VariLomakeTila> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const kentat = lueVariKentat(formData);
  if (!kentat.nimi) {
    return { virhe: "Nimi vaaditaan." };
  }

  const { error } = await supabase.from("varit").update(kentat).eq("id", variId);

  if (error) {
    return { virhe: error.message };
  }

  const kategoriaVirhe = await tallennaVarinKategoriat(supabase, variId, formData, kentat.tyyppi);
  if (kategoriaVirhe) {
    return { virhe: kategoriaVirhe };
  }

  revalidatePath("/varit");
  revalidatePath(`/varit/${variId}`);
  return { virhe: null, viesti: "Muutokset tallennettu." };
}

export async function asetaVarinAktiivisuus(variId: string, aktiivinen: boolean) {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("varit").update({ aktiivinen }).eq("id", variId);
  if (error) throw new Error(error.message);

  revalidatePath("/varit");
  revalidatePath(`/varit/${variId}`);
}

export async function lisaaVarastotayennys(variId: string, maaraG: number) {
  const kayttaja = await vaaditaanKayttaja();
  if (maaraG <= 0) throw new Error("Määrän tulee olla suurempi kuin 0.");

  const supabase = await createClient();
  const { error } = await supabase.from("varastotayennykset").insert({
    vari_id: variId,
    maara_g: maaraG,
    tyyppi: "taydennys",
    kayttaja_id: kayttaja.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/varit");
  revalidatePath(`/varit/${variId}`);
}

/**
 * Asettaa varastosaldon manuaalisesti (inventaario-oikaisu).
 *
 * Saldoa ei kirjoiteta suoraan yli vaan muutos kirjataan erotuksena samaan
 * historiaan kuin täydennykset. Näin saldo pysyy tapahtumien summana: jos
 * maalaustapahtuma osuu samaan hetkeen, se ei katoa oikaisun alle, ja
 * muutoksesta jää jälki.
 */
export async function korjaaSaldo(variId: string, uusiSaldoG: number) {
  const kayttaja = await vaaditaanKayttaja();
  if (!Number.isFinite(uusiSaldoG) || uusiSaldoG < 0) {
    throw new Error("Saldon tulee olla vähintään 0.");
  }

  const supabase = await createClient();
  const { data: vari } = await supabase
    .from("varit")
    .select("saldo_g")
    .eq("id", variId)
    .single();

  if (!vari) throw new Error("Väriä ei löytynyt.");

  // Sama tarkkuus kuin kannan numeric(12, 2), jottei liukulukujen pyöristys
  // jätä nollan suuruista muutosta joka rikkoisi maara_g <> 0 -ehdon.
  const erotus = Math.round((uusiSaldoG - vari.saldo_g) * 100) / 100;
  if (erotus === 0) {
    throw new Error("Saldo on jo tämä - ei muutettavaa.");
  }

  const { error } = await supabase.from("varastotayennykset").insert({
    vari_id: variId,
    maara_g: erotus,
    tyyppi: "korjaus",
    kayttaja_id: kayttaja.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/varit");
  revalidatePath(`/varit/${variId}`);
}
