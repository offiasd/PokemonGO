"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin, vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import type { Alkupera, MaaliTyyppi } from "@/lib/supabase/database.types";

export interface VariLomakeTila {
  virhe: string | null;
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
