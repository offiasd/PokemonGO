/** Etusivun yhteenvedon aikavälit. Jaettu tiedosto, koska sekä palvelinsivu
 * että valintapainikkeet tarvitsevat samat arvot. */
export const JAKSOT = [
  { arvo: "viikko", nimi: "Viikko" },
  { arvo: "kuukausi", nimi: "Kuukausi" },
  { arvo: "vuosi", nimi: "Vuosi" },
  { arvo: "kaikki", nimi: "Kaikki" },
] as const;

export const OLETUSJAKSO = "kuukausi";

export function jaksonNimi(arvo: string): string {
  if (arvo === "viikko") return "Viimeiset 7 vrk";
  if (arvo === "vuosi") return "Viimeiset 12 kk";
  if (arvo === "kaikki") return "Kaikki ajat";
  return "Viimeiset 30 vrk";
}

/** Jakson alkuhetki, tai null kun rajausta ei ole. */
export function jaksonAlku(arvo: string, nyt: Date = new Date()): Date | null {
  const paivat = arvo === "viikko" ? 7 : arvo === "vuosi" ? 365 : arvo === "kaikki" ? null : 30;
  if (paivat === null) return null;
  return new Date(nyt.getTime() - paivat * 24 * 60 * 60 * 1000);
}
