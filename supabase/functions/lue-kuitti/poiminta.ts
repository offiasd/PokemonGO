// Kuitin poiminnan puhdas logiikka: kehote, työkalun rakenne, vastauksen
// jäsennys ja täsmäytys.
//
// Tämä tiedosto ei tunne Denoa, verkkoa eikä Supabasea, jotta poiminnan voi
// ajaa oikeita kuitteja vasten ilman Edge Functionia. index.ts hoitaa mallin
// kutsun ja tunnistautumisen.
//
// Poiminta on ehdotus, ei totuus. Kuitti ei koskaan hylkäydy poiminnan takia:
// jos jokin ei täsmää, kuitti merkitään tarkistettavaksi ja käyttäjä korjaa.

/** Kuitilta luettu rivi. Teksti sellaisenaan, lyhenteineen ja katkaisuineen. */
export interface PoimittuRivi {
  teksti: string;
  maara: number | null;
  /** Määrän yksikkö kuitilta, esim. "lb". Null jos kuitissa ei lue sitä. */
  yksikko: string | null;
  /**
   * Rivin loppuhinta kuitin omassa valuutassa. Euromäärä johdetaan tästä
   * kannassa (ks. paivita_kuitin_eurot) - poiminta ei laske sitä.
   */
  brutto_valuutassa: number;
  /** Luettu kuitista. Null jos kuitissa ei lue rivin kantaa. */
  verokanta: number | null;
}

/** Yksi rivi kuitin ALV-erittelytaulukosta. */
export interface AlvErittelynRivi {
  verokanta: number;
  veroton_eur: number;
  vero_eur: number;
  verollinen_eur: number;
}

export interface KuittiPoiminta {
  toimittaja: string | null;
  /** Laskun valuutta ISO-koodina kuitilta luettuna. Null = ei mainintaa. */
  valuutta: string | null;
  /**
   * Kuitti- tai laskunumero sellaisena kuin se tositteessa lukee.
   *
   * Myyjän itsensä antama yksilöivä tunniste, ja siksi ensisijainen tapa
   * tunnistaa kaksoiskappale. Null jos numeroa ei löydy - keksitty numero
   * olisi pahempi kuin puuttuva, koska se estäisi aidon kaksoiskappaleen
   * löytymisen.
   */
  tositenumero: string | null;
  tositetyyppi: "kuitti" | "lasku" | null;
  /** ISO-muodossa (YYYY-MM-DD) tai null jos päiväystä ei saatu luettua. */
  paivays: string | null;
  /** Vain jos eri kuin laskupäivä. */
  maksupaiva: string | null;
  loppusumma_valuutassa: number | null;
  rivit: PoimittuRivi[];
  alv_erittely: AlvErittelynRivi[];
}

/**
 * Kehote mallille.
 *
 * Kolme asiaa toistetaan, koska ne ovat ne joissa poiminta menee pieleen:
 * verokanta luetaan kuitista eikä päätellä tuotteesta, rivin teksti jätetään
 * sellaisenaan, ja monisivuinen tiedosto luetaan loppuun asti.
 */
export const KEHOTE = `Luet ostokuitteja ja ostolaskuja kirjanpitoa varten. Osa on
suomalaisia, osa ulkomaisia.

Poimi kuitista:
- toimittajan nimi sellaisena kuin se kuitissa lukee
- laskun tai ostoksen päiväys
- maksupäivä vain jos se on eri kuin laskun päiväys, muuten null
- kuitin rivit: teksti, määrä, bruttohinta laskun valuutassa ja rivin verokanta
- ALV-erittelytaulukko kannoittain, jos kuitissa sellainen on
- loppusumma laskun omassa valuutassa
- tositenumero: kassakuitin kuittinumero tai laskun numero
- tositetyyppi: kuitti tai lasku
- valuutta: laskun valuutta ISO-koodina
- rivin määrän yksikkö, jos kuitissa on sellainen

Säännöt:
1. Kirjoita rivin teksti täsmälleen niin kuin se kuitissa lukee. Älä täydennä
   lyhenteitä, älä korjaa kirjoitusasua, älä käännä. Katkaistu nimi on
   arvokkaampi tunnistamisen kannalta kuin arvattu kokonainen.
2. Verokanta luetaan kuitista: kuitin verokantatunnus, rivin ALV-sarake tai
   erittelytaulukko. Älä koskaan päättele kantaa tuoteryhmästä. Suomen kannat
   ovat muuttuneet toistuvasti, ja esimerkiksi makeiset ja virvoitusjuomat
   ovat yleisellä kannalla. Jos kuitissa ei lue rivin kantaa, jätä se tyhjäksi.
3. Bruttohinta on rivin loppuhinta alennusten jälkeen, verollisena.
   Pantit, alennukset ja rahtikulut ovat omia rivejään omilla hinnoillaan;
   alennus on negatiivinen.
4. Lue tiedosto kokonaan. Lasku ja erittely ovat usein eri sivuilla, ja rivit
   voivat jatkua sivun yli.
5. Älä laske puuttuvia lukuja itse. Jos jotain ei näy, jätä se tyhjäksi -
   arvattu luku on pahempi kuin puuttuva, koska se näyttää täsmäävän.
6. Määrä on kappale-, paino- tai tilavuusmäärä. Jos sitä ei ole merkitty, jätä
   tyhjäksi. Kirjaa yksikkö erikseen: lb, kg, g, l, ml, kpl tai pkt. Älä muunna
   yksiköitä - amerikkalainen lasku ilmoittaa määrät paunoina (lb), ja muunnos
   tehdään myöhemmin.
7. Älä arvaa tositenumeroa. Se on kuitissa "Kuitti", "Kuittinumero", "Tosite",
   "Lasku" tai "Laskunumero" -tekstin yhteydessä oleva myyjän oma numero.
   Kirjoita se sellaisenaan välimerkkeineen. Jos numeroa ei löydy, palauta
   null: keksitty numero on pahempi kuin puuttuva, koska sitä käytetään
   kaksoiskappaleiden tunnistukseen. Älä käytä numerona kassan, myyjän,
   asiakkaan, viitteen, tilausnumeron tai Y-tunnuksen arvoa.
8. Valuutta luetaan kuitista: valuuttakoodi, symboli tai maakohtainen konteksti.
   Summat palautetaan aina siinä valuutassa kuin ne kuitissa ovat - älä muunna
   euroiksi. Suomalainen kuitti on EUR; amerikkalainen lasku on yleensä USD.
   Jos valuutasta ei ole mitään merkkiä, jätä tyhjäksi.
9. Ulkomaisella laskulla ei yleensä ole Suomen ALV:tä. Jätä silloin
   alv_erittely tyhjäksi ja rivien verokannat tyhjiksi - keksitty verokanta
   veisi vähennyksen väärään suuntaan.

Palauta tiedot kuitin_tiedot-työkalulla.`;

/** Työkalun rakenne. Tiukka muoto pitää vastauksen jäsennettävänä. */
export const TYOKALU = {
  name: "kuitin_tiedot",
  description: "Kuitilta luetut tiedot kirjanpitoa varten.",
  input_schema: {
    type: "object",
    properties: {
      toimittaja: {
        type: ["string", "null"],
        description: "Toimittajan nimi kuitilta.",
      },
      paivays: {
        type: ["string", "null"],
        description: "Ostoksen tai laskun päiväys muodossa YYYY-MM-DD.",
      },
      maksupaiva: {
        type: ["string", "null"],
        description: "Maksupäivä YYYY-MM-DD, vain jos eri kuin päiväys.",
      },
      loppusumma_valuutassa: {
        type: ["number", "null"],
        description:
          "Kuitin loppusumma verollisena, kuitin omassa valuutassa. Älä muunna euroiksi.",
      },
      valuutta: {
        type: ["string", "null"],
        description: "Laskun valuutta ISO-koodina, esim. EUR tai USD. Null jos ei mainintaa.",
      },
      tositenumero: {
        type: ["string", "null"],
        description:
          "Kuitti- tai laskunumero sellaisena kuin se tositteessa lukee. Null jos ei löydy - älä arvaa.",
      },
      tositetyyppi: {
        type: ["string", "null"],
        enum: ["kuitti", "lasku", null],
        description: "Onko tosite kassakuitti vai lasku.",
      },
      rivit: {
        type: "array",
        description: "Kuitin rivit siinä järjestyksessä kuin ne kuitissa ovat.",
        items: {
          type: "object",
          properties: {
            teksti: { type: "string", description: "Rivin teksti sellaisenaan." },
            maara: { type: ["number", "null"], description: "Kappale-, paino- tai tilavuusmäärä." },
            yksikko: {
              type: ["string", "null"],
              enum: ["lb", "kg", "g", "l", "ml", "kpl", "pkt", null],
              description: "Määrän yksikkö kuitilta. Älä muunna yksikköä.",
            },
            brutto_valuutassa: {
              type: "number",
              description: "Rivin loppuhinta verollisena, kuitin omassa valuutassa.",
            },
            verokanta: {
              type: ["number", "null"],
              description: "Rivin verokanta prosentteina kuitilta luettuna, esim. 25.5.",
            },
          },
          required: ["teksti", "brutto_valuutassa"],
        },
      },
      alv_erittely: {
        type: "array",
        description: "Kuitin ALV-erittelytaulukko kannoittain, jos kuitissa on sellainen.",
        items: {
          type: "object",
          properties: {
            verokanta: { type: "number" },
            veroton_eur: { type: "number" },
            vero_eur: { type: "number" },
            verollinen_eur: { type: "number" },
          },
          required: ["verokanta"],
        },
      },
    },
    required: ["rivit"],
  },
} as const;

/**
 * Luku mallin vastauksesta.
 *
 * Malli palauttaa yleensä numeron, mutta kuitilta luettuna luku voi tulla
 * merkkijonona kuitin omassa asussa ("1 234,56 €"). Desimaalierotin on se
 * erottimista, joka esiintyy viimeisenä: "1.234,56" on eurooppalainen ja
 * "1,234.56" amerikkalainen tapa kirjoittaa sama luku.
 */
export function numeroksi(arvo: unknown): number | null {
  if (typeof arvo === "number") return Number.isFinite(arvo) ? arvo : null;
  if (typeof arvo !== "string") return null;

  // \s kattaa myös sitovan välin, jota kuiteissa käytetään tuhaterottimena.
  let teksti = arvo.replace(/[\s€%]/g, "").trim();
  if (!teksti) return null;

  // Kuiteissa miinus on toisinaan luvun perässä ("12,00-").
  let negatiivinen = false;
  if (teksti.endsWith("-")) {
    negatiivinen = true;
    teksti = teksti.slice(0, -1);
  }

  const pilkku = teksti.lastIndexOf(",");
  const piste = teksti.lastIndexOf(".");
  if (pilkku >= 0 && pilkku > piste) {
    teksti = teksti.replace(/\./g, "").replace(",", ".");
  } else if (piste >= 0 && pilkku >= 0) {
    teksti = teksti.replace(/,/g, "");
  } else if (pilkku >= 0) {
    teksti = teksti.replace(",", ".");
  }

  const luku = Number(teksti);
  if (!Number.isFinite(luku)) return null;
  return negatiivinen ? -Math.abs(luku) : luku;
}

/** Kahdelle desimaalille, jotta sentit eivät ajele liukuluvun mukana. */
function sentteina(luku: number): number {
  return Math.round(luku * 100) / 100;
}

function kelvollinenPaiva(vuosi: number, kuukausi: number, paiva: number): boolean {
  if (kuukausi < 1 || kuukausi > 12 || paiva < 1 || paiva > 31) return false;
  const d = new Date(Date.UTC(vuosi, kuukausi - 1, paiva));
  return (
    d.getUTCFullYear() === vuosi && d.getUTCMonth() === kuukausi - 1 && d.getUTCDate() === paiva
  );
}

function isoksi(vuosi: number, kuukausi: number, paiva: number): string | null {
  if (!kelvollinenPaiva(vuosi, kuukausi, paiva)) return null;
  return `${String(vuosi).padStart(4, "0")}-${String(kuukausi).padStart(2, "0")}-${String(paiva).padStart(2, "0")}`;
}

/**
 * Päiväys ISO-muotoon.
 *
 * Kehote pyytää ISO-muotoa, mutta kuitissa lukee "15.9.2026" ja malli
 * toistaa toisinaan kuitin oman asun. Kaksinumeroinen vuosi tulkitaan
 * 2000-luvuksi: kuitit ovat tästä ajasta.
 */
export function paivaykseksi(arvo: unknown): string | null {
  if (typeof arvo !== "string") return null;
  const teksti = arvo.trim();
  if (!teksti) return null;

  const iso = teksti.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return isoksi(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const suomalainen = teksti.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (suomalainen) {
    const vuosiLuku = Number(suomalainen[3]);
    const vuosi = vuosiLuku < 100 ? 2000 + vuosiLuku : vuosiLuku;
    return isoksi(vuosi, Number(suomalainen[2]), Number(suomalainen[1]));
  }

  return null;
}

function teksti(arvo: unknown): string | null {
  if (typeof arvo !== "string") return null;
  const siisti = arvo.trim();
  return siisti ? siisti : null;
}

/** Kannan sallimat yksiköt. Tuntematon yksikkö jätetään pois, ei arvata. */
const YKSIKOT = ["lb", "kg", "g", "l", "ml", "kpl", "pkt"];

function yksikoksi(arvo: unknown): string | null {
  const siisti = teksti(arvo)?.toLowerCase();
  return siisti && YKSIKOT.includes(siisti) ? siisti : null;
}

function onOlio(arvo: unknown): arvo is Record<string, unknown> {
  return typeof arvo === "object" && arvo !== null && !Array.isArray(arvo);
}

/**
 * Verokannat riveille erittelystä.
 *
 * Jos kuitissa on vain yksi verokanta, jokainen rivi on sillä kannalla -
 * tämä luetaan kuitista eikä päätellä tuotteesta. Useamman kannan kuitissa
 * rivin kantaa ei arvata, vaan tyhjä kanta jää tyhjäksi ja kuitti menee
 * tarkistettavaksi.
 */
export function taydennaVerokannat(poiminta: KuittiPoiminta): KuittiPoiminta {
  const kannat = new Set(poiminta.alv_erittely.map((e) => e.verokanta));
  if (kannat.size !== 1) return poiminta;
  const [kanta] = [...kannat];
  return {
    ...poiminta,
    rivit: poiminta.rivit.map((r) => (r.verokanta === null ? { ...r, verokanta: kanta } : r)),
  };
}

/**
 * Mallin vastaus tyypitetyksi poiminnaksi.
 *
 * Kaikki kentät käsitellään epäluotettavina: työkalun rakenne ohjaa mallia
 * mutta ei takaa mitään, ja puuttuva kenttä on parempi kuin väärä tyyppi
 * kannassa.
 */
export function jasennaPoiminta(raaka: unknown): KuittiPoiminta {
  const olio = onOlio(raaka) ? raaka : {};

  const rivit: PoimittuRivi[] = (Array.isArray(olio.rivit) ? olio.rivit : [])
    .filter(onOlio)
    .map((rivi) => ({
      teksti: teksti(rivi.teksti) ?? "",
      maara: numeroksi(rivi.maara),
      yksikko: yksikoksi(rivi.yksikko),
      brutto_valuutassa: sentteina(numeroksi(rivi.brutto_valuutassa) ?? 0),
      verokanta: numeroksi(rivi.verokanta),
    }))
    // Tekstitön rivi ei ole tunnistettavissa eikä opittavissa, joten se on
    // poiminnan roskaa eikä kuitin rivi.
    .filter((rivi) => rivi.teksti !== "");

  const alvErittely: AlvErittelynRivi[] = (
    Array.isArray(olio.alv_erittely) ? olio.alv_erittely : []
  )
    .filter(onOlio)
    .map((erittely) => {
      const verokanta = numeroksi(erittely.verokanta);
      const veroton = numeroksi(erittely.veroton_eur);
      const vero = numeroksi(erittely.vero_eur);
      const verollinen = numeroksi(erittely.verollinen_eur);
      if (verokanta === null) return null;
      return {
        verokanta,
        veroton_eur: sentteina(veroton ?? (verollinen !== null && vero !== null ? verollinen - vero : 0)),
        vero_eur: sentteina(vero ?? (verollinen !== null && veroton !== null ? verollinen - veroton : 0)),
        verollinen_eur: sentteina(
          verollinen ?? (veroton !== null && vero !== null ? veroton + vero : 0)
        ),
      };
    })
    .filter((e): e is AlvErittelynRivi => e !== null);

  const loppusumma = numeroksi(olio.loppusumma_valuutassa);
  const paivays = paivaykseksi(olio.paivays);
  const maksupaiva = paivaykseksi(olio.maksupaiva);

  const tositetyyppi = teksti(olio.tositetyyppi)?.toLowerCase();
  // Valuutta kelpaa vain kolmikirjaimisena ISO-koodina: "dollaria" tai "$" ei
  // ole koodi, ja arvattu koodi ohjaisi muunnoksen väärään suuntaan.
  const valuuttakoodi = teksti(olio.valuutta)?.toUpperCase();
  // Numero kelpaa vain jos siinä on edes yksi kirjain tai numero: pelkät
  // viivat ovat lukuvirhe, eivät tunniste.
  const tositenumero = teksti(olio.tositenumero);

  return taydennaVerokannat({
    toimittaja: teksti(olio.toimittaja),
    valuutta: valuuttakoodi && /^[A-Z]{3}$/.test(valuuttakoodi) ? valuuttakoodi : null,
    tositenumero: tositenumero && /[a-z0-9]/i.test(tositenumero) ? tositenumero : null,
    tositetyyppi: tositetyyppi === "kuitti" || tositetyyppi === "lasku" ? tositetyyppi : null,
    paivays,
    // Maksupäivä tallennetaan vain jos se on aidosti eri kuin laskun päiväys.
    maksupaiva: maksupaiva && maksupaiva !== paivays ? maksupaiva : null,
    loppusumma_valuutassa: loppusumma === null ? null : sentteina(loppusumma),
    rivit,
    alv_erittely: alvErittely,
  });
}

/** Rivien summa. */
export function riviteYhteensa(rivit: PoimittuRivi[]): number {
  return sentteina(rivit.reduce((summa, rivi) => summa + rivi.brutto_valuutassa, 0));
}

export interface Rivitasmays {
  tasmaa: boolean;
  riviteYhteensa: number;
  erotus: number;
}

/** Tarkistus 1: rivien summa = loppusumma. */
export function tarkistaRivisumma(poiminta: KuittiPoiminta): Rivitasmays {
  const summa = riviteYhteensa(poiminta.rivit);
  const loppusumma = poiminta.loppusumma_valuutassa ?? 0;
  const erotus = sentteina(summa - loppusumma);
  return { tasmaa: Math.abs(erotus) <= 0.01, riviteYhteensa: summa, erotus };
}

export interface AlvPoikkeama {
  verokanta: number;
  /** Riveiltä laskettu vero. */
  riveilla: number;
  /** Erittelytaulukon vero. */
  erittelyssa: number;
  erotus: number;
}

export interface Alvtasmays {
  /** Verrattiinko mitään. Ilman erittelytaulukkoa ei ole mihin verrata. */
  vertailtu: boolean;
  tasmaa: boolean;
  poikkeamat: AlvPoikkeama[];
}

/** Bruttohinnan sisältämä vero annetulla kannalla. */
export function rivinVero(brutto: number, verokanta: number): number {
  return (brutto * verokanta) / (100 + verokanta);
}

/**
 * Tarkistus 2: rivien ALV kannoittain = erittelytaulukon luvut.
 *
 * Toleranssi kasvaa rivimäärän mukana: kuitti pyöristää jokaisen rivin
 * sentteihin, joten kymmenen rivin kuitilla sentin heitot kertyvät eivätkä
 * kerro poiminnan virheestä.
 */
export function tarkistaAlvErittely(poiminta: KuittiPoiminta): Alvtasmays {
  if (poiminta.alv_erittely.length === 0) {
    return { vertailtu: false, tasmaa: true, poikkeamat: [] };
  }

  const riveilla = new Map<number, { vero: number; maara: number }>();
  for (const rivi of poiminta.rivit) {
    if (rivi.verokanta === null) continue;
    const nyt = riveilla.get(rivi.verokanta) ?? { vero: 0, maara: 0 };
    riveilla.set(rivi.verokanta, {
      vero: nyt.vero + rivinVero(rivi.brutto_valuutassa, rivi.verokanta),
      maara: nyt.maara + 1,
    });
  }

  const kannat = new Set<number>([
    ...poiminta.alv_erittely.map((e) => e.verokanta),
    ...riveilla.keys(),
  ]);

  const poikkeamat: AlvPoikkeama[] = [];
  for (const kanta of [...kannat].sort((a, b) => a - b)) {
    const riveilta = riveilla.get(kanta);
    const erittelysta = poiminta.alv_erittely.find((e) => e.verokanta === kanta);
    const veroRiveilta = sentteina(riveilta?.vero ?? 0);
    const veroErittelysta = sentteina(erittelysta?.vero_eur ?? 0);
    const erotus = sentteina(veroRiveilta - veroErittelysta);
    const toleranssi = Math.max(0.05, 0.01 * (riveilta?.maara ?? 0));
    if (Math.abs(erotus) > toleranssi) {
      poikkeamat.push({
        verokanta: kanta,
        riveilla: veroRiveilta,
        erittelyssa: veroErittelysta,
        erotus,
      });
    }
  }

  return { vertailtu: true, tasmaa: poikkeamat.length === 0, poikkeamat };
}

export interface PoiminnanArvio {
  /** Kuitin tila poiminnan jälkeen. Kuitti ei koskaan hylkäydy. */
  tila: "tarkistettava" | "valmis";
  /** Suomeksi se mikä jäi kesken. Näytetään käyttäjälle sellaisenaan. */
  huomiot: string[];
  rivisumma: Rivitasmays;
  alv: Alvtasmays;
}

function summana(luku: number, valuutta: string | null): string {
  // Suomalainen kirjoitusasu: pilkku desimaalierottimena ja sitova väli ennen
  // valuuttaa. Valuutta on kuitin oma: euromerkki USD-laskun perässä olisi
  // juuri se virhe jota vastaan valuutta ylipäätään tallennetaan.
  const merkki = valuutta === null || valuutta === "EUR" ? "€" : valuutta;
  return `${luku.toFixed(2).replace(".", ",")}\u00a0${merkki}`;
}

/**
 * Poiminnan täsmäytys ja tila.
 *
 * Täsmäämätön kuitti merkitään tarkistettavaksi eikä hylätä: lämpöpaperi
 * haalistuu ja rypistyy, ja kuitti on silti tosite. Rivien luokittelu
 * puuttuu poiminnan jälkeen aina, joten tila on käytännössä tarkistettava
 * siihen asti kunnes käyttäjä on käynyt kuitin läpi.
 */
export function arvioiPoiminta(poiminta: KuittiPoiminta): PoiminnanArvio {
  const rivisumma = tarkistaRivisumma(poiminta);
  const alv = tarkistaAlvErittely(poiminta);
  const huomiot: string[] = [];

  if (poiminta.rivit.length === 0) {
    huomiot.push("Kuitilta ei löytynyt rivejä.");
  }
  if (poiminta.loppusumma_valuutassa === null) {
    huomiot.push("Loppusummaa ei saatu luettua.");
  }
  if (poiminta.paivays === null) {
    huomiot.push("Päiväystä ei saatu luettua.");
  }
  if (poiminta.toimittaja === null) {
    huomiot.push("Toimittajaa ei saatu luettua.");
  }
  if (poiminta.rivit.length > 0 && poiminta.loppusumma_valuutassa !== null && !rivisumma.tasmaa) {
    huomiot.push(
      `Rivien summa ${summana(rivisumma.riviteYhteensa, poiminta.valuutta)} ei täsmää ` +
        `loppusummaan ${summana(poiminta.loppusumma_valuutassa, poiminta.valuutta)} ` +
        `(${summana(rivisumma.erotus, poiminta.valuutta)} ero).`
    );
  }
  for (const poikkeama of alv.poikkeamat) {
    huomiot.push(
      `ALV ${String(poikkeama.verokanta).replace(".", ",")} %: riveiltä ${summana(
        poikkeama.riveilla,
        poiminta.valuutta
      )}, erittelyssä ${summana(poikkeama.erittelyssa, poiminta.valuutta)}.`
    );
  }

  return {
    tila: huomiot.length > 0 ? "tarkistettava" : "valmis",
    huomiot,
    rivisumma,
    alv,
  };
}
