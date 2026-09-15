"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";

/**
 * Osan lisätyöt.
 *
 * Rivin olemassaolo osa_lisatyot-taulussa = lisätyö on mahdollinen osalle.
 * Sarakkeen null-arvo = arvo periytyy katalogista. Periytymissääntö on
 * kannan osan_lisatyot-funktiossa, ei täällä.
 */

export async function asetaOsanLisatyo(
  osaId: string,
  lisatyoId: string,
  valittu: boolean
): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  if (valittu) {
    const { error } = await supabase
      .from("osa_lisatyot")
      .insert({ osa_id: osaId, lisatyo_id: lisatyoId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("osa_lisatyot")
      .delete()
      .eq("osa_id", osaId)
      .eq("lisatyo_id", lisatyoId);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/osat/${osaId}`);
  revalidatePath("/osat/lisatyot");
}

export async function paivitaOsanLisatyonArvot(
  osaId: string,
  lisatyoId: string,
  arvot: { teippausMin: number | null; maalausMin: number | null; lisakulutusG: number | null }
): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("osa_lisatyot")
    .update({
      teippaus_min: arvot.teippausMin === null ? null : Math.round(arvot.teippausMin),
      maalaus_min: arvot.maalausMin === null ? null : Math.round(arvot.maalausMin),
      lisakulutus_g: arvot.lisakulutusG,
    })
    .eq("osa_id", osaId)
    .eq("lisatyo_id", lisatyoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/osat/${osaId}`);
}
