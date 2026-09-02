"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import type { ToinenVariRooli } from "@/lib/supabase/database.types";

export interface TyonRiviSyote {
  osaId: string;
  variId: string;
  kappalemaara: number;
  arvioituKulutusG: number;
  yksikkohintaEur: number;
  toinenVariId?: string | null;
  toinenVariRooli?: ToinenVariRooli | null;
  toinenArvioituKulutusG?: number | null;
}

export async function aloitaTyo(asiakas: string | null, rivit: TyonRiviSyote[]): Promise<string> {
  const kayttaja = await vaaditaanKayttaja();
  if (rivit.length === 0) {
    throw new Error("Lisää vähintään yksi osa työhön ennen aloitusta.");
  }
  const supabase = await createClient();

  const { data: tyo, error: tyoVirhe } = await supabase
    .from("tyot")
    .insert({ asiakas, aloitti_id: kayttaja.id })
    .select("id")
    .single();
  if (tyoVirhe || !tyo) {
    throw new Error(tyoVirhe?.message ?? "Työn aloitus epäonnistui.");
  }

  const { error: riviVirhe } = await supabase.from("tyon_rivit").insert(
    rivit.map((r) => ({
      tyo_id: tyo.id,
      osa_id: r.osaId,
      vari_id: r.variId,
      kappalemaara: r.kappalemaara,
      arvioitu_kulutus_g: r.arvioituKulutusG,
      yksikkohinta_eur: r.yksikkohintaEur,
      toinen_vari_id: r.toinenVariId ?? null,
      toinen_vari_rooli: r.toinenVariRooli ?? null,
      toinen_arvioitu_kulutus_g: r.toinenArvioituKulutusG ?? null,
    }))
  );
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
  rivit: TyonRiviSyote[]
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
    p_rivit: rivit.map((r) => ({
      osa_id: r.osaId,
      vari_id: r.variId,
      kappalemaara: r.kappalemaara,
      arvioitu_kulutus_g: r.arvioituKulutusG,
      yksikkohinta_eur: r.yksikkohintaEur,
      toinen_vari_id: r.toinenVariId ?? null,
      toinen_vari_rooli: r.toinenVariRooli ?? null,
      toinen_arvioitu_kulutus_g: r.toinenArvioituKulutusG ?? null,
    })),
  });
  if (rpcVirhe) throw new Error(rpcVirhe.message);

  const { error: tyoVirhe } = await supabase.from("tyot").update({ asiakas }).eq("id", tyoId);
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
 * Peruu keskeneräisen työn ja vapauttaa sen varaamat maalisaldot.
 *
 * Kaikki kirjautuneet saavat perua: työn aloitus ja muokkaus ovat samoin
 * kaikkien käytettävissä, ja virheellisen työn huomaa yleensä sen kirjaaja.
 * Valmista työtä ei peruta - sen maali on jo kulutettu varastosta - ja saman
 * rajauksen tekee myös kannan rivitason käytäntö.
 */
export async function peruTyo(tyoId: string): Promise<void> {
  await vaaditaanKayttaja();
  const supabase = await createClient();

  const { data: tyo } = await supabase.from("tyot").select("tila").eq("id", tyoId).single();
  if (tyo?.tila === "valmis") {
    throw new Error("Valmista työtä ei voi perua.");
  }

  const { error } = await supabase.from("tyot").delete().eq("id", tyoId);
  if (error) throw new Error(error.message);

  revalidatePath("/tyot");
  revalidatePath("/varit");
}
