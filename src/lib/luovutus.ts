/**
 * Kuukauden luovutus kirjanpitäjälle: asetukset, ryhmittely ja tiedostomuodot.
 *
 * Puhdasta logiikkaa ilman verkkoa ja kantaa, jotta viennin saa ajettua
 * oikealla aineistolla ilman palvelinta. Tiedostojen kokoaminen (PDF, ZIP) on
 * reittikäsittelijässä, koska se tarvitsee kirjastot ja Storagen.
 *
 * Järjestelmäkohtaisia tuontimuotoja ei rakenneta tarkoituksella: ne vaativat
 * oman määrittelynsä, muuttuvat, ja on suunniteltu laskuille eikä kuvatuille
 * kuiteille. CSV kattaa samat tapaukset murto-osalla työstä.
 */

import type { Kayttotarkoitus } from "@/lib/supabase/database.types";
import { kayttotarkoituksenNimi, KULUKSI_LASKETTAVAT } from "@/lib/kulut";

export type Vientimuoto = "pdf" | "csv" | "zip";
export type Ryhmittely = "kuukausi" | "toimittaja" | "kayttotarkoitus";
export type Tarkkuus = "rivitaso" | "kuittikohtainen";

export const VIENTIMUODOT: { arvo: Vientimuoto; nimi: string }[] = [
  { arvo: "pdf", nimi: "PDF-kooste" },
  { arvo: "csv", nimi: "CSV" },
  { arvo: "zip", nimi: "Kuvat (ZIP)" },
];

export const RYHMITTELYT: { arvo: Ryhmittely; nimi: string; kuvaus: string }[] = [
  { arvo: "kuukausi", nimi: "Kuukausi", kuvaus: "kuukausittain" },
  { arvo: "toimittaja", nimi: "Toimittaja", kuvaus: "toimittajittain" },
  { arvo: "kayttotarkoitus", nimi: "Käyttötarkoitus", kuvaus: "käyttötarkoituksittain" },
];

export const TARKKUUDET: { arvo: Tarkkuus; nimi: string }[] = [
  { arvo: "rivitaso", nimi: "Rivitaso" },
  { arvo: "kuittikohtainen", nimi: "Kuittikohtainen" },
];

export interface Vientiasetukset {
  muodot: Vientimuoto[];
  ryhmittely: Ryhmittely;
  tarkkuus: Tarkkuus;
  /** Kun pois, kuitin loppusumma ei täsmää vientiin. Sallittua, mutta kerrotaan. */
  yksityisototMukaan: boolean;
}

export const OLETUSASETUKSET: Vientiasetukset = {
  // Useimmiten kirjanpitäjä haluaa kuvat ja erittelyn.
  muodot: ["pdf", "csv", "zip"],
  ryhmittely: "kuukausi",
  tarkkuus: "rivitaso",
  yksityisototMukaan: true,
};

/** Yksi tarkistus ennen luovutusta, kantafunktion palauttamassa muodossa. */
export interface Tarkistus {
  avain: "luokiteltu" | "tasmays" | "kaksoiskappaleet" | "aukot";
  nimi: string;
  ok: boolean;
  kuitit: { id: string; toimittaja: string | null; paivays: string; syy: string }[];
}

export interface LuovutuksenTarkistukset {
  kausi: string;
  kuitteja: number;
  kuluina_eur: number;
  yhteensa_eur: number;
  tarkistukset: Tarkistus[];
  kunnossa: boolean;
}

export interface VientiRivi {
  teksti: string;
  maara: number | null;
  brutto_eur: number;
  verokanta: number | null;
  kayttotarkoitus: Kayttotarkoitus | null;
  kululuokka: string | null;
  muistiinpano: string | null;
}

export interface VientiKuitti {
  id: string;
  toimittaja: string | null;
  paivays: string;
  maksupaiva: string | null;
  loppusumma_eur: number;
  muistiinpano: string | null;
  tiedosto_polku: string | null;
  tiedosto_tyyppi: string | null;
  /**
   * Kuitin kaikki sivut järjestyksessä. Pitkä kassakuitti on monta kuvaa,
   * ja kirjanpitäjälle on mentävä ne kaikki - ei vain ensimmäistä.
   */
  liitteet: { polku: string; tyyppi: string }[];
  rivit: VientiRivi[];
}

/**
 * Yksityisottojen karsinta.
 *
 * Rivi katoaa, mutta kuitti jää: tosite on silti tosite, ja kirjanpitäjä
 * näkee kuvasta koko ostoksen. Loppusumma jää sellaisenaan, jolloin se ei
 * enää täsmää riveihin - siitä huomautetaan käyttöliittymässä.
 */
export function suodataYksityisotot(
  kuitit: VientiKuitti[],
  yksityisototMukaan: boolean
): VientiKuitti[] {
  if (yksityisototMukaan) return kuitit;
  return kuitit.map((kuitti) => ({
    ...kuitti,
    rivit: kuitti.rivit.filter((r) => r.kayttotarkoitus !== "yksityisotto"),
  }));
}

/** Kuitin se osa, joka on yrityksen kulua. */
export function kuitinKuluina(kuitti: VientiKuitti): number {
  const summa = kuitti.rivit
    .filter((r) => r.kayttotarkoitus && KULUKSI_LASKETTAVAT.includes(r.kayttotarkoitus))
    .reduce((yhteensa, r) => yhteensa + r.brutto_eur, 0);
  return Math.round(summa * 100) / 100;
}

export interface Ryhma {
  otsikko: string;
  kuitit: VientiKuitti[];
}

function paivayksenMukaan(kuitit: VientiKuitti[]): VientiKuitti[] {
  return [...kuitit].sort((a, b) => a.paivays.localeCompare(b.paivays));
}

/** Rivin ryhmänimi käyttötarkoituksen mukaan ryhmitellessä. */
function tarkoituksenNimi(rivi: VientiRivi): string {
  return rivi.kayttotarkoitus ? kayttotarkoituksenNimi(rivi.kayttotarkoitus) : "Luokittelematta";
}

/**
 * Kuitit ryhmiin valitun säätimen mukaan.
 *
 * Käyttötarkoituksen mukaan ryhmitellessä sama kuitti voi osua useaan
 * ryhmään: Puuilon kuitilla on sekä yrityksen tarvikkeita että yksityisottoja,
 * ja molemmat kuuluvat omaan ryhmäänsä. Kuitti näkyy silloin kahdesti, mutta
 * kummallakin kerralla vain sen ryhmän riveillä.
 */
export function ryhmittele(kuitit: VientiKuitti[], ryhmittely: Ryhmittely): Ryhma[] {
  const ryhmat = new Map<string, VientiKuitti[]>();

  for (const kuitti of kuitit) {
    if (ryhmittely === "kuukausi") {
      const avain = kuitti.paivays.slice(0, 7);
      ryhmat.set(avain, [...(ryhmat.get(avain) ?? []), kuitti]);
      continue;
    }
    if (ryhmittely === "toimittaja") {
      const avain = kuitti.toimittaja?.trim() || "Toimittaja puuttuu";
      ryhmat.set(avain, [...(ryhmat.get(avain) ?? []), kuitti]);
      continue;
    }

    const tarkoitukset = new Set(kuitti.rivit.map(tarkoituksenNimi));
    if (tarkoitukset.size === 0) tarkoitukset.add("Ei rivejä");
    for (const tarkoitus of tarkoitukset) {
      const osuus: VientiKuitti = {
        ...kuitti,
        rivit: kuitti.rivit.filter((r) => tarkoituksenNimi(r) === tarkoitus),
      };
      ryhmat.set(tarkoitus, [...(ryhmat.get(tarkoitus) ?? []), osuus]);
    }
  }

  return [...ryhmat.entries()]
    .sort((a, b) =>
      ryhmittely === "kuukausi" ? a[0].localeCompare(b[0]) : a[0].localeCompare(b[0], "fi")
    )
    .map(([otsikko, ryhmanKuitit]) => ({ otsikko, kuitit: paivayksenMukaan(ryhmanKuitit) }));
}

/** Suomalainen desimaalipilkku: Excel lukee luvun luvuksi eikä tekstiksi. */
function luku(arvo: number | null): string {
  if (arvo === null) return "";
  return arvo.toFixed(2).replace(".", ",");
}

function kentta(arvo: string | null): string {
  const teksti = (arvo ?? "").replace(/\r?\n/g, " ").trim();
  // Puolipiste on erotin, joten sen ja lainausmerkin sisältävä kenttä
  // lainataan. Excel odottaa kaksinkertaistettua lainausmerkkiä.
  return /[";]/.test(teksti) ? `"${teksti.replace(/"/g, '""')}"` : teksti;
}

/** Tavujärjestysmerkki. Ilman sitä suomalainen Excel lukee ääkköset väärin. */
const TAVUJARJESTYSMERKKI = "\ufeff";

const RIVITASON_OTSIKOT = [
  "Ryhmä",
  "Päiväys",
  "Maksupäivä",
  "Toimittaja",
  "Rivi",
  "Määrä",
  "Brutto EUR",
  "ALV %",
  "Käyttötarkoitus",
  "Kululuokka",
  "Rivin muistiinpano",
  "Kuitin muistiinpano",
  "Kuitin loppusumma EUR",
  "Tosite",
];

const KUITTITASON_OTSIKOT = [
  "Ryhmä",
  "Päiväys",
  "Maksupäivä",
  "Toimittaja",
  "Loppusumma EUR",
  "Kuluina EUR",
  "Rivejä",
  "Muistiinpano",
  "Tosite",
];

/**
 * CSV kirjanpitäjälle.
 *
 * Puolipiste erottimena ja tavujärjestysmerkki alkuun: suomalainen Excel avaa
 * tiedoston silloin oikein ilman tuontivelhoa. Ryhmittely on oma sarakkeensa
 * eikä väliotsikko, jotta tiedosto pysyy taulukkona jonka voi lajitella.
 */
export function csvSisalto(kuitit: VientiKuitti[], asetukset: Vientiasetukset): string {
  const ryhmat = ryhmittele(
    suodataYksityisotot(kuitit, asetukset.yksityisototMukaan),
    asetukset.ryhmittely
  );
  const rivit: string[] = [];

  if (asetukset.tarkkuus === "rivitaso") {
    rivit.push(RIVITASON_OTSIKOT.join(";"));
    for (const ryhma of ryhmat) {
      for (const kuitti of ryhma.kuitit) {
        for (const rivi of kuitti.rivit) {
          rivit.push(
            [
              kentta(ryhma.otsikko),
              kuitti.paivays,
              kuitti.maksupaiva ?? "",
              kentta(kuitti.toimittaja),
              kentta(rivi.teksti),
              rivi.maara === null ? "" : String(rivi.maara).replace(".", ","),
              luku(rivi.brutto_eur),
              rivi.verokanta === null ? "" : String(rivi.verokanta).replace(".", ","),
              kentta(rivi.kayttotarkoitus ? kayttotarkoituksenNimi(rivi.kayttotarkoitus) : ""),
              kentta(rivi.kululuokka),
              kentta(rivi.muistiinpano),
              kentta(kuitti.muistiinpano),
              luku(kuitti.loppusumma_eur),
              kentta(kuitti.tiedosto_polku ? kuvanTiedostonimi(kuitti) : ""),
            ].join(";")
          );
        }
      }
    }
  } else {
    rivit.push(KUITTITASON_OTSIKOT.join(";"));
    for (const ryhma of ryhmat) {
      for (const kuitti of ryhma.kuitit) {
        rivit.push(
          [
            kentta(ryhma.otsikko),
            kuitti.paivays,
            kuitti.maksupaiva ?? "",
            kentta(kuitti.toimittaja),
            luku(kuitti.loppusumma_eur),
            luku(kuitinKuluina(kuitti)),
            String(kuitti.rivit.length),
            kentta(kuitti.muistiinpano),
            kentta(kuitti.tiedosto_polku ? kuvanTiedostonimi(kuitti) : ""),
          ].join(";")
        );
      }
    }
  }

  return TAVUJARJESTYSMERKKI + rivit.join("\r\n") + "\r\n";
}

/**
 * Kuvatiedoston nimi ZIP-paketissa: 2026-09_05_Puuilo_119.16.jpg
 *
 * Nimi järjestää tiedostot päivämäärän mukaan ja kertoo toimittajan ja summan
 * ilman että kuvaa tarvitsee avata.
 */
export function kuvanTiedostonimi(kuitti: VientiKuitti): string {
  const [vuosi, kuukausi, paiva] = kuitti.paivays.split("-");
  const toimittaja =
    (kuitti.toimittaja ?? "")
      .normalize("NFD")
      // Ääkköset pois tiedostonimestä: purkuohjelmat ja kirjanpito-ohjelmat
      // käsittelevät niitä eri tavoin eri käyttöjärjestelmissä.
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "tuntematon";
  const paate = kuitti.tiedosto_tyyppi === "application/pdf" ? "pdf" : "jpg";
  return `${vuosi}-${kuukausi}_${paiva}_${toimittaja}_${kuitti.loppusumma_eur.toFixed(2)}.${paate}`;
}

/** Ladattavan tiedoston nimi. */
export function paketinNimi(kausi: string, muoto: Vientimuoto | "paketti"): string {
  const tunnus = kausi.slice(0, 7);
  if (muoto === "pdf") return `${tunnus}_kooste.pdf`;
  if (muoto === "csv") return `${tunnus}_kuitit.csv`;
  if (muoto === "zip") return `${tunnus}_kuvat.zip`;
  return `${tunnus}_kuitit_paketti.zip`;
}

/** Yhteenveto siitä mitä painike tuottaa. Näytetään ennen latausta. */
export function paketinKuvaus(asetukset: Vientiasetukset): string {
  const maara = asetukset.muodot.length;
  const ryhmittely = RYHMITTELYT.find((r) => r.arvo === asetukset.ryhmittely)?.kuvaus;
  const tarkkuus = TARKKUUDET.find((t) => t.arvo === asetukset.tarkkuus)?.nimi.toLowerCase();
  const osat = [
    `Paketti sisältää ${maara} ${maara === 1 ? "tiedoston" : "tiedostoa"}`,
    ryhmittely ?? "",
    tarkkuus ?? "",
  ].filter(Boolean);
  if (!asetukset.yksityisototMukaan) osat.push("ilman yksityisottoja");
  return osat.join(" · ");
}

/**
 * Teksti PDF:n vakiofonteille turvalliseksi.
 *
 * pdf-lib koodaa vakiofontit WinAnsina, joka kattaa ääkköset ja euromerkin
 * mutta ei typografista miinusta eikä sitovaa välilyöntiä. Ne tulevat
 * suomalaisesta lukumuotoilusta, joten korvaus tehdään täällä eikä
 * muotoilussa - muotoilu on oikein siellä missä se näytetään.
 */
export function pdfTeksti(teksti: string): string {
  return (
    teksti
      .replace(/−/g, "-")
      .replace(/[\u00a0\u202f\u2009]/g, " ")
      .replace(/[–—]/g, "-")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      // Mitä tahansa WinAnsin ulkopuolelta ei voi piirtää; kysymysmerkki on
      // parempi kuin kaatuva vienti.
      .replace(/[^\u0020-\u00ff\u20ac]/g, "?")
  );
}
