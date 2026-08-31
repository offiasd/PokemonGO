"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin, vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import type { Alkupera, MaaliTyyppi } from "@/lib/supabase/database.types";
import { MAALI_TYYPIT } from "@/lib/vakiot";

export interface VariLomakeTila {
  virhe: string | null;
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

function lueVariKentat(formData: FormData) {
  const tyhjaksiNumeroksi = (arvo: FormDataEntryValue | null) =>
    arvo === null || arvo === "" ? null : Number(arvo);
  const tyhjaksiTekstiksi = (arvo: FormDataEntryValue | null) =>
    String(arvo ?? "").trim() || null;

  return {
    nimi: String(formData.get("nimi") ?? "").trim(),
    valmistaja: tyhjaksiTekstiksi(formData.get("valmistaja")),
    alkupera: String(formData.get("alkupera") ?? "EU") as Alkupera,
    ostohinta_per_kg: Number(formData.get("ostohinta_per_kg") ?? 0),
    tullimaksu_prosentti: tyhjaksiNumeroksi(formData.get("tullimaksu_prosentti")),
    alv_prosentti: tyhjaksiNumeroksi(formData.get("alv_prosentti")),
    toimituskulu_per_kg: tyhjaksiNumeroksi(formData.get("toimituskulu_per_kg")),
    hintalisa_prosentti: Number(formData.get("hintalisa_prosentti") ?? 0),
    myyja_linkki: tyhjaksiTekstiksi(formData.get("myyja_linkki")),
    kuva_url: tyhjaksiTekstiksi(formData.get("kuva_url")),
    ohjeet: tyhjaksiTekstiksi(formData.get("ohjeet")),
    ohje_tiedosto_url: tyhjaksiTekstiksi(formData.get("ohje_tiedosto_url")),
    kiiltoaste: tyhjaksiTekstiksi(formData.get("kiiltoaste")),
    tyyppi: String(formData.get("tyyppi") ?? "solid") as MaaliTyyppi,
    vaatii_pohjavarin: formData.get("vaatii_pohjavarin") === "on",
    pohjavari_kuvaus: tyhjaksiTekstiksi(formData.get("pohjavari_kuvaus")),
    alkuperainen_hinta: tyhjaksiNumeroksi(formData.get("alkuperainen_hinta")),
    alkuperainen_valuutta: tyhjaksiTekstiksi(formData.get("alkuperainen_valuutta")),
    alkuperainen_yksikko: tyhjaksiTekstiksi(formData.get("alkuperainen_yksikko")),
    halytysraja_g: tyhjaksiNumeroksi(formData.get("halytysraja_g")),
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
    return { virhe: "Nimi vaaditaan." };
  }

  const alkuSaldo = Number(formData.get("saldo_g") ?? 0);

  const { data, error } = await supabase
    .from("varit")
    .insert({ ...kentat, saldo_g: alkuSaldo })
    .select("id")
    .single();

  if (error || !data) {
    return { virhe: error?.message ?? "Värin luonti epäonnistui." };
  }

  const kategoriaVirhe = await tallennaVarinKategoriat(supabase, data.id, formData, kentat.tyyppi);
  if (kategoriaVirhe) {
    return { virhe: kategoriaVirhe };
  }

  revalidatePath("/varit");
  redirect(`/varit/${data.id}`);
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
  return { virhe: null };
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
    kayttaja_id: kayttaja.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/varit");
  revalidatePath(`/varit/${variId}`);
}
