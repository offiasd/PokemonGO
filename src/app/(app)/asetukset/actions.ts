"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin, vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import type { Database, TyoVaihe } from "@/lib/supabase/database.types";
import { ajoneuvotyypinAvain } from "@/lib/vakiot";

export interface AsetuksetTila {
  virhe: string | null;
  viesti: string | null;
}

function parseNumero(formData: FormData, kentta: string): number {
  const arvo = Number(formData.get(kentta));
  return Number.isFinite(arvo) ? arvo : 0;
}

/**
 * Tallentaa vain ne asetukset jotka lomake lähetti.
 *
 * Asetukset on jaettu useaan lomakkeeseen eri välilehdille, joten koko rivin
 * ylikirjoittaminen nollaisi muiden välilehtien arvot. Valintakytkin ei lähetä
 * mitään pois päältä ollessaan, joten sen mukanaolo kerrotaan piilokentällä.
 */
export async function paivitaAsetukset(
  _edellinenTila: AsetuksetTila,
  formData: FormData
): Promise<AsetuksetTila> {
  await vaaditaanAdmin();

  const numerokentat = [
    "oletus_halytysraja_g",
    "tullimaksu_prosentti_oletus",
    "alv_prosentti_oletus",
    "kate_prosentti_oletus",
    "kate_prosentti_ei_eu_oletus",
    "yleinen_tuntihinta",
    "toimituskulu_per_kg_eu_oletus",
    "toimituskulu_per_kg_usa_oletus",
    "toimituskulu_per_kg_muu_oletus",
    "vastaanotto_varoitus_paivat",
    "vastaanotto_kriittinen_paivat",
  ] as const;

  type AsetusMuutos = Partial<Database["public"]["Tables"]["asetukset"]["Update"]>;
  const muutokset: AsetusMuutos = {};
  for (const kentta of numerokentat) {
    if (formData.has(kentta)) muutokset[kentta] = parseNumero(formData, kentta);
  }
  for (const kentta of ["yrityksen_osoite", "halytys_ilmoitus_sahkoposti", "halytys_ilmoitus_lahettaja"] as const) {
    if (formData.has(kentta)) {
      muutokset[kentta] = String(formData.get(kentta) ?? "").trim() || null;
    }
  }
  if (formData.has("nayta_hinnat_maalaajalle_lomakkeella")) {
    muutokset.nayta_hinnat_maalaajalle = formData.get("nayta_hinnat_maalaajalle") === "on";
  }
  if (formData.has("halytys_ilmoitukset_lomakkeella")) {
    muutokset.halytys_ilmoitukset_kaytossa = formData.get("halytys_ilmoitukset_kaytossa") === "on";
  }

  if (Object.keys(muutokset).length === 0) {
    return { virhe: "Ei tallennettavia muutoksia.", viesti: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("asetukset").update(muutokset).eq("id", true);

  if (error) {
    return { virhe: error.message, viesti: null };
  }

  revalidatePath("/asetukset", "layout");
  revalidatePath("/");
  revalidatePath("/varit");
  revalidatePath("/osat");
  revalidatePath("/tyot");
  return { virhe: null, viesti: "Asetukset tallennettu." };
}

/** Käyttäjän oma näyttönimi. Sähköpostia ja roolia ei voi muuttaa itse. */
export async function paivitaOmatTiedot(
  _edellinenTila: AsetuksetTila,
  formData: FormData
): Promise<AsetuksetTila> {
  const kayttaja = await vaaditaanKayttaja();
  const nimi = String(formData.get("full_name") ?? "").trim();
  if (!nimi) {
    return { virhe: "Nimi ei voi olla tyhjä.", viesti: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: nimi })
    .eq("id", kayttaja.id);

  if (error) {
    return { virhe: error.message, viesti: null };
  }

  revalidatePath("/asetukset", "layout");
  return { virhe: null, viesti: "Tiedot tallennettu." };
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

  revalidatePath("/asetukset", "layout");
}

export async function poistaTuntiveloitusYlikirjoitus(vaihe: TyoVaihe) {
  await vaaditaanAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("tuntiveloitukset").delete().eq("vaihe", vaihe);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/asetukset", "layout");
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
  if (!siistittyNimi) throw new Error("Anna osaryhmälle nimi.");

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
    if (error.code === "23505") throw new Error("Samanniminen osaryhmä on jo olemassa.");
    throw new Error(error.message);
  }

  revalidatePath("/asetukset", "layout");
  revalidatePath("/osat");
}

export async function nimeaAjoneuvotyyppi(avain: string, nimi: string) {
  await vaaditaanAdmin();
  const siistittyNimi = nimi.trim();
  if (!siistittyNimi) throw new Error("Anna osaryhmälle nimi.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("ajoneuvotyypit")
    .update({ nimi: siistittyNimi })
    .eq("avain", avain);
  if (error) throw new Error(error.message);

  revalidatePath("/asetukset", "layout");
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

  revalidatePath("/asetukset", "layout");
  revalidatePath("/osat");
}

/**
 * Resendin API-avain menee Vaultiin kannan puolelle, ei asetustauluun:
 * asetustaulun lukee kuka tahansa kirjautunut, ja avaimella saisi lähetettyä
 * postia lähettäjän nimissä. Avainta ei myöskään lueta koskaan takaisin -
 * käyttöliittymä näyttää vain onko se asetettu.
 */
export async function tallennaResendAvain(
  _edellinenTila: AsetuksetTila,
  formData: FormData
): Promise<AsetuksetTila> {
  await vaaditaanAdmin();
  const avain = String(formData.get("resend_avain") ?? "").trim();
  if (!avain) {
    return { virhe: "Anna API-avain.", viesti: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("aseta_resend_avain", { p_avain: avain });
  if (error) {
    return { virhe: error.message, viesti: null };
  }

  revalidatePath("/asetukset", "layout");
  return { virhe: null, viesti: "API-avain tallennettu." };
}

/** Lähettää testiviestin nykyisillä asetuksilla ja palauttaa kannan kuittauksen. */
export async function lahetaTestiviesti(): Promise<string> {
  await vaaditaanAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("laheta_halytys_testiviesti");
  if (error) throw new Error(error.message);
  revalidatePath("/asetukset", "layout");
  return data ?? "Lähetetty.";
}
