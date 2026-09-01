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

// Varastototaalit ovat kymmeniä kiloja, jolloin gramma on liian tarkka yksikkö
// luettavaksi. Sama esitystapa kuin Raportit-sivun kulutusluvuilla.
export function muotoileKilot(grammat: number | null | undefined): string {
  if (grammat === null || grammat === undefined) return "-";
  return `${(grammat / 1000).toLocaleString("fi-FI", { maximumFractionDigits: 2 })} kg`;
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

// Saldon kolmijako. Sama kynnys kuin saldopalkin väreissä (saldo-palkki.tsx
// käyttää tätä funktiota), jottei suodatin ja palkki voi olla eri mieltä siitä
// mikä on "vähissä".
export type SaldoTila = "loppumassa" | "vahissa" | "riittava";

export const SALDO_TILAT: { arvo: SaldoTila; nimi: string; luokka: string }[] = [
  { arvo: "loppumassa", nimi: "Hälytysrajalla tai alle", luokka: "bg-destructive" },
  { arvo: "vahissa", nimi: "Vähissä", luokka: "bg-warning" },
  { arvo: "riittava", nimi: "Riittävästi", luokka: "bg-success" },
];

/**
 * Saldon tila suhteessa hälytysrajaan, ei absoluuttiseen määrään: 300 g on
 * paljon jos raja on 200 g ja vähän jos raja on 1000 g.
 *
 * Ilman hälytysrajaa väri katsotaan riittäväksi jos saldoa on lainkaan.
 */
export function saldonTila(saldoG: number, halytysrajaG: number): SaldoTila {
  const suhde = halytysrajaG > 0 ? saldoG / halytysrajaG : saldoG > 0 ? 2 : 0;
  if (suhde <= 1) return "loppumassa";
  if (suhde <= 1.5) return "vahissa";
  return "riittava";
}

/** Pienempi luku = kiireellisempi täydennys. Käytetään täydennystarve-järjestykseen. */
export function saldonSuhde(saldoG: number, halytysrajaG: number): number {
  return halytysrajaG > 0 ? saldoG / halytysrajaG : saldoG > 0 ? Number.POSITIVE_INFINITY : 0;
}

// Värilistan järjestysvaihtoehdot. Hintajärjestykset piilotetaan käyttäjiltä,
// jotka eivät näe hintoja lainkaan.
export type VarienJarjestys = "nimi" | "taydennystarve" | "hinta_nouseva" | "hinta_laskeva";

export const OLETUS_JARJESTYS: VarienJarjestys = "nimi";

export const JARJESTYKSET: { arvo: VarienJarjestys; nimi: string; vaatiiHinnat: boolean }[] = [
  { arvo: "nimi", nimi: "Nimen mukaan", vaatiiHinnat: false },
  { arvo: "taydennystarve", nimi: "Täydennystarve ensin", vaatiiHinnat: false },
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
  ["hopea", /\b(silvers?|chrome|chromium|hopea|kromi)\b/i],
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
];

export function paattelyVarisavy(nimi: string): Varisavy | null {
  const osuma = VARISAVY_AVAINSANAT.find(([, avainsana]) => avainsana.test(nimi));
  return osuma ? osuma[0] : null;
}
