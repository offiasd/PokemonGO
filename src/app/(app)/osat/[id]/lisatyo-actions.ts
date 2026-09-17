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
    // Kaksoisnapautus ei saa kaatua uniikkirajoitteeseen: rasti on tila, ei
    // tapahtuma, ja saman tilan asettaminen uudestaan on onnistunut lopputulos.
    const { error } = await supabase
      .from("osa_lisatyot")
      .upsert(
        { osa_id: osaId, lisatyo_id: lisatyoId },
        { onConflict: "osa_id,lisatyo_id", ignoreDuplicates: true }
      );
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
  arvot: {
    teippausMin: number | null;
    maalausMin: number | null;
    lisakulutusG: number | null;
    hintaPerusvariEur: number | null;
    hintaErikoisvariEur: number | null;
  }
): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("osa_lisatyot")
    .update({
      teippaus_min: arvot.teippausMin === null ? null : Math.round(arvot.teippausMin),
      maalaus_min: arvot.maalausMin === null ? null : Math.round(arvot.maalausMin),
      lisakulutus_g: arvot.lisakulutusG,
      hinta_perusvari_eur: arvot.hintaPerusvariEur,
      hinta_erikoisvari_eur: arvot.hintaErikoisvariEur,
    })
    .eq("osa_id", osaId)
    .eq("lisatyo_id", lisatyoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/osat/${osaId}`);
}
