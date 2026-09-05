// Tuotesivun poimintalogiikka omassa moduulissaan.
//
// Kaikki tämän tiedoston funktiot ovat puhtaita: sisään tekstiä, ulos arvo.
// Verkko, tunnistautuminen ja kannan kutsut ovat index.ts:ssä. Jako on tehty
// siksi, että poiminnan saa ajettua oikeita tuotesivuja vasten ilman Denoa ja
// ilman että testi joutuu käynnistämään palvelinta.

export type Alkupera = "EU" | "USA" | "muu";
export type MaaliTyyppi =
  | "solid"
  | "transparent"
  | "candy"
  | "illusion"
  | "metallic"
  | "tekstuuri"
  | "kuumankesto"
  | "pohjavari"
  | "muu";
export type Varisavy =
  | "punainen"
  | "oranssi"
  | "keltainen"
  | "vihrea"
  | "sininen"
  | "liila"
  | "pinkki"
  | "musta"
  | "harmaa"
  | "valkoinen"
  | "hopea"
  | "kultainen"
  | "bronssi"
  | "ruskea";

export const KG_PER_LB = 0.45359237;
export const KG_PER_OZ = 0.028349523125;

export function poimiMeta(html: string, property: string): string | null {
  const re1 = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    "i"
  );
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

export function dekoodaaHtmlEntiteetit(teksti: string): string {
  return teksti
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function absoluuttinenUrl(url: string | null, baseUrl: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

// Valmistajan tuotekoodia suluissa (esim. "Illusion Cherry (PMS-11514)") ei
// tallenneta - se ei kerro mitään maalista ja sotkee nimen listoissa.
export function poistaTuotekoodi(nimi: string): string {
  return nimi.replace(/\s*\([A-Za-z0-9][A-Za-z0-9-]*\)/g, "").trim();
}

// og:title on usein muotoa "Nimi (KOODI) - Kuvaus | Sivuston nimi".
// Poimitaan pelkkä nimi: katkaistaan koodiin, muuten ensimmäiseen "|"-osaan.
export function poimiNimi(html: string): string | null {
  const ogTitle = poimiMeta(html, "og:title");
  if (!ogTitle) return null;
  const otsikko = dekoodaaHtmlEntiteetit(ogTitle).trim();
  const koodiMatch = otsikko.match(/^(.*?)\s*\([A-Za-z0-9][A-Za-z0-9-]*\)/);
  const nimi = poistaTuotekoodi(koodiMatch ? koodiMatch[1] : otsikko.split("|")[0]);
  return nimi || null;
}

export function poimiValmistaja(html: string): string | null {
  const nimi = poimiMeta(html, "og:site_name");
  return nimi ? dekoodaaHtmlEntiteetit(nimi).trim() : null;
}

// og:image on usein pieni "-thumbnail"-versio; yritetään täysikokoista
// samasta polusta poistamalla "-thumbnail" tiedostopäätteen edestä.
export function poimiKuva(html: string, baseUrl: string): string | null {
  const ogImage = poimiMeta(html, "og:image");
  if (!ogImage) return null;
  const isoVersio = ogImage.replace(/-thumbnail(?=\.[a-zA-Z]+($|\?))/, "");
  return absoluuttinenUrl(isoVersio, baseUrl);
}

// Ohitetaan yleiset, ei-tuotekohtaiset PDF:t (käyttöturvallisuustiedote,
// yleinen levitysopas) ja valitaan viimeinen jäljelle jäävä linkki - tuote-
// kohtainen datasheet on tyypillisesti listattu näiden jälkeen.
export function poimiOhjeTiedosto(html: string, baseUrl: string): string | null {
  const linkit = [...html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)].map((m) => m[1]);
  if (linkit.length === 0) return null;
  const yleiset = /(sds|safety[-_]?data|application[-_]?guide|app[-_]?guide|installation[-_]?guide)/i;
  const tuotekohtaiset = linkit.filter((l) => !yleiset.test(l));
  const valinta = tuotekohtaiset.length > 0 ? tuotekohtaiset[tuotekohtaiset.length - 1] : linkit[linkit.length - 1];
  return absoluuttinenUrl(valinta, baseUrl);
}

// Saksalainen kauppa ilmoittaa kiiltoasteen omalla sanastollaan:
// "Glatt hochglänzend > 90 GE (60° Winkel)". GE (Glanzeinheiten) on sama
// yksikkö kuin GU (gloss units), joten se kirjoitetaan GU:na - näin
// kiiltoaste-kenttä pysyy yhdessä muodossa myyjästä riippumatta.
const KIILTOYKSIKOT = /(\d+\+?(?:\s*[-–]\s*\d+)?)\s*(?:Gloss Units?|GU|GE)\b/i;
// Yhdyssanat ensin, jotta "hochglanz" ei lyhene pelkäksi "glanziksi". Pelkkä
// "glanz" on mukana, koska ilman sitä kiiltävä tuote ("Glatt glanz") jäi ilman
// osumaa ja poiminta löysi tilalle myöhemmän "stumpfmatt"-maininnan toisesta
// tuotteesta samalla sivulla - kiiltävä väri tallentui mattana.
const SAKSAN_KIILTOSANA =
  /\b(hochgl[äa]nzend|hochglanz|seidengl[äa]nzend|seidenglanz|seidenmatt|stumpfmatt|gl[äa]nzend|glanz|matt)\b/i;

// Sama kiiltoaste kirjoitetaan kaupassa kahdella tavalla ("glanz" ja
// "glänzend"), joten se yhtenäistetään: muuten kenttään kertyy kaksi
// kirjoitusasua samasta asiasta.
const SAKSAN_KIILTOSANAN_MUOTO: [RegExp, string][] = [
  [/^hochgl/i, "Hochglanz"],
  [/^seidengl/i, "Seidenglanz"],
  [/^seidenmatt$/i, "Seidenmatt"],
  [/^stumpfmatt$/i, "Stumpfmatt"],
  [/^gl/i, "Glanz"],
  [/^matt$/i, "Matt"],
];

export function poimiKiiltoaste(teksti: string): string | null {
  const luokkaJaYksikot = teksti.match(
    /\b(High Gloss|Semi[- ]?Gloss|Satin|Matte|Flat)\b[^.]{0,60}?(\d+\+?(?:\s*[-–]\s*\d+)?)\s*Gloss Units?/i
  );
  if (luokkaJaYksikot) {
    return `${luokkaJaYksikot[1].trim()} (${luokkaJaYksikot[2].trim()} GU)`;
  }
  const pelkatYksikot = teksti.match(KIILTOYKSIKOT);
  if (pelkatYksikot) return `${pelkatYksikot[1].trim()} GU`;
  const pelkkaLuokka = teksti.match(/\b(High Gloss|Semi[- ]?Gloss|Satin|Matte|Flat)\b/i);
  if (pelkkaLuokka) return pelkkaLuokka[1].trim();
  const saksaksi = teksti.match(SAKSAN_KIILTOSANA);
  if (!saksaksi) return null;
  const sana = saksaksi[1];
  return SAKSAN_KIILTOSANAN_MUOTO.find(([kuvio]) => kuvio.test(sana))?.[1] ?? null;
}

// meta name="..." (description, keywords) - täydentää og-tageja.
export function poimiMetaNimella(html: string, name: string): string | null {
  const re1 = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i");
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

// Sivulle upotetusta JSON:ista löytyy usein tuotteen luokittelu (kokoelma,
// sarja, kategoria, murupolku) - se kertoo maalin tyylin luotettavammin kuin
// markkinointiteksti. Lainausmerkit voivat olla backslash-paettuina, ks. poimiHinta.
export const LUOKITTELUAVAIMET = [
  "category",
  "categories",
  "collection",
  "collections",
  "series",
  "productType",
  "product_type",
  "colorFamily",
  "color_family",
  "family",
  "breadcrumb",
  "tags",
];

export function poimiLuokittelut(html: string): string {
  const osumat: string[] = [];
  for (const avain of LUOKITTELUAVAIMET) {
    const re = new RegExp(`\\\\?"${avain}\\\\?"\\s*:\\s*\\\\?"([^"\\\\]{1,60})\\\\?"`, "gi");
    for (const m of html.matchAll(re)) osumat.push(m[1]);
  }
  return dekoodaaHtmlEntiteetit(osumat.join(" "));
}

// Tunnistusjärjestys ratkaisee: illusion- ja candy-sivut mainitsevat lähes aina
// myös lakan ("clear top coat") ja pohjavärin, joten erikoismaalit tarkistetaan
// ensin ja yleisemmät tyypit vasta niiden jälkeen.
export const TYYPPI_AVAINSANAT: [MaaliTyyppi, RegExp][] = [
  ["illusion", /\b(illusions?|illuusio)\b/i],
  ["candy", /\b(cand(?:y|ies)|kandi)\b/i],
  [
    "transparent",
    /\b(clears?|clear\s?coats?|clearcoats?|top\s?coats?|topcoats?|transparents?|translucent|lakka|lakat|kirkaslakka)\b/i,
  ],
  ["pohjavari", /\b(base\s?coats?|basecoats?|primers?|undercoats?|pohjav[äa]ri|pohjamaali)\b/i],
  [
    "kuumankesto",
    /\b(high\s?temp(?:erature)?|heat\s?resistant|heat\s?proof|exhaust|header|manifold|kuumankest[oä]v[äa]?|kuumankesto|pakoputk)/i,
  ],
  [
    "tekstuuri",
    /\b(textur(?:e|ed|es)|wrinkles?|hammer\s?tone|hammertone|veins?|structur(?:e|ed)|rough\s?coat|kuvioit|tekstuuri)/i,
  ],
  [
    "metallic",
    /\b(metallics?|metallic-|metalli(?:nen|set)?|pearlescent|pearls?|micas?|sparkles?|anodized|chromes?|chromium|kromi)\b/i,
  ],
  ["solid", /\b(solids?|ral\s?\d{3,4}|flat\s?colou?rs?|yksiv[äa]rinen)\b/i],
];

export function tunnistaTyyppi(teksti: string, ohitettavat: MaaliTyyppi[] = []): MaaliTyyppi | null {
  const osuma = TYYPPI_AVAINSANAT.find(
    ([tyyppi, avainsana]) => !ohitettavat.includes(tyyppi) && avainsana.test(teksti)
  );
  return osuma ? osuma[0] : null;
}

// Lakka ja pohjaväri ovat oheistuotteita, joita markkinointiteksti suosittelee
// värin kanssa käytettäväksi: "a clear top coat is recommended for exterior
// use", "apply over a base coat". Niistä päättely meni pieleen - metallic,
// jolle suositellaan lakkausta, tunnistui lakaksi. Siksi kuvaustekstistä ei
// enää hyväksytä näitä kahta; ne luetaan vain nimestä ja sivun omasta
// luokittelusta, joissa sana tarkoittaa tuotetta itseään.
//
// Candy ja illusion sen sijaan pysyvät mukana: ne mainitaan kuvauksessa
// yleensä juuri siksi että tuote ON candy tai illusion, ja kummankin sivun
// nimi tai luokittelu ei aina kerro tyyppiä.
export const KUVAUKSESTA_JATETTAVAT: MaaliTyyppi[] = ["transparent", "pohjavari"];

// Prismatic Powders kertoo tuoteluokan omalla vakiolauseellaan: "This color is
// a polyester metallic powder coat", "...a polyester top coat powder coat".
// Lause on luotettavampi kuin nimestä arvaaminen - esim. "Ultra Blue Sparkle"
// ja "Baby Rockstar Sparkle" ovat nimensä perusteella metallicceja mutta
// oikeasti läpikuultavia lakkoja, ja valmistaja sanoo sen suoraan.
//
// Lauseen pitää päättyä "powder coat":iin, jotta markkinointilause
// ("a fine silver sparkling metallic clear coat") ei mene siitä läpi.
export const TUOTELUOKKA_LAUSE =
  /\bis an? [a-z\s-]{0,30}?(metallics?|top\s?coats?|textured?|wrinkled?|clears?)\s+powder\s+coat/i;

export type Tuoteluokka = "metallic" | "lapikuultava" | "tekstuuri";

// Kaikilla tuotteilla ei ole vakiolausetta. Silloin katsotaan tuotteen oma
// esittely ("Fire Sparkle is a clear metallic polyester with red glitter"):
// siinä "clear" tai "top coat" kertoo läpikuultavasta tuotteesta silloinkin
// kun samassa lauseessa lukee metallic. Vain ensimmäinen esittelylause
// kelpaa - myöhemmät lauseet ovat levitysohjeita ("A clear top coat is
// recommended"), jotka puhuvat oheistuotteesta.
export const ESITTELYLAUSE = /\bis an?\s+([^.!?]{0,140})/i;

export function luokitteleSanat(teksti: string): Tuoteluokka | null {
  if (/\b(clears?|top\s?coats?|topcoats?|translucent)\b/i.test(teksti)) return "lapikuultava";
  if (/\b(textured?|wrinkled?)\b/i.test(teksti)) return "tekstuuri";
  if (/\bmetallics?\b/i.test(teksti)) return "metallic";
  return null;
}

export function poimiTuoteluokka(teksti: string): Tuoteluokka | null {
  const sana = teksti.match(TUOTELUOKKA_LAUSE)?.[1]?.toLowerCase();
  if (sana) {
    if (sana.startsWith("metallic")) return "metallic";
    if (sana.startsWith("textur") || sana.startsWith("wrinkl")) return "tekstuuri";
    return "lapikuultava";
  }
  const esittely = teksti.match(ESITTELYLAUSE)?.[1];
  return esittely ? luokitteleSanat(esittely) : null;
}

// Tunnistus kolmessa portaassa luotettavuusjärjestyksessä: tuotteen nimi on
// vahvin signaali ("Illusion Cherry", "Clear Vision"), sitten sivun oma
// luokittelu ("Candies", "Clears") ja vasta viimeisenä markkinointiteksti.
export function poimiTyyppi(
  nimi: string | null,
  luokittelut: string,
  kuvausTeksti: string
): MaaliTyyppi | null {
  const arvaus =
    (nimi ? tunnistaTyyppi(nimi) : null) ??
    tunnistaTyyppi(luokittelut) ??
    tunnistaTyyppi(kuvausTeksti, KUVAUKSESTA_JATETTAVAT);

  // Valmistajan oma tuoteluokka korjaa arvauksen kun ne ovat eri mieltä.
  // Candy, illusion ja pohjaväri ovat lausetta tarkempia (nekin ovat
  // valmistajan sanoin "top coat" -tuotteita), joten ne jäävät voimaan.
  const tarkempiKuinLause = arvaus === "candy" || arvaus === "illusion" || arvaus === "pohjavari";
  const luokka = tarkempiKuinLause ? null : poimiTuoteluokka(kuvausTeksti);
  if (luokka === "metallic") return "metallic";
  if (luokka === "tekstuuri") return "tekstuuri";
  if (luokka === "lapikuultava") return "transparent";

  return arvaus;
}

// Sama heuristiikka kuin sovelluksen paattelyVarisavy (src/lib/vakiot.ts) -
// pidä listat synkassa. Järjestys ratkaisee kun nimi osuu useampaan sävyyn
// (esim. "Golden Bronze"): metallit ensin, sitten akromaattiset, sitten muut.
export const VARISAVY_AVAINSANAT: [Varisavy, RegExp][] = [
  ["hopea", /\b(silvers?|hopea)\b/i],
  ["kultainen", /\b(golds?|golden|kulta|kultainen)\b/i],
  ["bronssi", /\b(bronzes?|coppers?|pronssi|kupari|bronssi)\b/i],
  ["musta", /\b(blacks?|musta|onyx|jet|ebony)\b/i],
  ["valkoinen", /\b(whites?|valkoinen|pearl|ivory)\b/i],
  ["harmaa", /\b(gr[ae]ys?|harmaa|graphite|gunmetal|charcoal|slate)\b/i],
  ["ruskea", /\b(browns?|ruskea|chocolate|coffee|mocha|tan|chestnut|beige)\b/i],
  ["punainen", /\b(reds?|punainen|ruby|cherry|crimson|scarlet|maroon)\b/i],
  ["oranssi", /\b(oranges?|oranssi|tangerine|amber)\b/i],
  ["keltainen", /\b(yellows?|keltainen|lemon|banana|sunflower)\b/i],
  ["vihrea", /\b(greens?|vihre[äa]|lime|emerald|olive|mint|forest)\b/i],
  ["sininen", /\b(blues?|sininen|navy|azure|cobalt|teal|sky)\b/i],
  ["liila", /\b(purples?|violets?|liila|lilac|lavender|plum|grape)\b/i],
  ["pinkki", /\b(pinks?|pinkki|magenta|fuchsia|rose|salmon)\b/i],
  // Kromi on pinnan kiilto, ei sävy: "Bronze Chrome" on bronssi ja "Gold
  // Chrome" kultainen. Siksi kromi on vasta viimeisenä, kun mikään varsinainen
  // värisana ei osunut - silloin "Super Chrome" on hopea.
  ["hopea", /\b(chromes?|chromium|kromi)\b/i],
];

export function tunnistaVarisavy(teksti: string): Varisavy | null {
  const osuma = VARISAVY_AVAINSANAT.find(([, avainsana]) => avainsana.test(teksti));
  return osuma ? osuma[0] : null;
}

// Markkinointiteksti mainitsee helposti muitakin värejä ("looks great over
// black"), joten siitä hyväksytään sävy vain jos koko teksti puhuu yhdestä
// ainoasta sävystä. Muuten jätetään tyhjäksi - admin valitsee lomakkeelta.
export function ainoaSavyTekstissa(teksti: string): Varisavy | null {
  const osumat = VARISAVY_AVAINSANAT.filter(([, avainsana]) => avainsana.test(teksti));
  return osumat.length === 1 ? osumat[0][0] : null;
}

// Värisävy on vain suodatusta varten. Lakoille sitä ei aseteta (kirkas maali,
// ei omaa sävyä). Nimi ratkaisee ensin, sitten sivun luokittelu ("Reds",
// "Blues") ja viimeisenä yksiselitteinen kuvausteksti.
export function poimiVarisavy(
  tyyppi: MaaliTyyppi | null,
  nimi: string | null,
  luokittelut: string,
  kuvausTeksti: string
): Varisavy | null {
  if (tyyppi === "transparent") return null;
  return (
    (nimi ? tunnistaVarisavy(nimi) : null) ??
    tunnistaVarisavy(luokittelut) ??
    ainoaSavyTekstissa(kuvausTeksti)
  );
}

// Valmistaja kertoo tuotekohtaisesti jos väri kaipaa erillisen lakan - esim.
// Prismatic Powders kirjoittaa metallic- ja sparkle-tuotteista usein "a clear
// top coat is recommended for exterior use". Pelkkä sanojen "clear coat"
// esiintyminen ei riitä: lakkasivut ja yleiset levitysohjeet mainitsevat ne
// muutenkin, joten vaaditaan suositus- tai vaatimusverbi samaan lauseeseen.
export const LAKKAUSSUOSITUS: RegExp[] = [
  /\b(?:requires?|recommend(?:ed|s|ation)?|advise[ds]?|must\s+(?:be\s+)?(?:use|apply))\b[^.!?]{0,90}\b(?:clear\s?coat|clearcoat|clear\s?top\s?coat|top\s?coat|topcoat)\b/i,
  /\b(?:clear\s?coat|clearcoat|clear\s?top\s?coat|top\s?coat|topcoat)\b[^.!?]{0,90}\b(?:is\s+)?(?:required|recommended|advised|necessary|a\s+must)\b/i,
  /\b(?:kirkas)?lakk\w*\b[^.!?]{0,90}\b(?:suositel|vaadi|vaati|tarvit)/i,
  /\b(?:suositel|vaadi|vaati|tarvit)\w*\b[^.!?]{0,90}\b(?:(?:kirkas)?lakk\w*|lakan|lakalla)\b/i,
];

/**
 * Illusion tarvitsee lakan aina aktivoituakseen, joten se on totta tyypin
 * perusteella. Muille tyypeille katsotaan tuoteteksti.
 */
export function poimiLakkausvaatimus(tyyppi: MaaliTyyppi | null, teksti: string): boolean {
  if (tyyppi === "illusion") return true;
  if (tyyppi === "transparent") return false;
  return LAKKAUSSUOSITUS.some((kuvio) => kuvio.test(teksti));
}

export function poimiPohjavariKuvaus(tyyppi: MaaliTyyppi | null, html: string): string | null {
  if (tyyppi === "candy") {
    const pohjaMatch = html.match(/\bover (?:a |an )?((?:[A-Z][a-zA-Z0-9]*\s?){1,4})/);
    const pohja = pohjaMatch?.[1]?.trim();
    return pohja
      ? `Suositeltu pohjaväri: ${pohja} (tarkista valmistajan ohjeista).`
      : "Candy-väri tarvitsee pohjavärin (yleisesti kromi). Tarkista valmistajan ohjeet.";
  }
  if (tyyppi === "illusion") {
    return "Illusion-väri aktivoituu topcoatista (lakka/candy). Vaatii pohjavärin ennen topcoatia - tarkista valmistajan ohjeet.";
  }
  if (tyyppi === "transparent") {
    return "Läpikuultava väri - vaatii vaalean tai metallisen pohjavärin. Tarkista valmistajan ohjeet.";
  }
  return null;
}

export function poimiAlkupera(html: string): Alkupera | null {
  if (/made in (the )?usa/i.test(html)) return "USA";
  if (/made in (the )?(eu|europe|european union)/i.test(html)) return "EU";
  return null;
}

export interface RaakaHinta {
  hinta: number;
  valuutta: string;
  yksikko: string;
}

// Suositaan sivulle upotettua hinnoittelutaulukkoa (pricePerBaseQuantity +
// startingQuantity), otetaan pienimmän aloitusmäärän mukainen (perushinta).
// Fallbackina schema.org-tyylinen "priceCurrency"/"price"-pari.
//
// HUOM: monet sivustot (mm. Prismatic Powders) upottavat tämän JSON:in
// palvelinkomponenttien striimauspayloadiin uudelleen JSON-merkkijonona,
// jolloin lainausmerkit tulevat backslash-paettuina (\"pricePerBaseQuantity\").
// Siksi jokainen " on regexissä valinnainen \? ennen sitä - matchaa molemmat.
export function poimiHinta(html: string): RaakaHinta | null {
  const tasoMatchit = [
    ...html.matchAll(
      /\\?"pricePerBaseQuantity\\?":\{\\?"currency\\?":\\?"([A-Z]{3})\\?",\\?"amount\\?":\\?"([\d.]+)\\?"[^}]*\},\\?"startingQuantity\\?":\{\\?"value\\?":([\d.]+),\\?"unit\\?":\\?"([a-zA-Z]+)\\?"/g
    ),
  ];
  if (tasoMatchit.length > 0) {
    tasoMatchit.sort((a, b) => Number(a[3]) - Number(b[3]));
    const [, valuutta, hintaStr, , yksikko] = tasoMatchit[0];
    return { hinta: Number(hintaStr), valuutta, yksikko };
  }

  const currencyMatch = html.match(/\\?"priceCurrency\\?"\s*:\s*\\?"([A-Z]{3})\\?"/);
  const priceMatch = html.match(/\\?"price\\?"\s*:\s*\\?"([\d.]+)\\?"/);
  if (currencyMatch && priceMatch) {
    return { hinta: Number(priceMatch[1]), valuutta: currencyMatch[1], yksikko: "kpl" };
  }
  return null;
}

export function muunnaPerKg(hinta: number, yksikko: string): number | null {
  const y = yksikko.toLowerCase();
  if (y === "kg" || y === "kilogram" || y === "kilograms") return hinta;
  if (y === "lb" || y === "lbs" || y === "pound" || y === "pounds") return hinta / KG_PER_LB;
  if (y === "g" || y === "gram" || y === "grams") return hinta * 1000;
  if (y === "oz" || y === "ounce" || y === "ounces") return hinta / KG_PER_OZ;
  return null;
}

export function pyoristaYlospain(arvo: number): number {
  return Math.ceil(arvo * 100) / 100;
}

// ===========================================================================
// Shopify-kaupat (Pulverkönig / pulverlackfachhandel.de)
// ===========================================================================
//
// Shopify tarjoaa tuotteen koneluettavana lisäämällä ".json" tuotteen osoitteen
// perään. Rakenne on vakaa eikä hajoa kun kauppa vaihtaa teemaa, joten sitä
// käytetään ensisijaisena lähteenä ja HTML jää varalle.

export interface ShopifyMitta {
  measured_type?: string;
  quantity_value?: string;
  quantity_unit?: string;
  reference_value?: number;
  reference_unit?: string;
}

export interface ShopifyVariantti {
  title?: string;
  option1?: string | null;
  price?: string;
  price_currency?: string;
  unit_price?: string | null;
  unit_price_measurement?: ShopifyMitta | null;
}

export interface ShopifyTuote {
  title?: string;
  vendor?: string;
  body_html?: string;
  handle?: string;
  tags?: string | string[];
  images?: { src?: string }[];
  variants?: ShopifyVariantti[];
}

/**
 * Tuotesivun kanoninen osoite: kyselyparametrit ja ankkuri pois.
 *
 * Kauppa liittää linkkeihin seurantaparametreja ("?_pos=1&_sid=..&variant=..").
 * Ne eivät kuulu tallennettavaan myyjän linkkiin eivätkä .json-osoitteeseen.
 */
export function kanoninenUrl(url: string): string {
  try {
    const osoite = new URL(url);
    return `${osoite.origin}${osoite.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** Shopify-tuotesivu tunnistuu polusta /products/<handle>. */
export function shopifyJsonOsoite(url: string): string | null {
  try {
    const osoite = new URL(kanoninenUrl(url));
    return /\/products\/[^/]+$/.test(osoite.pathname) ? `${osoite.href}.json` : null;
  } catch {
    return null;
  }
}

// EU-maiden maatunnukset. Lista on tarkoituksella suppea: se kattaa maat joista
// jauhemaalia oikeasti tilataan, ja tuntematon pääte jättää alkuperän auki sen
// sijaan että arvattaisiin väärin.
const EU_PAATTEET = [
  ".de", ".fi", ".se", ".dk", ".nl", ".be", ".fr", ".es", ".it", ".pl",
  ".ee", ".lv", ".lt", ".at", ".cz", ".sk", ".ie", ".pt", ".si", ".hu", ".eu",
];

export function alkuperaVerkkotunnuksesta(url: string): Alkupera | null {
  try {
    const isanta = new URL(url).hostname.toLowerCase();
    if (EU_PAATTEET.some((paate) => isanta.endsWith(paate))) return "EU";
    return null;
  } catch {
    return null;
  }
}

/** HTML-muotoinen tuotekuvaus riveiksi: yksi rivi per kappale tai otsikko. */
export function htmlRiveiksi(html: string): string[] {
  return dekoodaaHtmlEntiteetit(html.replace(/<[^>]+>/g, "\n"))
    .split("\n")
    .map((rivi) => rivi.replace(/\s+/g, " ").trim())
    .filter((rivi) => rivi.length > 0);
}

// Pulverkönigin tuotekuvaus on jäsennelty väliotsikoihin. Poimitaan niistä ne
// jotka ovat maalarille tarpeen, ja säilytetään valmistajan oma teksti
// sellaisenaan - vain otsikko käännetään.
const OHJEOTSIKOT: { saksa: RegExp; suomi: string; mukaan: boolean }[] = [
  { saksa: /^anwendung:?$/i, suomi: "Levitys", mukaan: true },
  { saksa: /^vorbehandlung:?$/i, suomi: "Esikäsittely", mukaan: true },
  { saksa: /^empfohlene einbrennzeit:?$/i, suomi: "Polttoaika", mukaan: true },
  { saksa: /^theoretische ergiebigkeit:?$/i, suomi: "Riittoisuus", mukaan: true },
  { saksa: /^optimale schichtst[äa]rke:?$/i, suomi: "Kalvonpaksuus", mukaan: true },
  // Nämä tunnistetaan vain jotta tiedetään mihin edellinen osio päättyy.
  { saksa: /^technische datenbl[äa]tter:?$/i, suomi: "", mukaan: false },
  { saksa: /^empfehlung f[üu]r den au[ßs]enbereich:?$/i, suomi: "", mukaan: false },
  { saksa: /^sie haben fragen[:?]*$/i, suomi: "", mukaan: false },
];

/** Yksittäisen osion pituusraja. Laiteosto-sivuilla "Anwendung" on tuhansien
 *  sanojen myyntiteksti, joka ei kuulu värin maalausohjeisiin. */
const OSION_ENIMMAISPITUUS = 400;

/**
 * Tekninen osio tuotekuvauksesta suomennettuna: polttoaika, kalvonpaksuus,
 * riittoisuus ja esikäsittely. Riittoisuus (m²/kg) on tarkistusluku ohjeissa -
 * siitä ei johdeta osan kulutusarviota, koska osan pinta-ala ei ole tiedossa.
 */
export function poimiOhjeet(rivit: string[]): string | null {
  const osiot: string[] = [];
  let nykyinen: { suomi: string; teksti: string[] } | null = null;

  const talteen = () => {
    if (nykyinen && nykyinen.teksti.length > 0) {
      // Osan otsikko on toisinaan omalla rivillään ja toisinaan kaksoispisteen
      // kanssa, jolloin sisältö alkaa irrallisella kaksoispisteellä.
      const teksti = nykyinen.teksti.join(" ").replace(/^:\s*/, "").trim();
      if (teksti && teksti.length <= OSION_ENIMMAISPITUUS) {
        osiot.push(`${nykyinen.suomi}: ${kaannaSaksasta(teksti)}`);
      }
    }
    nykyinen = null;
  };

  for (const rivi of rivit) {
    const otsikko = OHJEOTSIKOT.find((o) => o.saksa.test(rivi));
    if (otsikko) {
      talteen();
      if (otsikko.mukaan) nykyinen = { suomi: otsikko.suomi, teksti: [] };
      continue;
    }
    if (nykyinen) nykyinen.teksti.push(rivi);
  }
  talteen();

  return osiot.length > 0 ? osiot.join("\n") : null;
}

/** Pakkauskoko kiloina tuotevariantin nimestä: "5 kg", "2,5 kg", "500 g". */
export function pakkauksenKilot(teksti: string | null | undefined): number | null {
  if (!teksti) return null;
  const osuma = teksti.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  if (!osuma) return null;
  const maara = Number(osuma[1]);
  if (!Number.isFinite(maara) || maara <= 0) return null;
  return osuma[2].toLowerCase() === "kg" ? maara : maara / 1000;
}

/**
 * Variantin kilohinta. Shopify laskee sen valmiiksi unit_price-kenttään
 * (hyllyhinnan yksikköhinta), ja se on luotettavin: se on sama luku jonka
 * asiakas näkee sivulla. Ilman sitä hinta jaetaan pakkauskoolla.
 *
 * Hintaa ei muunneta mitenkään: saksalainen hinta sisältää Saksan ALV:n ja on
 * siksi sellaisenaan maalaamon todellinen kustannus.
 */
export function shopifyKilohinta(variantti: ShopifyVariantti): number | null {
  const mitta = variantti.unit_price_measurement;
  const yksikkohinta = Number(variantti.unit_price);
  if (
    Number.isFinite(yksikkohinta) &&
    yksikkohinta > 0 &&
    mitta?.reference_unit?.toLowerCase() === "kg" &&
    (mitta.reference_value ?? 1) === 1
  ) {
    return yksikkohinta;
  }

  const hinta = Number(variantti.price);
  const kilot = pakkauksenKilot(variantti.option1 ?? variantti.title);
  if (!Number.isFinite(hinta) || hinta <= 0 || kilot === null) return null;
  return hinta / kilot;
}

/**
 * Hinnoitteluun käytettävä variantti: kilon pakkaus.
 *
 * Kauppa antaa paljousalennuksen, joten viiden kilon säkin kilohinta on
 * halvempi kuin kilon purkin. Ostohintaan otetaan alentamaton kilohinta, jottei
 * varaston arvo ja työn kate nojaa alennukseen jota ei välttämättä saa.
 *
 * Ilman kilon pakkausta valitaan kallein kilohinta samalla perusteella.
 * Pakkauskoko luetaan variantin nimestä ("1 kg", "S (1 kg)"), koska kaupan oma
 * järjestys vaihtelee tuotteittain eikä ensimmäinen ole aina sama koko.
 */
export function shopifyHintavariantti(tuote: ShopifyTuote): ShopifyVariantti | null {
  const variantit = tuote.variants ?? [];
  if (variantit.length === 0) return null;

  const kilonPakkaus = variantit.find(
    (v) => pakkauksenKilot(v.option1 ?? v.title) === 1
  );
  if (kilonPakkaus) return kilonPakkaus;

  let kallein: ShopifyVariantti | null = null;
  let kalleinHinta = -1;
  for (const variantti of variantit) {
    const hinta = shopifyKilohinta(variantti);
    if (hinta !== null && hinta > kalleinHinta) {
      kalleinHinta = hinta;
      kallein = variantti;
    }
  }
  return kallein ?? variantit[0];
}

// ===========================================================================
// RAL-värit
// ===========================================================================

/**
 * Valmistajan otsikko on pitkä ja monikielinen ("Pulverlack RAL 9005
 * Tiefschwarz glatt hochglanz HWF"). RAL-koodi on värin oikea nimi, ja loppu
 * on kuvailua joka kuuluu hakusanoihin - ei värilistan otsikkoon.
 *
 * RAL-koodi tulee kutsujalta (kannan ral_koodi), jotta sama poiminta on
 * yhdessä paikassa eikä koodi pääse erkanemaan kannan ja funktion välillä.
 */
export function nimiOtsikosta(otsikko: string | null, ralKoodi: string | null): string | null {
  if (ralKoodi) return ralKoodi;
  if (!otsikko) return null;
  const siistitty = poistaTuotekoodi(dekoodaaHtmlEntiteetit(otsikko).split("|")[0]).trim();
  return siistitty || null;
}

/**
 * RAL-koodin saanut tuote on lähtökohtaisesti tavallinen sävymaali. Metallic
 * on oma tuotesarjansa ja sanotaan otsikossa, joten se tarkistetaan erikseen -
 * muuten RAL-metallic tallentuisi solidina.
 */
export function ralTyyppi(teksti: string): MaaliTyyppi {
  return /\b(metallic|metallisch|eisenglimmer|db\s?\d{3})\b/i.test(teksti) ? "metallic" : "solid";
}

// ===========================================================================
// Saksankielisen tuotetekstin suomennos
// ===========================================================================
//
// Pulverkönigin tekniset osiot ovat vakiotekstiä: koko 250 tuotteen luettelossa
// on vain 45 erilaista osioriviä, ja niistäkin valtaosa on samaa lausetta eri
// numeroilla. Siksi käännös tehdään lausemalleilla eikä käännöspalvelulla:
// tulos on tarkka, ei maksa mitään eikä lisää verkkokutsua hakuun.
//
// Numerot poimitaan malleista talteen, joten sama lause kääntyy oikein
// lämpötilasta ja kalvonpaksuudesta riippumatta. Käännös on ehdotus kuten muutkin
// haetut kentät - admin voi korjata tekstiä lomakkeella.

const LAUSEMALLIT: [RegExp, string][] = [
  // Levitysmenetelmä
  [
    /Bei der Verarbeitung von Metallic-Pulverlacken wird das elektrostatische-?\s*\(Korona-?\)\s*Verfahren empfohlen,\s*Metallic-Pulverlacke müssen auf Ihre Eignung zur Tribo-Applikation geprüft werden\./gi,
    "Metallic-jauhemaaleille suositellaan sähköstaattista (korona) menetelmää, ja niiden soveltuvuus tribomenetelmään on tarkistettava erikseen.",
  ],
  // RAL ja Leucht erikseen: yhteinen malli jättäisi tuotesarjan nimen
  // talteenottoon, ja termikäännös tekisi siitä "Kaikki hohtava-jauhemaalit".
  [
    /Alle RAL-Pulverlacke sind für das (?:elektrostatische-?\s*)?\(?Korona-?\)?[\s-]*und[\s-]*Tribo-?\s*Verfahren geeignet\./gi,
    "Kaikki RAL-jauhemaalit soveltuvat sähköstaattiseen (korona) ja tribomenetelmään.",
  ],
  [
    /Alle Leucht-Pulverlacke sind für das (?:elektrostatische-?\s*)?\(?Korona-?\)?[\s-]*und[\s-]*Tribo-?\s*Verfahren geeignet\./gi,
    "Kaikki hohtavat jauhemaalit soveltuvat sähköstaattiseen (korona) ja tribomenetelmään.",
  ],
  [
    /Bei der Verarbeitung wird das elektrostatische-?\s*\(Korona-?\)\s*und Tribo-Verfahren empfohlen\./gi,
    "Levitykseen suositellaan sähköstaattista (korona) ja tribomenetelmää.",
  ],
  [
    /Für das (?:elektrostatische-?\s*)?\(?Korona-?\)?[\s-]*und[\s-]*Tribo-?\s*Verfahren geeignet\./gi,
    "Soveltuu sähköstaattiseen (korona) ja tribomenetelmään.",
  ],

  // Esikäsittely
  [
    /Fette, Öle, Zunder und Oxidationsprodukte müssen vor der Beschichtung von der Oberfläche entfernt werden\./gi,
    "Rasvat, öljyt, valssihilse ja hapettumat on poistettava pinnalta ennen maalausta.",
  ],
  [
    /Bei besonderen Anforderungen werden weitere Vorbehandlungsarten benötigt\./gi,
    "Erityisvaatimuksissa tarvitaan lisäksi muita esikäsittelyjä.",
  ],
  [
    /Bei besonderen Korrosionsschutzanforderungen unbedingt das technische Datenblatt beachten bezüglich der Vorbehandlung auf verschiedenen Substraten!?/gi,
    "Erityisissä korroosionsuojavaatimuksissa tarkista teknisestä datalehdestä eri alustojen esikäsittely.",
  ],
  [
    /Bitte die technischen Datenblätter beachten\./gi,
    "Huomioi valmistajan tekniset datalehdet.",
  ],

  // Polttoaika
  [
    /Die Farben müssen jeweils bei\s*(\d+)\s*°?\s*C Objekttemperatur\s*(?:ca\.\s*)?([\d\s\-–]+?)\s*min eingebrannt werden\./gi,
    "Värit poltetaan kappaleen lämpötilassa $1 °C noin $2 min.",
  ],
  [
    /Bei\s*(\d+)\s*°?\s*C Objekttemperatur\s*(?:ca\.\s*)?([\d\s\-–]+?)\s*min\.?/gi,
    "Kappaleen lämpötilassa $1 °C, $2 min.",
  ],

  // Riittoisuus ja kalvonpaksuus
  [
    /Bei\s*(\d+)\s*[μµ]m Schichtdicke\s*([\d,.\s\-–]+?)\s*m²\/kg/gi,
    "$1 μm kalvonpaksuudella $2 m²/kg",
  ],
  [
    /-?\s*bei einer 1-Fach Beschichtung\s*(?:ca\.\s*)?([\d\s\-–]+?)\s*[µμ]m/gi,
    "- yhdellä maalikerroksella $1 µm",
  ],
  [
    /-?\s*bei einer 2-Fach Beschichtung\s*(?:ca\.\s*)?([\d\s\-–]+?)\s*[µμ]m/gi,
    "- kahdella maalikerroksella $1 µm",
  ],

  // Lasurit
  [
    /Bitte beachten Sie die Verarbeitungshinweise der Lasuren, die passenden technischen Datenblätter können unter den FAQ als PDF-Datei heruntergeladen werden\.\s*Ebenfalls gibt es unter den FAQs einen Leitfaden für die Verarbeitung von Lasuren\./gi,
    "Huomioi lasuurien käsittelyohjeet; tekniset datalehdet ja lasuurien käsittelyopas löytyvät valmistajan FAQ-sivulta PDF-tiedostoina.",
  ],
  [
    /Die transparenten Lasuren erzielen auf verschiedenen Untergründen unterschiedliche Farbergebnisse\./gi,
    "Läpikuultavat lasuurit antavat eri alustoilla eri lopputuloksen.",
  ],
  [
    /Ebenfalls ist die Intensität des Farbtons stark von der Schichtstärke abhängig!?/gi,
    "Sävyn voimakkuus riippuu voimakkaasti kalvonpaksuudesta.",
  ],
  [
    /Ein Schichtdickenunterschied von\s*(\d+)\s*[µμ]m bewirkt bereits einen optischen Farbunterschied\./gi,
    "Jo $1 µm ero kalvonpaksuudessa näkyy sävyerona.",
  ],
  [
    /Bevor Sie Farbe auf Ihrem Werkstück auftragen, sollten Sie ein Musterblech mit den gewünschten Pulverlack Kombinationen anfertigen\./gi,
    "Tee koelevy halutuilla jauhemaaliyhdistelmillä ennen kuin maalaat varsinaisen kappaleen.",
  ],
  [/Bitte beachten Sie!?/gi, "Huomioi:"],
];

// Yksittäiset termit lausemallien jälkeen: nappaavat sen mitä malleista jäi yli
// ja kääntävät hakusanat. Pidemmät ensin, jottei "lack" syö sanaa "Pulverlack".
const TERMIT: [RegExp, string][] = [
  [/\bPulverbeschichtung\b/gi, "jauhemaalaus"],
  [/\bPulverlacke?n?\b/gi, "jauhemaali"],
  [/\bKlarlack\b/gi, "kirkaslakka"],
  [/\bLackstift\b/gi, "korjauskynä"],
  [/\bLasuren?\b/gi, "lasuuri"],
  [/\bHochglanz\b/gi, "korkeakiilto"],
  [/\bSeidenglanz\b/gi, "puolikiilto"],
  [/\bSeidenmatt\b/gi, "puolimatta"],
  [/\bStumpfmatt\b/gi, "täysmatta"],
  [/\bFeinstruktur\b/gi, "hienorakenne"],
  [/\bStruktur\b/gi, "rakenne"],
  [/\bGl[äa]nzend\b/gi, "kiiltävä"],
  [/\bGlanz\b/gi, "kiiltävä"],
  [/\bMatt\b/gi, "matta"],
  [/\bGlatt\b/gi, "sileä"],
  [/\bFarblos\b/gi, "väritön"],
  [/\bHitzebeständiges?\b/gi, "kuumankestävä"],
  [/\bKlebeband\b/gi, "teippi"],
  [/\bGrundierung\b/gi, "pohjamaali"],
  [/\bSchichtdicke\b/gi, "kalvonpaksuus"],
  [/\bSchichtstärke\b/gi, "kalvonpaksuus"],
  [/\bObjekttemperatur\b/gi, "kappaleen lämpötila"],
  [/\bEinbrennzeit\b/gi, "polttoaika"],
  [/\bVorbehandlung\b/gi, "esikäsittely"],
  [/\bDatenbl[äa]tter?\b/gi, "datalehti"],
  [/\bOberfläche\b/gi, "pinta"],
  [/\bBeschichtung\b/gi, "pinnoitus"],
  [/\bVerfahren\b/gi, "menetelmä"],
  [/\bFarbton\b/gi, "sävy"],
  [/\bLeucht\b/gi, "hohtava"],
  [/\bAntik\b/gi, "antiikki"],
  [/\bEdelstahl\b/gi, "ruostumaton teräs"],
  [/\bSet\b/gi, "sarja"],
];

// RAL-sävyjen nimet ovat yhdyssanoja, joiden viimeinen osa kertoo värin
// ("Himbeerrot", "Kobaltblau"). Perusväri riittää hakusanaksi: sillä löytää
// värin suomeksi vaikka koko saksankielistä nimeä ei kääntäisi.
const VARIPAATTEET: [RegExp, string][] = [
  [/schwarz$/i, "musta"],
  [/wei[ßs]$/i, "valkoinen"],
  [/grau$/i, "harmaa"],
  [/rot$/i, "punainen"],
  [/blau$/i, "sininen"],
  [/gr[üu]n$/i, "vihreä"],
  [/gelb$/i, "keltainen"],
  [/braun$/i, "ruskea"],
  [/orange$/i, "oranssi"],
  [/violett$/i, "violetti"],
  [/lila$/i, "liila"],
  [/beige$/i, "beige"],
  [/silber$/i, "hopea"],
  [/gold$/i, "kulta"],
  [/kupfer$/i, "kupari"],
  [/bronze$/i, "pronssi"],
];

// Sävyn tarkenne yhdyssanan alussa. Suomennos on valmiiksi yhdyssanamuodossa
// ("syvän" + "musta"), koska suomessa määre taipuu genetiiviin. Vain
// yleisimmät: tarkoitus on tuottaa hakukelpoisia sanoja, ei täydellistä
// käännöstä.
const VARIMAAREET: [RegExp, string][] = [
  [/^hell/i, "vaalean"],
  [/^dunkel/i, "tumman"],
  [/^tief/i, "syvän"],
  [/^licht/i, "vaalean"],
  [/^pastell/i, "pastelli"],
  [/^perl/i, "helmi"],
  [/^rein/i, "puhtaan"],
  [/^signal/i, "signaali"],
  [/^verkehrs/i, "liikenne"],
  [/^leucht/i, "hohto"],
];

/** Kääntää saksankielisen tuotetekstin: lausemallit ensin, sitten yksittäiset termit. */
export function kaannaSaksasta(teksti: string): string {
  let tulos = teksti;
  for (const [malli, suomeksi] of LAUSEMALLIT) tulos = tulos.replace(malli, suomeksi);
  for (const [malli, suomeksi] of TERMIT) tulos = tulos.replace(malli, suomeksi);
  return tulos.replace(/\s+/g, " ").trim();
}

/** Yhden sanan suomennos hakusanoiksi, tai null jos sanaa ei tunnisteta. */
function sananSuomennokset(sana: string): string[] {
  const suomennokset: string[] = [];
  for (const [malli, suomeksi] of TERMIT) {
    if (new RegExp(`^${malli.source.replace(/\\b/g, "")}$`, "i").test(sana)) {
      suomennokset.push(suomeksi);
      return suomennokset;
    }
  }
  const vari = VARIPAATTEET.find(([malli]) => malli.test(sana));
  if (!vari) return suomennokset;

  const maare = VARIMAAREET.find(([malli]) => malli.test(sana));
  suomennokset.push(vari[1]);
  if (maare) suomennokset.push(`${maare[1]}${vari[1]}`);
  return suomennokset;
}

/**
 * Hakusanat valmistajan tuoteotsikosta.
 *
 * Alkuperäinen saksankielinen otsikko säilyy, koska sillä värin löytää samoilla
 * sanoilla kuin myyjän sivulta, ja perään lisätään suomennokset - muuten
 * "syvänmusta" tai "kiiltävä" ei löytäisi väriä jonka nimeksi jäi "RAL 9005".
 */
export function suomennaHakusanat(otsikko: string): string | null {
  const siistitty = otsikko.trim();
  if (!siistitty) return null;

  const nakyvat = new Set(siistitty.toLowerCase().split(/[^a-zäöüß0-9]+/i).filter(Boolean));
  const lisattavat: string[] = [];
  for (const sana of siistitty.split(/[^A-Za-zÄÖÜäöüß]+/).filter(Boolean)) {
    for (const suomennos of sananSuomennokset(sana)) {
      if (!nakyvat.has(suomennos.toLowerCase())) {
        nakyvat.add(suomennos.toLowerCase());
        lisattavat.push(suomennos);
      }
    }
  }
  return lisattavat.length > 0 ? `${siistitty} - ${lisattavat.join(", ")}` : siistitty;
}
