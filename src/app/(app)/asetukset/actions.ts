"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import type { TyoVaihe } from "@/lib/supabase/database.types";
import { ajoneuvotyypinAvain } from "@/lib/vakiot";

export interface AsetuksetTila {
  virhe: string | null;
  viesti: string | null;
}

function parseNumero(formData: FormData, kentta: string): number {
  const arvo = Number(formData.get(kentta));
  return Number.isFinite(arvo) ? arvo : 0;
}

export async function paivitaAsetukset(
  _edellinenTila: AsetuksetTila,
  formData: FormData
): Promise<AsetuksetTila> {
  await vaaditaanAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("asetukset")
    .update({
      oletus_halytysraja_g: parseNumero(formData, "oletus_halytysraja_g"),
      tullimaksu_prosentti_oletus: parseNumero(formData, "tullimaksu_prosentti_oletus"),
      alv_prosentti_oletus: parseNumero(formData, "alv_prosentti_oletus"),
      kate_prosentti_oletus: parseNumero(formData, "kate_prosentti_oletus"),
      yleinen_tuntihinta: parseNumero(formData, "yleinen_tuntihinta"),
      nayta_hinnat_maalaajalle: formData.get("nayta_hinnat_maalaajalle") === "on",
      yrityksen_osoite: String(formData.get("yrityksen_osoite") ?? "").trim() || null,
      toimituskulu_per_kg_eu_oletus: parseNumero(formData, "toimituskulu_per_kg_eu_oletus"),
      toimituskulu_per_kg_usa_oletus: parseNumero(formData, "toimituskulu_per_kg_usa_oletus"),
      toimituskulu_per_kg_muu_oletus: parseNumero(formData, "toimituskulu_per_kg_muu_oletus"),
    })
    .eq("id", true);

  if (error) {
    return { virhe: error.message, viesti: null };
  }

  revalidatePath("/asetukset");
  return { virhe: null, viesti: "Asetukset tallennettu." };
}

export async function paivitaTuntiveloitus(vaihe: TyoVaihe, tuntihinta: number) {
  await vaaditaanAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("tuntiveloitukset")
    .upsert({ vaihe, tuntihinta }, { onConflict: "vaihe" });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/asetukset");
}

export async function poistaTuntiveloitusYlikirjoitus(vaihe: TyoVaihe) {
  await vaaditaanAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("tuntiveloitukset").delete().eq("vaihe", vaihe);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/asetukset");
}

/**
 * Ajoneuvotyyppien hallinta.
 *
 * Avain on osien viittaus ja osalistan osoiteparametri, joten se muodostetaan
 * nimestä kerran lisäyksessä eikä muutu enää: uudelleennimeäminen vaihtaa vain
 * näyttönimen. Poisto onnistuu vain jos tyyppiä ei käytetä missään osassa -
 * kanta estäisi sen viite-eheydellä, mutta virheteksti tulee tarkistuksesta
 * suomeksi ja kertoo montako osaa on kyseessä.
 */
export async function lisaaAjoneuvotyyppi(nimi: string) {
  await vaaditaanAdmin();
  const siistittyNimi = nimi.trim();
  if (!siistittyNimi) throw new Error("Anna ajoneuvotyypille nimi.");

  const avain = ajoneuvotyypinAvain(siistittyNimi);
  if (!avain) throw new Error("Nimestä ei saatu kelvollista tunnistetta - käytä kirjaimia.");

  const supabase = await createClient();
  const { data: suurin } = await supabase
    .from("ajoneuvotyypit")
    .select("jarjestys")
    .order("jarjestys", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("ajoneuvotyypit")
    .insert({ avain, nimi: siistittyNimi, jarjestys: (suurin?.jarjestys ?? 0) + 1 });
  if (error) {
    if (error.code === "23505") throw new Error("Samanniminen ajoneuvotyyppi on jo olemassa.");
    throw new Error(error.message);
  }

  revalidatePath("/asetukset");
  revalidatePath("/osat");
}

export async function nimeaAjoneuvotyyppi(avain: string, nimi: string) {
  await vaaditaanAdmin();
  const siistittyNimi = nimi.trim();
  if (!siistittyNimi) throw new Error("Anna ajoneuvotyypille nimi.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("ajoneuvotyypit")
    .update({ nimi: siistittyNimi })
    .eq("avain", avain);
  if (error) throw new Error(error.message);

  revalidatePath("/asetukset");
  revalidatePath("/osat");
}

export async function poistaAjoneuvotyyppi(avain: string) {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("osat")
    .select("id", { count: "exact", head: true })
    .eq("ajoneuvotyyppi", avain);
  if (count && count > 0) {
    throw new Error(
      `Tyyppi on käytössä ${count} osassa. Vaihda niiden ajoneuvotyyppi ensin.`
    );
  }

  const { error } = await supabase.from("ajoneuvotyypit").delete().eq("avain", avain);
  if (error) throw new Error(error.message);

  revalidatePath("/asetukset");
  revalidatePath("/osat");
}
