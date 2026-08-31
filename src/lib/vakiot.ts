import type {
  AjoneuvoTyyppi,
  MaaliTyyppi,
  MyytavaMaaliTyyppi,
  ToinenVariRooli,
  TyoVaihe,
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

export const AJONEUVOTYYPIT: { arvo: AjoneuvoTyyppi; nimi: string }[] = [
  { arvo: "auto", nimi: "Auto" },
  { arvo: "mopo", nimi: "Mopo" },
  { arvo: "moottoripyora", nimi: "Moottoripyörä" },
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

// Candy vaatii aina pohjavärin, metallic ja illusion aina lakan (metallic
// tarvitsee lakkauksen vain omana värinään - ei kun sitä käytetään candyn
// pohjavärinä) - solidille lakkaus on valinnainen lisä. Käytössä
// väri+hinta-valinnassa (Uusi työ, osan sivu).
export const PAKOLLINEN_TOINEN_VARI_ROOLI: Partial<Record<MyytavaMaaliTyyppi, ToinenVariRooli>> = {
  candy: "pohjavari",
  metallic: "lakka",
  illusion: "lakka",
};
export const VALINNAINEN_TOINEN_VARI_ROOLI: Partial<Record<MyytavaMaaliTyyppi, ToinenVariRooli>> = {
  solid: "lakka",
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
  metallic: "Metallic vaatii lakkauksen UV-suojaksi.",
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

export function ajoneuvotyypinNimi(tyyppi: AjoneuvoTyyppi): string {
  return AJONEUVOTYYPIT.find((t) => t.arvo === tyyppi)?.nimi ?? tyyppi;
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

export function muotoileValiEuro(min: number, max: number): string {
  return min === max ? muotoileEuro(min) : `${muotoileEuro(min)} - ${muotoileEuro(max)}`;
}

// Silmämääräinen värisävy värien suodatusta varten - ei koske lakkoja
// (transparent), koska ne ovat kirkkaita eikä niillä ole omaa sävyä.
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
const VARISAVY_AVAINSANAT: [Varisavy, RegExp][] = [
  ["hopea", /\b(silver|chrome|chromium|hopea|kromi)\b/i],
  ["kultainen", /\b(gold|golden|kulta|kultainen)\b/i],
  ["bronssi", /\b(bronze|copper|pronssi|kupari|bronssi)\b/i],
  ["musta", /\b(black|musta|onyx|jet|ebony)\b/i],
  ["valkoinen", /\b(white|valkoinen|pearl|ivory)\b/i],
  ["harmaa", /\b(gr[ae]y|harmaa|graphite|gunmetal|charcoal|slate)\b/i],
  ["ruskea", /\b(brown|ruskea|chocolate|coffee|mocha|tan|chestnut|beige)\b/i],
  ["punainen", /\b(red|punainen|ruby|cherry|crimson|scarlet|maroon)\b/i],
  ["oranssi", /\b(orange|oranssi|tangerine|amber)\b/i],
  ["keltainen", /\b(yellow|keltainen|lemon|banana|sunflower)\b/i],
  ["vihrea", /\b(green|vihre[äa]|lime|emerald|olive|mint|forest)\b/i],
  ["sininen", /\b(blue|sininen|navy|azure|cobalt|teal|sky)\b/i],
  ["liila", /\b(purple|violet|liila|lilac|lavender|plum|grape)\b/i],
  ["pinkki", /\b(pink|pinkki|magenta|fuchsia|rose|salmon)\b/i],
];

export function paattelyVarisavy(nimi: string): Varisavy | null {
  const osuma = VARISAVY_AVAINSANAT.find(([, avainsana]) => avainsana.test(nimi));
  return osuma ? osuma[0] : null;
}
