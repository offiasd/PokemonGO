import type {
  AjoneuvoTyyppi,
  Kiiltotaso,
  MaaliTyyppi,
  MyytavaMaaliTyyppi,
  PeruutuksenSyy,
  ToinenVariRooli,
  TyoVaihe,
  TyonTila,
  VariTyyppi,
  Varisavy,
} from "@/lib/supabase/database.types";

export const TYO_VAIHEET: { arvo: TyoVaihe; nimi: string }[] = [
  { arvo: "pesu", nimi: "Pesu" },
  { arvo: "maalinpoisto", nimi: "Maalinpoisto" },
  { arvo: "puhallus", nimi: "Puhallus" },
  { arvo: "teippaus", nimi: "Suojaus" },
  { arvo: "maalaus", nimi: "Maalaus" },
];

export const VARI_TYYPIT: { arvo: VariTyyppi; nimi: string }[] = [
  { arvo: "yksivarinen", nimi: "Yksivärinen" },
  { arvo: "candy", nimi: "Candy" },
  { arvo: "illusion", nimi: "Illusion" },
  { arvo: "metallic", nimi: "Metallic" },
  { arvo: "muu_erikois", nimi: "Muu erikoisväri" },
];

// Järjestys määrää myös värilistan kategoriajärjestyksen (/varit).
export const MAALI_TYYPIT: { arvo: MaaliTyyppi; nimi: string }[] = [
  { arvo: "solid", nimi: "Solid / RAL" },
  { arvo: "metallic", nimi: "Metallic" },
  { arvo: "tekstuuri", nimi: "Tekstuuri" },
  { arvo: "kuumankesto", nimi: "Kuumankesto" },
  { arvo: "pohjavari", nimi: "Pohjavärit" },
  { arvo: "candy", nimi: "Candy" },
  { arvo: "illusion", nimi: "Illusion" },
  { arvo: "transparent", nimi: "Lakat" },
  { arvo: "muu", nimi: "Muu" },
];

export function maaliTyypinNimi(tyyppi: MaaliTyyppi): string {
  return MAALI_TYYPIT.find((t) => t.arvo === tyyppi)?.nimi ?? tyyppi;
}

export function myytavaMaaliTyypinNimi(tyyppi: MyytavaMaaliTyyppi): string {
  return MYYTAVAT_MAALI_TYYPIT.find((t) => t.arvo === tyyppi)?.nimi ?? tyyppi;
}

// Kategoriahinnoiteltavat tyypit (myydään aina omana työnä osalle) - alijoukko
// MAALI_TYYPIT:istä. Lakat/Muu eivät ole tässä, koska niitä ei myydä yksinään
// (lakka on candy/illusion-työn sisäänrakennettu osa tai solidin valinnainen lisä).
export const MYYTAVAT_MAALI_TYYPIT: { arvo: MyytavaMaaliTyyppi; nimi: string }[] =
  MAALI_TYYPIT.filter(
    (t): t is { arvo: MyytavaMaaliTyyppi; nimi: string } =>
      t.arvo === "solid" || t.arvo === "metallic" || t.arvo === "candy" || t.arvo === "illusion"
  );

export const TOINEN_VARI_ROOLIN_NIMI: Record<ToinenVariRooli, string> = {
  pohjavari: "Pohjaväri",
  lakka: "Lakka",
};

// Työn peruutuksen syyt. Yleisimmät kaksi ovat valmiina, ja "muu" avaa
// tekstiruudun - näin tavallinen peruutus on kahden klikkauksen takana mutta
// poikkeus saa silti oman selityksensä.
export const PERUUTUKSEN_SYYT: { arvo: PeruutuksenSyy; nimi: string }[] = [
  { arvo: "asiakas", nimi: "Asiakkaan peruutus" },
  { arvo: "virhe", nimi: "Virhe" },
  { arvo: "muu", nimi: "Muu" },
];

export function peruutuksenSyynNimi(syy: PeruutuksenSyy): string {
  return PERUUTUKSEN_SYYT.find((s) => s.arvo === syy)?.nimi ?? syy;
}

// Candy vaatii aina pohjavärin ja illusion aina lakan aktivoituakseen. Solidille
// ja metallicille lakkaus on valinnainen lisä: kaikki metallicit eivät sitä
// tarvitse, vaan vaatimus on värikohtainen tieto (varit.vaatii_lakkauksen) jonka
// valmistaja kertoo tuotekohtaisesti. Käytössä väri+hinta-valinnassa (Uusi työ,
// osan sivu).
export const PAKOLLINEN_TOINEN_VARI_ROOLI: Partial<Record<MyytavaMaaliTyyppi, ToinenVariRooli>> = {
  candy: "pohjavari",
  illusion: "lakka",
};
export const VALINNAINEN_TOINEN_VARI_ROOLI: Partial<Record<MyytavaMaaliTyyppi, ToinenVariRooli>> = {
  solid: "lakka",
  metallic: "lakka",
};

// Monikerrosmaalauksessa (candy, illusion, metallic, solid + lakkaus) maalaus- ja
// suojausvaihe tehdään jokaiselle värikerrokselle erikseen, joten niiden kesto
// kertautuu värien lukumäärällä. Muut vaiheet (pesu, maalinpoisto, puhallus)
// tehdään kerran riippumatta kerrosten määrästä.
export const VARIKERROKSITTAIN_KERTAUTUVAT_VAIHEET: TyoVaihe[] = ["maalaus", "teippaus"];

// Montako eri väriä/maalia kategorian työhön kuluu: pakollinen pohjaväri tai
// lakka lasketaan omaksi kerroksekseen.
export function kategorianVarienMaara(
  kategoria: MyytavaMaaliTyyppi,
  lakkausValittu = false
): number {
  if (PAKOLLINEN_TOINEN_VARI_ROOLI[kategoria]) return 2;
  return VALINNAINEN_TOINEN_VARI_ROOLI[kategoria] && lakkausValittu ? 2 : 1;
}

// Maalityypistä johtuva vaatimus, joka näytetään värin tiedoissa
// automaattisesti - ei erikseen asetettava tieto.
export const VARIN_LISAVAATIMUS: Partial<Record<MaaliTyyppi, string>> = {
  candy: "Candy vaatii aina pohjavärin - yleisimmin Super Chrome.",
  illusion: "Illusion vaatii aina lakan aktivoituakseen.",
};

export function varinLisavaatimus(tyyppi: MaaliTyyppi): string | null {
  return VARIN_LISAVAATIMUS[tyyppi] ?? null;
}

/** Vain candy tarvitsee varsinaisen pohjavärin; illusion ja metallic lakan. */
export function varinVaatiiPohjavarin(tyyppi: MaaliTyyppi): boolean {
  return tyyppi === "candy";
}

export function tyoVaiheenNimi(vaihe: TyoVaihe): string {
  return TYO_VAIHEET.find((v) => v.arvo === vaihe)?.nimi ?? vaihe;
}

/**
 * Ajoneuvotyypin näyttönimi. Tyypit ovat adminin hallinnoimaa dataa, joten
 * lista annetaan kutsussa - poistetun tyypin kohdalla näytetään avain, ettei
 * näkymä jää tyhjäksi.
 */
export function ajoneuvotyypinNimi(
  tyyppi: AjoneuvoTyyppi,
  tyypit: { avain: string; nimi: string }[]
): string {
  return tyypit.find((t) => t.avain === tyyppi)?.nimi ?? tyyppi;
}

/**
 * Muodostaa nimestä avaimen: pieniä kirjaimia, numeroita ja alaviivoja.
 * Avain on osalistan osoiteparametri ja osien viittaus, joten se ei saa
 * sisältää ääkkösiä eikä välilyöntejä.
 */
export function ajoneuvotyypinAvain(nimi: string): string {
  return nimi
    .toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function variTyypinNimi(tyyppi: VariTyyppi): string {
  return VARI_TYYPIT.find((t) => t.arvo === tyyppi)?.nimi ?? tyyppi;
}

export function muotoileEuro(arvo: number | null | undefined): string {
  if (arvo === null || arvo === undefined) return "-";
  return arvo.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
}

export function muotoileGrammat(arvo: number | null | undefined): string {
  if (arvo === null || arvo === undefined) return "-";
  return `${arvo.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} g`;
}

// Varastototaalit ovat kymmeniä kiloja, jolloin gramma on liian tarkka yksikkö
// luettavaksi. Sama esitystapa kuin Raportit-sivun kulutusluvuilla.
export function muotoileKilot(grammat: number | null | undefined): string {
  if (grammat === null || grammat === undefined) return "-";
  return `${(grammat / 1000).toLocaleString("fi-FI", { maximumFractionDigits: 2 })} kg`;
}

/** Prosenttiluku suomalaisittain: desimaalierottimena pilkku, ei turhia nollia. */
export function muotoileProsentti(arvo: number): string {
  return `${arvo.toLocaleString("fi-FI", { maximumFractionDigits: 2 })} %`;
}

export function muotoileValiEuro(min: number, max: number): string {
  return min === max ? muotoileEuro(min) : `${muotoileEuro(min)} - ${muotoileEuro(max)}`;
}

// Silmämääräinen värisävy värien suodatusta varten - ei koske lakkoja
// (transparent), koska ne ovat kirkkaita eikä niillä ole omaa sävyä.
// Kiiltoaste on vapaata valmistajatekstiä ("90 GU", "High Gloss (85+ GU)",
// "Seidenglanz"), joten haku ja suodatus nojaavat kolmeen kiinteään tasoon.
// Kanta päättelee tason kiiltoasteesta, admin voi ylikirjoittaa.
export const KIILTOTASOT: { arvo: Kiiltotaso; nimi: string }[] = [
  { arvo: "kiiltava", nimi: "Kiiltävä" },
  { arvo: "satiini", nimi: "Satiini" },
  { arvo: "matta", nimi: "Matta" },
];

export function kiiltotasonNimi(taso: Kiiltotaso): string {
  return KIILTOTASOT.find((t) => t.arvo === taso)?.nimi ?? taso;
}

export const VARISAVYT: { arvo: Varisavy; nimi: string }[] = [
  { arvo: "punainen", nimi: "Punainen" },
  { arvo: "oranssi", nimi: "Oranssi" },
  { arvo: "keltainen", nimi: "Keltainen" },
  { arvo: "vihrea", nimi: "Vihreä" },
  { arvo: "sininen", nimi: "Sininen" },
  { arvo: "liila", nimi: "Liila" },
  { arvo: "pinkki", nimi: "Pinkki" },
  { arvo: "musta", nimi: "Musta" },
  { arvo: "harmaa", nimi: "Harmaa" },
  { arvo: "valkoinen", nimi: "Valkoinen" },
  { arvo: "hopea", nimi: "Hopea" },
  { arvo: "kultainen", nimi: "Kultainen" },
  { arvo: "bronssi", nimi: "Bronssi" },
  { arvo: "ruskea", nimi: "Ruskea" },
];

// Värilistan järjestysvaihtoehdot. Hintajärjestykset piilotetaan käyttäjiltä,
// jotka eivät näe hintoja lainkaan.
export type VarienJarjestys =
  | "nimi"
  | "suosituin"
  | "saldo_laskeva"
  | "saldo_nouseva"
  | "hinta_nouseva"
  | "hinta_laskeva";

/** Montako tuotetta yhdelle sivulle mahtuu osa- ja värilistoilla. */
export const SIVUKOKO = 20;

/** Rajaa sivunumeron olemassa olevien sivujen joukkoon (vähintään 1). */
export function rajaaSivu(sivu: string | undefined, sivuja: number): number {
  const numero = Number(sivu);
  if (!Number.isInteger(numero) || numero < 1) return 1;
  return Math.min(numero, Math.max(sivuja, 1));
}

export const OLETUS_JARJESTYS: VarienJarjestys = "nimi";

export const JARJESTYKSET: { arvo: VarienJarjestys; nimi: string; vaatiiHinnat: boolean }[] = [
  { arvo: "nimi", nimi: "Nimen mukaan", vaatiiHinnat: false },
  // Suosio = värin käyttökerrat työriveillä ja arkistossa (varien_suosio-näkymä).
  { arvo: "suosituin", nimi: "Suosituin", vaatiiHinnat: false },
  { arvo: "saldo_laskeva", nimi: "Saldo laskeva", vaatiiHinnat: false },
  { arvo: "saldo_nouseva", nimi: "Saldo nouseva", vaatiiHinnat: false },
  { arvo: "hinta_nouseva", nimi: "Halvin ensin", vaatiiHinnat: true },
  { arvo: "hinta_laskeva", nimi: "Kallein ensin", vaatiiHinnat: true },
];

/** Pilkulla eroteltu monivalintasuodatin URL-parametrista listaksi. */
export function lueLista(arvo: string | null | undefined): string[] {
  if (!arvo) return [];
  return arvo
    .split(",")
    .map((osa) => osa.trim())
    .filter(Boolean);
}

export function varisavynNimi(savy: Varisavy): string {
  return VARISAVYT.find((s) => s.arvo === savy)?.nimi ?? savy;
}

// Havainnollistava CSS-väri per värisävy - käytössä suodattimen ja
// värikorttien pienessä väripallukassa.
export const VARISAVYN_VARIKOODI: Record<Varisavy, string> = {
  punainen: "#dc2626",
  oranssi: "#ea580c",
  keltainen: "#eab308",
  vihrea: "#16a34a",
  sininen: "#2563eb",
  liila: "#9333ea",
  pinkki: "#db2777",
  musta: "#262626",
  harmaa: "#6b7280",
  valkoinen: "#f8fafc",
  hopea: "#c0c0c0",
  kultainen: "#d4af37",
  bronssi: "#cd7f32",
  ruskea: "#78350f",
};

// Paras yritys päätellä värisävy värin nimestä avainsanoilla (englanti +
// suomi, alan yleiset tuotenimet). Ei täydellinen - vain lähtöarvaus, jonka
// admin voi aina korjata värin lomakkeella. Järjestys ratkaisee kun nimi
// osuu useampaan sävyyn (esim. "Golden Bronze") - metallit ensin, sitten
// akromaattiset, sitten kromaattiset sävyt.
// Sama lista on Edge Functionissa (supabase/functions/hae-tuotetiedot) -
// pidä ne synkassa, jotta "Hae tiedot" ja "Tunnista nimestä" päätyvät samaan
// sävyyn. Monikot mukana valmistajien kategorianimiä varten ("Reds", "Blues").
const VARISAVY_AVAINSANAT: [Varisavy, RegExp][] = [
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

export function paattelyVarisavy(nimi: string): Varisavy | null {
  const osuma = VARISAVY_AVAINSANAT.find(([, avainsana]) => avainsana.test(nimi));
  return osuma ? osuma[0] : null;
}

// ---------------------------------------------------------------------------
// Työn tila ja kiireellisyys
// ---------------------------------------------------------------------------

export const TYON_TILAN_NIMI: Record<TyonTila, string> = {
  vastaanotettu: "Vastaanotettu",
  vaiheessa: "Keskeneräinen",
  valmis: "Valmis",
};

/** Kiireellisyystaso vastaanotetulle työlle: mitä pidempään odottanut, sitä kiireisempi. */
export type Kiireellisyys = "ok" | "kiire" | "myohassa";

export const KIIREELLISYYDEN_NIMI: Record<Kiireellisyys, string> = {
  ok: "Aikataulussa",
  kiire: "Kiireellinen",
  myohassa: "Myöhässä",
};

/**
 * Väritäplän luokat. Punainen ja keltainen tulevat teeman varoitusväreistä,
 * jotta ne toimivat myös tummassa tilassa.
 */
export const KIIREELLISYYDEN_VARI: Record<Kiireellisyys, string> = {
  ok: "bg-success",
  kiire: "bg-warning",
  myohassa: "bg-destructive",
};

/** Montako vuorokautta työ on odottanut vastaanotosta. */
export function odotusPaivat(vastaanotettu: string, nyt: Date = new Date()): number {
  const ero = nyt.getTime() - new Date(vastaanotettu).getTime();
  return Math.max(0, Math.floor(ero / (24 * 60 * 60 * 1000)));
}

/**
 * Kiireellisyys odotusajan ja adminin asettamien rajojen mukaan. Rajat ovat
 * "työ pitäisi aloittaa x päivän sisällä": varoitusrajalla työ muuttuu
 * kiireelliseksi ja kriittisellä rajalla myöhässä olevaksi.
 */
export function kiireellisyys(
  odotettuPaivaa: number,
  rajat: { vastaanotto_varoitus_paivat: number; vastaanotto_kriittinen_paivat: number }
): Kiireellisyys {
  if (odotettuPaivaa >= rajat.vastaanotto_kriittinen_paivat) return "myohassa";
  if (odotettuPaivaa >= rajat.vastaanotto_varoitus_paivat) return "kiire";
  return "ok";
}

/** Työaika minuutteina luettavaksi tekstiksi: 95 min -> "1 h 35 min". */
export function muotoileKesto(minuutit: number): string {
  const pyoristetty = Math.round(minuutit);
  if (pyoristetty < 60) return `${pyoristetty} min`;
  const tunnit = Math.floor(pyoristetty / 60);
  const jaannos = pyoristetty % 60;
  return jaannos === 0 ? `${tunnit} h` : `${tunnit} h ${jaannos} min`;
}

/**
 * Osan arvioitu työaika minuutteina. Maalaus ja teippaus tehdään jokaiselle
 * värikerrokselle erikseen, joten ne kertautuvat värien lukumäärällä - sama
 * sääntö kuin työkustannuksen laskennassa.
 */
export function laskeTyoaikaMin(
  vaiheet: { vaihe: TyoVaihe; arvioitu_kesto_min: number }[],
  varienMaara = 1
): number {
  return vaiheet.reduce((summa, v) => {
    const kerroin = VARIKERROKSITTAIN_KERTAUTUVAT_VAIHEET.includes(v.vaihe) ? varienMaara : 1;
    return summa + v.arvioitu_kesto_min * kerroin;
  }, 0);
}

/** Kuukausien nimet ja lyhenteet. 0 = tammikuu, kuten Date.getUTCMonth(). */
export const KUUKAUDEN_NIMI = [
  "Tammikuu",
  "Helmikuu",
  "Maaliskuu",
  "Huhtikuu",
  "Toukokuu",
  "Kesäkuu",
  "Heinäkuu",
  "Elokuu",
  "Syyskuu",
  "Lokakuu",
  "Marraskuu",
  "Joulukuu",
];

export const KUUKAUDEN_LYHENNE = [
  "Tam",
  "Hel",
  "Maa",
  "Huh",
  "Tou",
  "Kes",
  "Hei",
  "Elo",
  "Syy",
  "Lok",
  "Mar",
  "Jou",
];
