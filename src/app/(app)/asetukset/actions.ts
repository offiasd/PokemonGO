"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import type { TyoVaihe } from "@/lib/supabase/database.types";

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
