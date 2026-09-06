/** Yhden kuukauden talousluvut etusivun kortille. */
export interface TalousKuukausi {
  /** 0 = tammikuu. */
  kuukausi: number;
  laskutettuEur: number;
  maalikustannusEur: number;
  kateEur: number;
  kulutusKg: number;
  tyot: number;
}

export type KatteenSuunta = "plus" | "miinus" | "tyhja";

/** Kaikki 12 kuukautta nollilla: tyhjä kuukausi on eri asia kuin puuttuva. */
export function tyhjatKuukaudet(): TalousKuukausi[] {
  return Array.from({ length: 12 }, (_, kuukausi) => ({
    kuukausi,
    laskutettuEur: 0,
    maalikustannusEur: 0,
    kateEur: 0,
    kulutusKg: 0,
    tyot: 0,
  }));
}

/**
 * Kuukaudella ei ole lainkaan tapahtumia.
 *
 * Tunnistetaan siitä että sekä laskutus että maalikustannus ovat nollassa:
 * plus tai miinus nollan edessä olisi harhaanjohtava.
 */
export function onTyhja(kuukausi: TalousKuukausi): boolean {
  return kuukausi.laskutettuEur === 0 && kuukausi.maalikustannusEur === 0;
}

export function katteenSuunta(kuukausi: TalousKuukausi): KatteenSuunta {
  if (onTyhja(kuukausi)) return "tyhja";
  return kuukausi.kateEur < 0 ? "miinus" : "plus";
}

/**
 * Kate etumerkillä.
 *
 * Miinusmerkki on U+2212 eikä yhdysmerkki: se on saman levyinen kuin plus,
 * joten summa ei hyppää sivusuunnassa kuukautta vaihdettaessa. Luvun ja
 * euromerkin välissä on sitova välilyönti (U+00A0), jottei summa katkea
 * riville kahtia.
 */
export function muotoileKateEtumerkilla(kuukausi: TalousKuukausi): string {
  const suunta = katteenSuunta(kuukausi);
  const luku = Math.abs(kuukausi.kateEur).toLocaleString("fi-FI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const etumerkki = suunta === "plus" ? "+" : suunta === "miinus" ? "−" : "";
  return `${etumerkki}${luku} €`;
}

/** "1 valmistunut työ" / "4 valmistunutta työtä" - yksikkö taipuu. */
export function tyomaaranTeksti(tyot: number): string {
  return tyot === 1 ? "1 valmistunut työ" : `${tyot} valmistunutta työtä`;
}

/**
 * Kuukausi, joka on valittuna kun vuosi avataan.
 *
 * Kuluvassa vuodessa kuluva kuukausi, muuten vuoden viimeinen kuukausi jossa on
 * dataa. Ei ensimmäinen eikä vilkkain: kuluva kuukausi on se, jota katsotaan
 * päivittäin, ja menneestä vuodesta kiinnostaa mihin asti töitä riitti.
 *
 * Jos vuodessa ei ole yhtään työtä, valinta menee joulukuuhun - luvut ovat
 * silloin joka tapauksessa nollia.
 */
export function oletusKuukausi(
  vuosi: number,
  nykyinenVuosi: number,
  nykyinenKuukausi: number,
  kuukaudet: TalousKuukausi[]
): number {
  if (vuosi === nykyinenVuosi) return nykyinenKuukausi;
  const viimeinenDatalla = [...kuukaudet].reverse().find((k) => !onTyhja(k));
  return viimeinenDatalla?.kuukausi ?? 11;
}

/**
 * Pylväiden yhteinen asteikko.
 *
 * Laskutus ja maalikustannus skaalataan samaan maksimiin: eri asteikot tekisivät
 * vertailusta valheellisen, koska maalikustannus näyttäisi laskutuksen
 * kokoiselta.
 */
export function suurinArvo(kuukaudet: TalousKuukausi[], nakyma: "euroa" | "tyot"): number {
  if (nakyma === "tyot") return Math.max(0, ...kuukaudet.map((k) => k.tyot));
  return Math.max(
    0,
    ...kuukaudet.map((k) => Math.max(k.laskutettuEur, k.maalikustannusEur))
  );
}
