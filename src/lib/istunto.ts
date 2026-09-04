/**
 * Kirjautumisen muistaminen laitekohtaisesti.
 *
 * Supabase kirjoittaa istuntoevästeet oletuksena pitkäikäisinä riippumatta
 * siitä, onko kone oma vai maalaamon yhteiskäytössä. "Muista minut" antaa
 * valinnan takaisin käyttäjälle: valittuna eväste elää 30 päivää ja uusiutuu
 * jokaisella käynnillä, valitsematta siitä tulee istuntoeväste joka katoaa kun
 * selain suljetaan.
 *
 * Valinta tallennetaan omaan evästeeseensä, koska istunnon uusiminen tapahtuu
 * myöhemmillä pyynnöillä eikä kirjautumislomake ole silloin enää mukana.
 */

/** Valinnan muistava eväste. Ei sisällä salaisuuksia, vain "1" tai "0". */
export const MUISTA_EVASTE = "jm-muista";

export const MUISTA_PAIVAT = 30;
const MUISTA_MAX_AGE = MUISTA_PAIVAT * 24 * 60 * 60;

/** Oletus on muistaa: maalaamon oma väki kirjautuu samalta laitteelta joka päivä. */
export function lueMuista(evasteenArvo: string | undefined): boolean {
  return evasteenArvo !== "0";
}

type EvasteAsetukset = {
  maxAge?: number;
  expires?: Date;
  [avain: string]: unknown;
};

/**
 * Asettaa evästeelle elinajan valinnan mukaan.
 *
 * maxAge 0 tarkoittaa evästeen poistoa (Supabase siivoaa vanhoja paloja
 * uloskirjautuessa), joten sitä ei kosketa - muuten poistettu eväste jäisi
 * voimaan ja istunto eläisi uudelleen.
 */
export function evasteenElinaika<T extends EvasteAsetukset>(asetukset: T, muista: boolean): T {
  if (asetukset.maxAge === 0) return asetukset;
  if (muista) return { ...asetukset, maxAge: MUISTA_MAX_AGE, expires: undefined };
  // Istuntoeväste syntyy jättämällä sekä maxAge että expires pois.
  const istunto = { ...asetukset };
  delete istunto.maxAge;
  delete istunto.expires;
  return istunto;
}

/** Valintaevästeen omat asetukset - se elää yhtä kauan kuin istuntokin. */
export function muistaEvasteenAsetukset(muista: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    ...(muista ? { maxAge: MUISTA_MAX_AGE } : {}),
  };
}
