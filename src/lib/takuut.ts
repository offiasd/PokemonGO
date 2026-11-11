/**
 * Takuiden näyttölogiikka.
 *
 * Puhdas moduuli: päättymispäivän laskenta, jäljellä olevan ajan sanamuoto ja
 * palkin rajat. Palkki itse on sama SaldoPalkki kuin värivarastossa - väriä ei
 * lasketa täällä uudelleen, vaan sille annetaan päivät grammojen sijaan.
 */

import type { SaldoRajat } from "@/lib/saldo";

/** Takuun tavalliset kestot kuukausina. Ei oletusta - takuu on luettava jostakin. */
export const TAKUUN_KESTOT_KK = [6, 12, 24, 36];

/**
 * Päättymispäivä alkamispäivästä ja kuukausimäärästä.
 *
 * Kuukausi on kalenterikuukausi: 31.1. + 1 kk on 28.2., koska helmikuussa ei
 * ole 31. päivää. Sama sääntö kuin Postgresin make_interval-laskennassa,
 * jolla kuitilta luettu takuu kirjataan.
 */
export function paattymispaiva(alkaa: string, kuukausia: number): string {
  const [vuosi, kk, paiva] = alkaa.split("-").map(Number);
  if (!vuosi || !kk || !paiva) return alkaa;
  const kohde = new Date(Date.UTC(vuosi, kk - 1 + kuukausia, paiva));
  // Ylivuoto takaisin: 31.1. + 1 kk antaisi 3.3., joten liian pitkälle
  // valunut päivä vedetään kuukauden viimeiseen päivään.
  if (kohde.getUTCDate() !== paiva) kohde.setUTCDate(0);
  return kohde.toISOString().slice(0, 10);
}

/** Päivien ero kahden ISO-päivän välillä. */
export function paiviaValissa(alkaa: string, paattyy: string): number {
  const a = Date.parse(`${alkaa}T00:00:00Z`);
  const b = Date.parse(`${paattyy}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Jäljellä oleva aika sanoina.
 *
 * Yli kahden kuukauden takuussa päivien tarkkuus on turhaa tietoa, alle sen
 * se on juuri se tieto jota katsotaan: ehtiikö reklamoida.
 */
export function jaljellaTeksti(jaljellaPv: number): string {
  if (jaljellaPv < 0) {
    const sitten = Math.abs(jaljellaPv);
    return sitten > 60 ? `päättyi ${Math.round(sitten / 30)} kk sitten` : `päättyi ${sitten} pv sitten`;
  }
  if (jaljellaPv === 0) return "päättyy tänään";
  if (jaljellaPv > 60) return `${Math.round(jaljellaPv / 30)} kk jäljellä`;
  return `${jaljellaPv} pv jäljellä`;
}

/**
 * Takuupalkin rajat saldopalkille.
 *
 * Saldopalkin asteikko on hälytysrajasta täysirajaan, ja sama kaava sopii
 * takuuseen sellaisenaan kun sille antaa päivät: jäljellä olevat päivät ovat
 * saldo, varoitusraja on hälytysraja ja koko takuuaika täysiraja. Palkki
 * lyhenee ajan kuluessa ja muuttuu punaiseksi viimeisen kuukauden aikana.
 *
 * Lyhyt takuu on reunatapaus: jos koko takuuaika on varoitusrajaa lyhyempi,
 * asteikon jakaja olisi nolla tai negatiivinen. Täysiraja nostetaan silloin
 * juuri varoitusrajan yläpuolelle, jolloin palkki on punainen koko takuuajan -
 * mikä on totta: lyhyt takuu on aina päättymässä.
 */
export function takuunPalkki(
  jaljellaPv: number,
  kestoPv: number,
  varoitusPv: number
): SaldoRajat {
  return {
    saldoG: Math.max(0, jaljellaPv),
    oletusHalytysG: varoitusPv,
    oletusTaysiG: Math.max(kestoPv, varoitusPv + 1),
  };
}

/** Päättyykö takuu varoitusajan sisällä. Päättynyt ei enää varoita. */
export function paattymassa(jaljellaPv: number, varoitusPv: number): boolean {
  return jaljellaPv >= 0 && jaljellaPv <= varoitusPv;
}

/** Takuun kesto kuukausina, kun se on tasakuukausina ilmaistavissa. */
export function kestoKuukausina(alkaa: string, paattyy: string): number | null {
  for (let kk = 1; kk <= 120; kk++) {
    if (paattymispaiva(alkaa, kk) === paattyy) return kk;
  }
  return null;
}
