"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";

/**
 * Kalustorekisterin toiminnot.
 *
 * Poistoketju lasketaan kannan triggerissä, ei täällä. Ketju on vuosittainen
 * - tämän vuoden loppusaldo on ensi vuoden alkusaldo - joten yhden hankinnan
 * muutos siirtää kaikkia sitä seuraavia vuosia. Trigger takaa ettei laskelma
 * voi jäädä jälkeen riippumatta siitä mitä kautta kalustoa muutetaan, eikä
 * kutsujan tarvitse muistaa ajaa laskentaa.
 */

function paivita(): void {
  revalidatePath("/kulut/kalusto");
  revalidatePath("/kulut/tilikausi");
  // Pienhankintojen katto muuttuu kun rivi siirtyy kalustoon.
  revalidatePath("/kulut");
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

  paivita();
}

/**
 * Kalustorivin muokkaus.
 *
 * Hankintameno on ALV 0 %. Lomake kertoo sen kentän vieressä, koska se on
 * helppo syöttää bruttona: yritys ei ole ALV-rekisterissä, joten laskulla
 * lukeva summa sisältää veron eikä sitä näe missään muualla.
 */
export async function muokkaaKalusto(
  id: string,
  tiedot: {
    nimi: string;
    kuvaus: string | null;
    hankittu: string;
    hankintamenoEur: number;
    muistiinpano: string | null;
  }
): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("kalusto")
    .update({
      nimi: tiedot.nimi,
      kuvaus: tiedot.kuvaus,
      hankittu: tiedot.hankittu,
      hankintameno_eur: tiedot.hankintamenoEur,
      muistiinpano: tiedot.muistiinpano,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  paivita();
}

/**
 * Kalustorivin poisto.
 *
 * Kalustorivi on laskennan apuväline, ei tosite: sillä ei ole
 * säilytysvelvollisuutta, joten poisto saa olla lopullinen. Kuitilta tullut
 * rivi vie mukanaan vain kalustomerkinnän - kuitti ja sen rivi säilyvät, ja
 * rivin voi siirtää kalustoon uudelleen.
 */
export async function poistaKalusto(id: string): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("kalusto").delete().eq("id", id);
  if (error) throw new Error(error.message);

  paivita();
}

/** Luovutuksen peruminen: rivi palaa käytössä oleviin. */
export async function peruLuovutus(id: string): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("kalusto")
    .update({ luovutettu: null, luovutushinta_eur: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

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

/**
 * Luovutus, eli myynti tai muu luovutus.
 *
 * Luovutus ei ole poisto: myyty työkalu pysyy rekisterissä, ja sen
 * luovutushinta vähennetään luovutusvuoden menojäännöksestä (EVL 30 §).
 * Poistettu rivi taas katoaa laskennasta kokonaan.
 */
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
