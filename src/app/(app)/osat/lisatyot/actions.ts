"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";

/**
 * Lisätöiden katalogi.
 *
 * Hinta on kiinteä ja asetetaan erikseen kahdelle värikategorialle:
 * perusväri on solid (Solid / RAL), erikoisväri kaikki muut. Kategoria
 * ratkeaa lisätyölle valitusta väristä, ei osan kategoriasta.
 *
 * Ajat jäävät kirjattaviksi vaikka ne eivät enää tuota hintaa: niistä
 * rakennetaan myöhemmin jonojärjestelmä ajankäytön perusteella.
 */

export interface LisatyonTiedot {
  nimi: string;
  ryhma: string | null;
  teippausMin: number;
  maalausMin: number;
  lisakulutusG: number;
  hintaPerusvariEur: number;
  hintaErikoisvariEur: number;
  onJako: boolean;
  jarjestys: number;
}

function paivita(): void {
  revalidatePath("/osat/lisatyot");
  // Osan sivu näyttää saman katalogin periytyvine arvoineen.
  revalidatePath("/osat", "layout");
}

export async function lisaaLisatyo(tiedot: LisatyonTiedot): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("lisatyot").insert({
    nimi: tiedot.nimi,
    ryhma: tiedot.ryhma,
    teippaus_min: tiedot.teippausMin,
    maalaus_min: tiedot.maalausMin,
    lisakulutus_g: tiedot.lisakulutusG,
    hinta_perusvari_eur: tiedot.hintaPerusvariEur,
    hinta_erikoisvari_eur: tiedot.hintaErikoisvariEur,
    on_jako: tiedot.onJako,
    jarjestys: tiedot.jarjestys,
  });
  if (error) throw new Error(error.message);

  paivita();
}

export async function muokkaaLisatyo(id: string, tiedot: LisatyonTiedot): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("lisatyot")
    .update({
      nimi: tiedot.nimi,
      ryhma: tiedot.ryhma,
      teippaus_min: tiedot.teippausMin,
      maalaus_min: tiedot.maalausMin,
      lisakulutus_g: tiedot.lisakulutusG,
      hinta_perusvari_eur: tiedot.hintaPerusvariEur,
      hinta_erikoisvari_eur: tiedot.hintaErikoisvariEur,
      on_jako: tiedot.onJako,
      jarjestys: tiedot.jarjestys,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  paivita();
}

/**
 * Käytöstä poisto.
 *
 * Käytössä olevaa lisätyötä ei kannata poistaa vaan merkitä pois käytöstä:
 * silloin se katoaa uusien töiden valikoista mutta vanhat työt säilyttävät
 * hintansa. Poisto veisi rivin ja katkaisisi yhteyden.
 */
export async function asetaLisatyonTila(id: string, aktiivinen: boolean): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("lisatyot").update({ aktiivinen }).eq("id", id);
  if (error) throw new Error(error.message);

  paivita();
}

export async function poistaLisatyo(id: string): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("lisatyot").delete().eq("id", id);
  if (error) throw new Error(error.message);

  paivita();
}
