/**
 * Työn alennus.
 *
 * Alennus voi olla prosentti välisummasta, kiinteä euromäärä tai molemmat:
 * "kymmenen prosenttia ja pyöristetään vielä kahdellakympillä alas" on
 * maalaamolla tavallinen kauppa. Prosentti lasketaan aina välisummasta, ei
 * euroalennuksella pienennetystä summasta - muuten sama kauppa antaisi eri
 * loppusumman sen mukaan kummassa järjestyksessä alennukset kirjataan.
 *
 * Puhdas moduuli ilman kantayhteyttä, koska samaa laskentaa tarvitaan työn
 * lomakkeella, työlistassa, historiassa ja käyttäjäsivulla. Kanta laskee saman
 * luvun tyojen_talous-näkymässä; kaava on pidettävä siellä ja täällä samana.
 */

/** Alennuksen osuus euroina ja sen jälkeinen loppusumma. */
export interface AlennuksenTulos {
  /** Alennus yhteensä euroina: prosenttiosuus + kiinteä summa. */
  alennusEur: number;
  /** Välisumma alennuksen jälkeen. Ei koskaan negatiivinen. */
  loppusumma: number;
}

function pyorista(arvo: number): number {
  return Math.round(arvo * 100) / 100;
}

/**
 * Alennus välisummasta.
 *
 * Tyhjä kenttä ja roskasyöte tarkoittavat molemmat "ei alennusta": prosentti
 * rajataan välille 0-100 ja euromäärä nollaan tai sen yli. Yhteensä alennus
 * ei voi ylittää välisummaa, jottei työstä tule negatiivista laskua.
 */
export function laskeAlennus(
  valisummaEur: number,
  prosentti: number,
  summaEur: number
): AlennuksenTulos {
  const valisumma = Number.isFinite(valisummaEur) ? valisummaEur : 0;
  const p = Math.min(Math.max(Number.isFinite(prosentti) ? prosentti : 0, 0), 100);
  const kiintea = Math.max(Number.isFinite(summaEur) ? summaEur : 0, 0);
  const alennusEur = Math.min(pyorista(pyorista((valisumma * p) / 100) + kiintea), pyorista(valisumma));
  return { alennusEur, loppusumma: pyorista(valisumma - alennusEur) };
}
