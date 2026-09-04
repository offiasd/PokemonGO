"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin, vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import type { PeruutuksenSyy, ToinenVariRooli } from "@/lib/supabase/database.types";

/**
 * Alennus on koko työn prosenttiosuus, joten se rajataan 0-100 väliin. Sama
 * rajaus on kannassa check-ehtona; tämä antaa siitä suomenkielisen virheen.
 */
function tarkistaAlennus(prosentti: number): number {
  if (!Number.isFinite(prosentti) || prosentti < 0 || prosentti > 100) {
    throw new Error("Alennuksen pitää olla 0-100 %.");
  }
  return Math.round(prosentti * 100) / 100;
}

export interface TyonRiviSyote {
  osaId: string;
  variId: string;
  kappalemaara: number;
  arvioituKulutusG: number;
  yksikkohintaEur: number;
  toinenVariId?: string | null;
  toinenVariRooli?: ToinenVariRooli | null;
  toinenArvioituKulutusG?: number | null;
  /** Kulutus ja hinta on säädetty käsin. */
  custom?: boolean;
  /** Custom-työn selite, esim. "50/50 vanteet". */
  kommentti?: string | null;
  /** Rivin kolmas ja sitä seuraavat värit, kukin omalla kulutuksellaan. */
  lisavarit?: { variId: string; arvioituKulutusG: number }[];
}

/**
 * Rivit korvaa_tyon_rivit-funktion odottamassa muodossa.
 *
 * Sekä uuden työn että muokkauksen rivit kulkevat saman funktion kautta: se
 * kirjoittaa rivit ja niiden lisävärit samassa transaktiossa, jolloin varaukset
 * eivät voi jäädä puolitiehen jos jokin rivi hylätään.
 */
function riviPayload(rivit: TyonRiviSyote[]) {
  return rivit.map((r) => ({
    osa_id: r.osaId,
    vari_id: r.variId,
    kappalemaara: r.kappalemaara,
    arvioitu_kulutus_g: r.arvioituKulutusG,
    yksikkohinta_eur: r.yksikkohintaEur,
    toinen_vari_id: r.toinenVariId ?? null,
    toinen_vari_rooli: r.toinenVariRooli ?? null,
    toinen_arvioitu_kulutus_g: r.toinenArvioituKulutusG ?? null,
    kommentti: r.kommentti ?? null,
    custom: r.custom ?? false,
    lisavarit: (r.lisavarit ?? []).map((l) => ({
      vari_id: l.variId,
      arvioitu_kulutus_g: l.arvioituKulutusG,
    })),
  }));
}

/**
 * Luo työn joko vastaanotetuksi tai suoraan maalaukseen.
 *
 * Vastaanotettu tarkoittaa että osat on tuotu maalaamolle ja työstä on sovittu,
 * mutta maalaus ei ole alkanut. Maali varataan molemmissa tapauksissa heti:
 * varaus syntyy rivitriggerissä, ja se on lupaus asiakkaalle ettei sovittua
 * väriä kuluteta toiseen työhön.
 */
export async function aloitaTyo(
  asiakas: string | null,
  rivit: TyonRiviSyote[],
  alennusProsentti = 0,
  tila: "vastaanotettu" | "vaiheessa" = "vaiheessa"
): Promise<string> {
  const kayttaja = await vaaditaanKayttaja();
  if (rivit.length === 0) {
    throw new Error("Lisää vähintään yksi osa työhön ennen aloitusta.");
  }
  const supabase = await createClient();

  const vastaanotettu = tila === "vastaanotettu";
  const { data: tyo, error: tyoVirhe } = await supabase
    .from("tyot")
    .insert({
      asiakas,
      tila,
      aloitti_id: vastaanotettu ? null : kayttaja.id,
      vastaanotti_id: kayttaja.id,
      tyo_aloitettu: vastaanotettu ? null : new Date().toISOString(),
      alennus_prosentti: tarkistaAlennus(alennusProsentti),
    })
    .select("id")
    .single();
  if (tyoVirhe || !tyo) {
    throw new Error(tyoVirhe?.message ?? "Työn aloitus epäonnistui.");
  }

  // Rivit kirjoitetaan samalla funktiolla kuin muokkauksessa: se osaa myös
  // rivien lisävärit, jotka tarvitsevat juuri luodun rivin id:n.
  const { error: riviVirhe } = await supabase.rpc("korvaa_tyon_rivit", {
    p_tyo_id: tyo.id,
    p_rivit: riviPayload(rivit),
  });
  if (riviVirhe) {
    // Siivotaan luotu työ, ettei jää rivittömiä "haamu"-töitä.
    await supabase.from("tyot").delete().eq("id", tyo.id);
    throw new Error(riviVirhe.message);
  }

  revalidatePath("/tyot");
  revalidatePath("/varit");
  revalidatePath("/");
  return tyo.id as string;
}

/**
 * Korvaa keskeneräisen työn rivit ja päivittää asiakastiedon.
 *
 * Rivit kulkevat kannan korvaa_tyon_rivit-funktion kautta, joka poistaa vanhat
 * ja lisää uudet samassa transaktiossa. Varaukset (varit.varattu_g) hoituvat
 * rivitriggerillä: poisto vapauttaa vanhan varauksen, lisäys tekee uuden. Näin
 * vaihdettu väri, muuttunut määrä ja poistettu osa vapauttavat vanhan varauksen
 * ilman erillistä laskentaa täällä.
 */
export async function paivitaTyo(
  tyoId: string,
  asiakas: string | null,
  rivit: TyonRiviSyote[],
  alennusProsentti = 0
): Promise<void> {
  await vaaditaanKayttaja();
  if (rivit.length === 0) {
    throw new Error("Työssä pitää olla vähintään yksi osa.");
  }
  const supabase = await createClient();

  const { data: tyo } = await supabase.from("tyot").select("tila").eq("id", tyoId).single();
  if (!tyo) throw new Error("Työtä ei löytynyt.");
  if (tyo.tila === "valmis") throw new Error("Valmista työtä ei voi muokata.");

  const { error: rpcVirhe } = await supabase.rpc("korvaa_tyon_rivit", {
    p_tyo_id: tyoId,
    p_rivit: riviPayload(rivit),
  });
  if (rpcVirhe) throw new Error(rpcVirhe.message);

  const { error: tyoVirhe } = await supabase
    .from("tyot")
    .update({ asiakas, alennus_prosentti: tarkistaAlennus(alennusProsentti) })
    .eq("id", tyoId);
  if (tyoVirhe) throw new Error(tyoVirhe.message);

  revalidatePath("/tyot");
  revalidatePath("/varit");
  revalidatePath("/");
}

export interface RiviPaivitys {
  riviId: string;
  toteutunutKulutusG: number;
  toinenToteutunutKulutusG?: number | null;
}

export async function merkitseTyoValmiiksi(
  tyoId: string,
  riviPaivitykset: RiviPaivitys[]
): Promise<void> {
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();

  for (const rp of riviPaivitykset) {
    const { error } = await supabase
      .from("tyon_rivit")
      .update({
        toteutunut_kulutus_g: rp.toteutunutKulutusG,
        toinen_toteutunut_kulutus_g: rp.toinenToteutunutKulutusG ?? null,
      })
      .eq("id", rp.riviId);
    if (error) throw new Error(error.message);
  }

  const { error: tyoVirhe } = await supabase
    .from("tyot")
    .update({
      tila: "valmis",
      valmistui_id: kayttaja.id,
      valmistunut: new Date().toISOString(),
    })
    .eq("id", tyoId);
  if (tyoVirhe) throw new Error(tyoVirhe.message);

  revalidatePath("/tyot");
  revalidatePath("/varit");
  revalidatePath("/");
}

/**
 * Peruu keskeneräisen työn syineen ja vapauttaa sen varaamat maalisaldot.
 *
 * Kaikki kirjautuneet saavat perua: työn aloitus ja muokkaus ovat samoin
 * kaikkien käytettävissä, ja virheellisen työn huomaa yleensä sen kirjaaja.
 * Valmista työtä ei peruta - sen maali on jo kulutettu varastosta.
 *
 * Syy kirjataan ja työ poistetaan kannan peru_tyo-funktiossa samassa
 * transaktiossa: erillisinä kutsuina lopputulos voisi jäädä puolitiehen, eli
 * lokiin perumaton työ tai perutu työ ilman syytä.
 */
export async function peruTyo(
  tyoId: string,
  syy: PeruutuksenSyy,
  tarkennus?: string | null
): Promise<void> {
  await vaaditaanKayttaja();
  const siistittyTarkennus = tarkennus?.trim() ?? "";
  if (syy === "muu" && siistittyTarkennus === "") {
    throw new Error("Kirjoita peruutuksen syy.");
  }
  const supabase = await createClient();

  const { error } = await supabase.rpc("peru_tyo", {
    p_tyo_id: tyoId,
    p_syy: syy,
    p_tarkennus: siistittyTarkennus === "" ? null : siistittyTarkennus,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/tyot");
  revalidatePath("/varit");
  revalidatePath("/");
}

/**
 * Palauttaa valmiin työn keskeneräiseksi.
 *
 * Tarkoitettu tilanteeseen jossa valmiiksi on painettu vahingossa liian
 * aikaisin, joten tämä on kaikkien kirjautuneiden käytettävissä kuten
 * valmiiksi merkitseminenkin. Kanta kumoaa kulutuksen: maali palaa varastoon
 * ja samalla takaisin varaukseen, koska työ jatkuu.
 */
export async function palautaTyoKeskeneraiseksi(tyoId: string): Promise<void> {
  await vaaditaanKayttaja();
  const supabase = await createClient();

  const { error } = await supabase.rpc("palauta_tyo_keskeneraiseksi", { p_tyo_id: tyoId });
  if (error) throw new Error(error.message);

  revalidatePath("/tyot");
  revalidatePath("/varit");
  revalidatePath("/");
}

/**
 * Poistaa valmiin työn ja palauttaa kulutetun maalin varastoon.
 *
 * Vain adminille: valmis työ on kirjanpitoa, ja poisto hävittää sen. Syy
 * kirjataan samaan peruutuslokiin kuin keskeneräisen työn peruminen.
 */
export async function poistaValmisTyo(
  tyoId: string,
  syy: PeruutuksenSyy,
  tarkennus?: string | null
): Promise<void> {
  await vaaditaanAdmin();
  const siistittyTarkennus = tarkennus?.trim() ?? "";
  if (syy === "muu" && siistittyTarkennus === "") {
    throw new Error("Kirjoita poiston syy.");
  }
  const supabase = await createClient();

  const { error } = await supabase.rpc("poista_valmis_tyo", {
    p_tyo_id: tyoId,
    p_syy: syy,
    p_tarkennus: siistittyTarkennus === "" ? null : siistittyTarkennus,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/tyot");
  revalidatePath("/varit");
  revalidatePath("/");
}

/**
 * Siirtää valmiin työn arkistoon. Värisaldoihin ei kosketa: maali on kulutettu
 * jo valmistuessa. Vain adminille, koska työ katoaa aktiivisesta listasta.
 */
export async function arkistoiTyo(tyoId: string): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("arkistoi_tyo", { p_tyo_id: tyoId });
  if (error) throw new Error(error.message);

  revalidatePath("/tyot");
}

/**
 * Siirtää vastaanotetun työn maalaukseen.
 *
 * Aloittaja merkitään vasta tässä: vastaanottaja ja maalaaja ovat usein eri
 * henkilö. Maali on jo varattu vastaanotettaessa, joten saldoihin ei kosketa.
 */
export async function aloitaVastaanotettuTyo(tyoId: string): Promise<void> {
  await vaaditaanKayttaja();
  const supabase = await createClient();

  const { error } = await supabase.rpc("aloita_vastaanotettu_tyo", { p_tyo_id: tyoId });
  if (error) throw new Error(error.message);

  revalidatePath("/tyot");
  revalidatePath("/");
}
