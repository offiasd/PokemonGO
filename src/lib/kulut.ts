/**
 * Kuittien luokittelu ja kulujen laskenta.
 *
 * Sovellus kysyy mihin ostos meni, ei mikä on sen verokohtelu. Kirjanpitäjä
 * ratkaisee kohtelun, jolloin sovellus pysyy oikeassa vaikka verosäännöt
 * muuttuvat - ja ne muuttuvat: yleinen kanta nousi 24 %:sta 25,5 %:iin 2024,
 * kymmenen prosentin ryhmä 14 %:iin 2025 ja alennettu 13,5 %:iin 2026.
 */

import type { Kayttotarkoitus } from "@/lib/supabase/database.types";

export type { Kayttotarkoitus };

export interface KayttotarkoituksenTiedot {
  arvo: Kayttotarkoitus;
  nimi: string;
  /** Vihje kirjanpitäjän ratkaisusta - ei verotuspäätös. */
  vihje: string | null;
}

export const KAYTTOTARKOITUKSET: KayttotarkoituksenTiedot[] = [
  { arvo: "yrityksen_tarvike", nimi: "Yrityksen tarvike", vihje: null },
  {
    arvo: "edustus",
    nimi: "Edustus",
    vihje: "Tuloverotuksessa 50 %, alv-vähennystä rajoitettu (AVL 114 §).",
  },
  { arvo: "yksityisotto", nimi: "Yksityisotto", vihje: "Ei yrityksen kulu." },
  {
    arvo: "henkilokunnan_tarjoilu",
    nimi: "Henkilökunnan tarjoilu",
    vihje: "Koskee työntekijöitä, ei yrittäjää itseään.",
  },
];

export function kayttotarkoituksenNimi(arvo: Kayttotarkoitus): string {
  return KAYTTOTARKOITUKSET.find((k) => k.arvo === arvo)?.nimi ?? arvo;
}

/** Rivit, jotka lasketaan yrityksen kuluksi. Yksityisotto ei ole kulu. */
export const KULUKSI_LASKETTAVAT: Kayttotarkoitus[] = [
  "yrityksen_tarvike",
  "edustus",
  "henkilokunnan_tarjoilu",
];

/**
 * Käytettävissä olevat käyttötarkoitukset yritysmuodon mukaan.
 *
 * Toiminimiyrittäjä ei ole oman itsensä työnantaja eikä voi järjestää
 * itselleen luontoisetuja: omat työpäivän ateriat ovat elantomenoja ja rahan
 * ottaminen omaan käyttöön yksityisotto. Siksi henkilökunnan tarjoilu on
 * valittavissa vasta kun työntekijöitä on tai yritysmuoto on osakeyhtiö.
 */
export function kaytettavatKayttotarkoitukset(asetukset: {
  yritysmuoto: string;
  tyontekijoita: boolean;
}): KayttotarkoituksenTiedot[] {
  const tarjoiluKaytossa = asetukset.tyontekijoita || asetukset.yritysmuoto === "oy";
  return KAYTTOTARKOITUKSET.filter(
    (k) => k.arvo !== "henkilokunnan_tarjoilu" || tarjoiluKaytossa
  );
}

/**
 * Rivin tekstin avain oppimista varten.
 *
 * Kuittien rivinimet ovat lyhenteitä ja katkaistuja, ja sama tuote kirjoittuu
 * eri kuiteissa eri tavalla isoin ja pienin kirjaimin. Avain normalisoidaan,
 * jotta "TEIPPI 50MM" ja "Teippi  50mm" ovat sama asia.
 */
export function opinAvain(teksti: string): string {
  return teksti.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Avainsanat, joiden perusteella rivi esitäytetään. */
const ESITAYTOT: { sanat: RegExp; kayttotarkoitus: Kayttotarkoitus; luokka: string | null }[] = [
  // Ruoka ja juoma ovat elantomenoja - toiminimellä yksityisotto.
  {
    sanat:
      /\b(kahvi|tee|maito|leip|voi|juusto|makkara|eines|patukk|suklaa|karkki|makeis|limsa|limu|virvoit|juoma|vesipull|pizza|hampurilai|lounas|ruoka|hedelm|banaani|omena|jogurtti|keksi|pulla|sipsi)/i,
    kayttotarkoitus: "yksityisotto",
    luokka: null,
  },
  // Ajoneuvo on yksityisvarallisuutta, joten polttoaine ei ole yrityksen kulu.
  {
    sanat: /\b(bensa|bensiin|diesel|polttoain|tankkaus|95e10|98e5)/i,
    kayttotarkoitus: "yksityisotto",
    luokka: null,
  },
  {
    sanat: /\b(teippi|maskausteippi|pahvi|laatikko|kupla|muovikalvo|pakkaus|nippuside|vaahtomuovi)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Pakkaus ja lähetys",
  },
  {
    sanat: /\b(posti|rahti|lahetys|lähetys|matkahuolto|toimitusmaksu|toimituskulu|noutopiste)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Pakkaus ja lähetys",
  },
  {
    sanat: /\b(alumiinioksid|puhallusaine|hiekkapuhall|lasikuula|hiomapaper|hiomalaikk|hioma)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Puhallusaine ja hiomatarvikkeet",
  },
  {
    sanat: /\b(pesuain|liuotin|asetoni|tinneri|rasvanpoist|kemikaal|happo|emäs|puhdistusain)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Kemikaalit ja pesuaineet",
  },
  {
    sanat: /\b(maali|jauhemaal|lakka|pohjamaal|powder)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Maalit ja lakat",
  },
  {
    sanat:
      /\b(työkalu|tyokalu|pihdit|ruuvimeisse|avainsarj|poranter|akkupora|hiomakone|kompressor|letku|laite)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Työkalut ja laitteet",
  },
  {
    sanat: /\b(hanska|käsine|kasine|hengityssuoja|suojalas|maski|haalari|työvaate|tyovaate|suojain)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Suojaimet ja työvaatteet",
  },
  {
    sanat: /\b(nestekaasu|propaani|kaasupullo|sähkö|sahko|energia)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Energia ja kaasu",
  },
  {
    sanat: /\b(toimisto|kynä|paperi|tulostin|muste|ohjelmist|lisenssi|tilaus)/i,
    kayttotarkoitus: "yrityksen_tarvike",
    luokka: "Toimisto ja ohjelmistot",
  },
];

export interface Esitaytto {
  kayttotarkoitus: Kayttotarkoitus;
  /** Kululuokan nimi, jos avainsana viittaa selvästi yhteen. */
  luokka: string | null;
  /** Mistä ehdotus tulee: opittu voittaa avainsanan. */
  lahde: "opittu" | "avainsana";
}

/**
 * Rivin esitäyttö.
 *
 * Aiemmin luokiteltu teksti voittaa avainsanat: käyttäjän oma päätös on
 * parempi tieto kuin sanalista. Kumpikin on ehdotus, jonka käyttäjä vahvistaa.
 */
export function ehdotaLuokittelu(
  teksti: string,
  opitut: Map<string, { kayttotarkoitus: Kayttotarkoitus; luokka: string | null }>
): Esitaytto | null {
  const opittu = opitut.get(opinAvain(teksti));
  if (opittu) {
    return { kayttotarkoitus: opittu.kayttotarkoitus, luokka: opittu.luokka, lahde: "opittu" };
  }
  const osuma = ESITAYTOT.find((e) => e.sanat.test(teksti));
  return osuma
    ? { kayttotarkoitus: osuma.kayttotarkoitus, luokka: osuma.luokka, lahde: "avainsana" }
    : null;
}

// ---------------------------------------------------------------------------
// Summat ja rajat
// ---------------------------------------------------------------------------

/** Yksittäisen pienhankinnan yläraja, veroton hinta. */
export const PIENHANKINNAN_RAJA_EUR = 1200;
/** Pienhankintojen vuosikatto, veroton hinta. */
export const PIENHANKINTAKATTO_EUR = 3600;
/** Liikevaihdon raja, jonka ylittyessä ALV-rekisteröinti tulee pakolliseksi. */
export const ALV_REKISTEROINNIN_RAJA_EUR = 20000;

/**
 * Bruttohinnasta veroton hinta.
 *
 * Pienhankintojen raja lasketaan verottomista hinnoista. Bruttosummalla
 * laskuri näyttäisi katon täyttyvän liian aikaisin: 1 200 € verotonta on
 * 25,5 %:n kannalla noin 1 506 € brutto.
 */
export function nettohinta(bruttoEur: number, verokanta: number | null): number {
  if (!verokanta || verokanta <= 0) return bruttoEur;
  return Math.round((bruttoEur / (1 + verokanta / 100)) * 100) / 100;
}

export interface KuitinRivi {
  brutto_eur: number;
  verokanta: number | null;
  kayttotarkoitus: Kayttotarkoitus | null;
}

/** Rivien summa yrityksen kuluina. Yksityisotot ja luokittelemattomat pois. */
export function kuluinaYhteensa(rivit: KuitinRivi[]): number {
  const summa = rivit
    .filter((r) => r.kayttotarkoitus && KULUKSI_LASKETTAVAT.includes(r.kayttotarkoitus))
    .reduce((s, r) => s + r.brutto_eur, 0);
  return Math.round(summa * 100) / 100;
}

/** Rivien summa kokonaisuudessaan, täsmäytystä varten. */
export function riviteYhteensa(rivit: KuitinRivi[]): number {
  return Math.round(rivit.reduce((s, r) => s + r.brutto_eur, 0) * 100) / 100;
}

export interface Tasmays {
  tasmaa: boolean;
  riviteYhteensa: number;
  erotus: number;
}

/**
 * Täsmääkö rivien summa kuitin loppusummaan.
 *
 * Sentin heitto sallitaan: kuiteissa pyöristetään rivikohtaisesti, ja yhden
 * sentin ero ei tarkoita että kuitti olisi luettu väärin.
 */
export function tarkistaTasmays(loppusummaEur: number, rivit: KuitinRivi[]): Tasmays {
  const summa = riviteYhteensa(rivit);
  const erotus = Math.round((summa - loppusummaEur) * 100) / 100;
  return { tasmaa: Math.abs(erotus) <= 0.01, riviteYhteensa: summa, erotus };
}

export interface Pienhankinta {
  /** Verottomien pienhankintojen summa vuodelta. */
  kaytettyEur: number;
  /** Kuinka lähellä 3 600 euron kattoa ollaan, 0-1. */
  osuus: number;
  /** Ostokset, jotka ylittävät 1 200 euron rajan eivätkä siis ole pienhankintoja. */
  ylisuuret: { teksti: string; nettoEur: number }[];
}

/**
 * Pienhankintojen juokseva summa.
 *
 * Yli 1 200 euron ostos ei ole pienhankinta vaan poistettavaa kalustoa, joten
 * se jää katon ulkopuolelle ja nostetaan erikseen esiin.
 */
export function laskePienhankinnat(
  rivit: { teksti: string; brutto_eur: number; verokanta: number | null; kayttotarkoitus: Kayttotarkoitus | null }[]
): Pienhankinta {
  const yrityksen = rivit.filter(
    (r) => r.kayttotarkoitus && KULUKSI_LASKETTAVAT.includes(r.kayttotarkoitus)
  );
  const netot = yrityksen.map((r) => ({
    teksti: r.teksti,
    nettoEur: nettohinta(r.brutto_eur, r.verokanta),
  }));
  const ylisuuret = netot.filter((n) => n.nettoEur > PIENHANKINNAN_RAJA_EUR);
  const kaytetty = netot
    .filter((n) => n.nettoEur <= PIENHANKINNAN_RAJA_EUR)
    .reduce((s, n) => s + n.nettoEur, 0);
  const pyoristetty = Math.round(kaytetty * 100) / 100;
  return {
    kaytettyEur: pyoristetty,
    osuus: Math.min(1, pyoristetty / PIENHANKINTAKATTO_EUR),
    ylisuuret,
  };
}

/**
 * Kaksoiskappaleiden tunnistus.
 *
 * Sama ostos voi tulla sekä verkkokaupan PDF:nä että kuvattuna paperikuittina,
 * joten vertailu tehdään sisällöstä eikä tiedostosta: toimittaja, päivä ja
 * loppusumma yhdessä.
 */
export function kaksoiskappaleenAvain(kuitti: {
  toimittaja: string | null;
  paivays: string;
  loppusumma_eur: number;
}): string {
  const toimittaja = (kuitti.toimittaja ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${toimittaja}|${kuitti.paivays}|${kuitti.loppusumma_eur.toFixed(2)}`;
}

export function etsiKaksoiskappaleet<
  T extends { id: string; toimittaja: string | null; paivays: string; loppusumma_eur: number },
>(kuitit: T[]): T[][] {
  const ryhmat = new Map<string, T[]>();
  for (const kuitti of kuitit) {
    const avain = kaksoiskappaleenAvain(kuitti);
    ryhmat.set(avain, [...(ryhmat.get(avain) ?? []), kuitti]);
  }
  return [...ryhmat.values()].filter((r) => r.length > 1);
}

/**
 * Toimittajan tunnusikoni.
 *
 * Kuittilista luetaan silmäillen, ja toimittaja tunnistuu ikonista nopeammin
 * kuin nimestä. Avainsanat ovat toimialan mukaisia eivätkä yrityskohtaisia,
 * jotta uusi rautakauppa saa oikean ikonin ilman koodimuutosta.
 *
 * Palauttaa avaimen, ei komponenttia: tämä moduuli on puhdasta logiikkaa ja
 * ajettavissa ilman Reactia.
 */
export type ToimittajanIkoni =
  | "polttoaine"
  | "rautakauppa"
  | "maali"
  | "posti"
  | "kauppa"
  | "verkkokauppa"
  | "kuitti";

const TOIMITTAJAN_IKONIT: { sanat: RegExp; ikoni: ToimittajanIkoni }[] = [
  // Polttoaine on toiminimellä yksityisotto, mutta kuitti tallennetaan silti -
  // ja pumppu erottuu listalla heti.
  { sanat: /\b(neste|abc|st1|shell|teboil|seo|gasum)\b/i, ikoni: "polttoaine" },
  { sanat: /\b(posti|matkahuolto|dhl|schenker|kaukokiito|ups|fedex)\b/i, ikoni: "posti" },
  {
    sanat: /(prismatic|pulver|powder|tikkuril|teknos|maalikaup)/i,
    ikoni: "maali",
  },
  {
    sanat: /\b(puuilo|motonet|biltema|k-?rauta|bauhaus|starkki|rautia|ikh|würth|wurth|ahlsell|etra|tokmanni)\b/i,
    ikoni: "rautakauppa",
  },
  { sanat: /\b(verkkokauppa|amazon|ebay|alibaba|aliexpress|digikey)\b/i, ikoni: "verkkokauppa" },
  { sanat: /\b(k-market|s-market|prisma|lidl|citymarket|sale|alepa)\b/i, ikoni: "kauppa" },
];

export function toimittajanIkoni(toimittaja: string | null): ToimittajanIkoni {
  if (!toimittaja) return "kuitti";
  return TOIMITTAJAN_IKONIT.find((t) => t.sanat.test(toimittaja))?.ikoni ?? "kuitti";
}
