"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";

/**
 * Kalustorekisterin toiminnot.
 *
 * Jokainen kirjoitus laskee poistoketjun uudelleen kannassa. Ketju on
 * vuosittainen - tämän vuoden loppusaldo on ensi vuoden alkusaldo - joten
 * yhden hankinnan lisäys muuttaa kaikkia sitä seuraavia vuosia. Laskenta on
 * kannassa eikä täällä: sama luku kahdessa paikassa erkaantuisi ennemmin tai
 * myöhemmin.
 */

function paivita(): void {
  revalidatePath("/kulut/kalusto");
  revalidatePath("/kulut/tilikausi");
  // Pienhankintojen katto muuttuu kun rivi siirtyy kalustoon.
  revalidatePath("/kulut");
}

/** Vuosi jonka ketju lasketaan uudelleen, päättymispäivänä. */
function tilikaudenLoppu(paivays: string): string {
  return `${paivays.slice(0, 4)}-12-31`;
}

export async function lisaaKalusto(tiedot: {
  nimi: string;
  kuvaus: string | null;
  hankittu: string;
  hankintamenoEur: number;
  muistiinpano: string | null;
}): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("kalusto").insert({
    nimi: tiedot.nimi,
    kuvaus: tiedot.kuvaus,
    hankittu: tiedot.hankittu,
    hankintameno_eur: tiedot.hankintamenoEur,
    muistiinpano: tiedot.muistiinpano,
  });
  if (error) throw new Error(error.message);

  const { error: laskuVirhe } = await supabase.rpc("laske_poistolaskelmat", {
    p_tilikausi_paattyi: tilikaudenLoppu(tiedot.hankittu),
  });
  if (laskuVirhe) throw new Error(laskuVirhe.message);

  paivita();
}

/**
 * Kuitin rivi kalustoon.
 *
 * Hankintameno on ALV 0 %, ja kuitilla lukeva summa on brutto. Vero puretaan
 * kannassa rivin omalla verokannalla, samalla kaavalla kuin pienhankintojen
 * katossa - se on ainoa paikka jossa muunnos tehdään.
 */
export async function siirraRiviKalustoon(riviId: string, nimi: string | null): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("siirra_rivi_kalustoon", {
    p_rivi_id: riviId,
    p_nimi: nimi,
  });
  if (error) throw new Error(error.message);

  paivita();
}

export async function kirjaaLuovutus(
  kalustoId: string,
  luovutettu: string,
  luovutushintaEur: number
): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("kalusto")
    .update({ luovutettu, luovutushinta_eur: luovutushintaEur })
    .eq("id", kalustoId);
  if (error) throw new Error(error.message);

  const { error: laskuVirhe } = await supabase.rpc("laske_poistolaskelmat", {
    p_tilikausi_paattyi: tilikaudenLoppu(luovutettu),
  });
  if (laskuVirhe) throw new Error(laskuVirhe.message);

  paivita();
}

/**
 * Kirjanpitäjän ilmoittama todellinen poisto.
 *
 * Sovellus laskee vain enimmäismäärän: se ei tiedä mitä kirjanpidossa on
 * vähennetty, eikä verotuksessa saa vähentää enempää (EVL 54 §). Kun
 * toteutunut poikkeaa enimmäismäärästä, seuraavan vuoden alkusaldo on oikea
 * vasta kun se on kirjattu tänne.
 *
 * Null palauttaa enimmäismäärän käyttöön.
 */
export async function kirjaaToteutunutPoisto(
  vuosi: number,
  poistoEur: number | null,
  muistiinpano: string | null
): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("kirjaa_toteutunut_poisto", {
    p_tilikausi_paattyi: `${vuosi}-12-31`,
    p_poisto_eur: poistoEur,
    p_muistiinpano: muistiinpano,
  });
  if (error) throw new Error(error.message);

  paivita();
}

/** Laskee tilikauden laskelman, myös silloin kun sitä ei vielä ole. */
export async function laskePoistot(vuosi: number): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("laske_poistolaskelmat", {
    p_tilikausi_paattyi: `${vuosi}-12-31`,
  });
  if (error) throw new Error(error.message);

  paivita();
}
