"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
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
}

export async function aloitaTyo(
  asiakas: string | null,
  rivit: TyonRiviSyote[],
  alennusProsentti = 0
): Promise<string> {
  const kayttaja = await vaaditaanKayttaja();
  if (rivit.length === 0) {
    throw new Error("Lisää vähintään yksi osa työhön ennen aloitusta.");
  }
  const supabase = await createClient();

  const { data: tyo, error: tyoVirhe } = await supabase
    .from("tyot")
    .insert({
      asiakas,
      aloitti_id: kayttaja.id,
      alennus_prosentti: tarkistaAlennus(alennusProsentti),
    })
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
