// Supabase Edge Function: "Hae tiedot" -painike värin muokkausnäkymässä.
// Admin antaa linkin valmistajan tuotesivulle -> yritetään poimia sivun
// julkisesta HTML-sisällöstä (Open Graph -tagit + sivulle upotettu JSON):
//   - nimi (ilman valmistajan tuotekoodia, esim. "(PMS-11514)"), valmistaja,
//     tuotekuva (täysikokoinen jos löytyy)
//   - kiiltoaste ja maalin tyyppi (solid/transparent/candy/illusion/metallic/pohjavari)
//   - värisävy suodatusta varten (punainen, sininen, ...) - ei lakoille
//   - pohjavärivaatimus tyypin perusteella (candy/illusion/transparent)
//   - tuotekohtainen ohje-/datasheet-PDF (ei yleistä levitysopasta tai SDS:ää)
//   - hinta: muunnetaan tarvittaessa lb->kg ja valuutta EUR:ksi (frankfurter.app,
//     EKP:n kurssit, ei API-avainta), pyöristetään aina ylöspäin
//   - alkuperä ("Made in ..." -maininnasta)
// Kaikki poiminta on parhaan yrityksen heuristiikkaa - admin voi aina muokata
// tuloksia lomakkeella. Ajetaan vain admin-käyttäjän pyynnöstä, ei automaattisesti.
//
// HUOM: toimituskuluarviota EI haeta myyjän sivulta (vaatisi ostoskori/osoite-
// automaation, hidasta ja haurasta) - ks. asetukset.toimituskulu_per_kg_*_oletus.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type Alkupera = "EU" | "USA" | "muu";
type MaaliTyyppi =
  | "solid"
  | "transparent"
  | "candy"
  | "illusion"
  | "metallic"
  | "pohjavari"
  | "muu";
type Varisavy =
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

interface HaeTiedotVastaus {
  nimi: string | null;
  valmistaja: string | null;
  kuva_url: string | null;
  ohje_tiedosto_url: string | null;
  kiiltoaste: string | null;
  tyyppi: MaaliTyyppi | null;
  varisavy: Varisavy | null;
  vaatii_pohjavarin: boolean;
  pohjavari_kuvaus: string | null;
  alkupera: Alkupera | null;
  ostohinta_per_kg: number | null;
  alkuperainen_hinta: number | null;
  alkuperainen_valuutta: string | null;
  alkuperainen_yksikko: string | null;
  virhe: string | null;
}

const KG_PER_LB = 0.45359237;
const KG_PER_OZ = 0.028349523125;

function poimiMeta(html: string, property: string): string | null {
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

function dekoodaaHtmlEntiteetit(teksti: string): string {
  return teksti
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absoluuttinenUrl(url: string | null, baseUrl: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

// Valmistajan tuotekoodia suluissa (esim. "Illusion Cherry (PMS-11514)") ei
// tallenneta - se ei kerro mitään maalista ja sotkee nimen listoissa.
function poistaTuotekoodi(nimi: string): string {
  return nimi.replace(/\s*\([A-Za-z0-9][A-Za-z0-9-]*\)/g, "").trim();
}

// og:title on usein muotoa "Nimi (KOODI) - Kuvaus | Sivuston nimi".
// Poimitaan pelkkä nimi: katkaistaan koodiin, muuten ensimmäiseen "|"-osaan.
function poimiNimi(html: string): string | null {
  const ogTitle = poimiMeta(html, "og:title");
  if (!ogTitle) return null;
  const otsikko = dekoodaaHtmlEntiteetit(ogTitle).trim();
  const koodiMatch = otsikko.match(/^(.*?)\s*\([A-Za-z0-9][A-Za-z0-9-]*\)/);
  const nimi = poistaTuotekoodi(koodiMatch ? koodiMatch[1] : otsikko.split("|")[0]);
  return nimi || null;
}

function poimiValmistaja(html: string): string | null {
  const nimi = poimiMeta(html, "og:site_name");
  return nimi ? dekoodaaHtmlEntiteetit(nimi).trim() : null;
}

// og:image on usein pieni "-thumbnail"-versio; yritetään täysikokoista
// samasta polusta poistamalla "-thumbnail" tiedostopäätteen edestä.
function poimiKuva(html: string, baseUrl: string): string | null {
  const ogImage = poimiMeta(html, "og:image");
  if (!ogImage) return null;
  const isoVersio = ogImage.replace(/-thumbnail(?=\.[a-zA-Z]+($|\?))/, "");
  return absoluuttinenUrl(isoVersio, baseUrl);
}

// Ohitetaan yleiset, ei-tuotekohtaiset PDF:t (käyttöturvallisuustiedote,
// yleinen levitysopas) ja valitaan viimeinen jäljelle jäävä linkki - tuote-
// kohtainen datasheet on tyypillisesti listattu näiden jälkeen.
function poimiOhjeTiedosto(html: string, baseUrl: string): string | null {
  const linkit = [...html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)].map((m) => m[1]);
  if (linkit.length === 0) return null;
  const yleiset = /(sds|safety[-_]?data|application[-_]?guide|app[-_]?guide|installation[-_]?guide)/i;
  const tuotekohtaiset = linkit.filter((l) => !yleiset.test(l));
  const valinta = tuotekohtaiset.length > 0 ? tuotekohtaiset[tuotekohtaiset.length - 1] : linkit[linkit.length - 1];
  return absoluuttinenUrl(valinta, baseUrl);
}

function poimiKiiltoaste(teksti: string): string | null {
  const luokkaJaYksikot = teksti.match(
    /\b(High Gloss|Semi[- ]?Gloss|Satin|Matte|Flat)\b[^.]{0,60}?(\d+\+?(?:\s*[-–]\s*\d+)?)\s*Gloss Units?/i
  );
  if (luokkaJaYksikot) {
    return `${luokkaJaYksikot[1].trim()} (${luokkaJaYksikot[2].trim()} GU)`;
  }
  const pelkatYksikot = teksti.match(/(\d+\+?(?:\s*[-–]\s*\d+)?)\s*Gloss Units?/i);
  if (pelkatYksikot) return `${pelkatYksikot[1].trim()} GU`;
  const pelkkaLuokka = teksti.match(/\b(High Gloss|Semi[- ]?Gloss|Satin|Matte|Flat)\b/i);
  return pelkkaLuokka ? pelkkaLuokka[1].trim() : null;
}

// meta name="..." (description, keywords) - täydentää og-tageja.
function poimiMetaNimella(html: string, name: string): string | null {
  const re1 = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i");
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

// Sivulle upotetusta JSON:ista löytyy usein tuotteen luokittelu (kokoelma,
// sarja, kategoria, murupolku) - se kertoo maalin tyylin luotettavammin kuin
// markkinointiteksti. Lainausmerkit voivat olla backslash-paettuina, ks. poimiHinta.
const LUOKITTELUAVAIMET = [
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

function poimiLuokittelut(html: string): string {
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
const TYYPPI_AVAINSANAT: [MaaliTyyppi, RegExp][] = [
  ["illusion", /\b(illusions?|illuusio)\b/i],
  ["candy", /\b(cand(?:y|ies)|kandi)\b/i],
  [
    "transparent",
    /\b(clears?|clear\s?coats?|clearcoats?|top\s?coats?|topcoats?|transparents?|translucent|lakka|lakat|kirkaslakka)\b/i,
  ],
  ["pohjavari", /\b(base\s?coats?|basecoats?|primers?|undercoats?|pohjav[äa]ri|pohjamaali)\b/i],
  [
    "metallic",
    /\b(metallics?|metallic-|metalli(?:nen|set)?|pearlescent|pearls?|micas?|sparkles?|anodized)\b/i,
  ],
  ["solid", /\b(solids?|ral\s?\d{3,4}|flat\s?colou?rs?|yksiv[äa]rinen)\b/i],
];

function tunnistaTyyppi(teksti: string): MaaliTyyppi | null {
  const osuma = TYYPPI_AVAINSANAT.find(([, avainsana]) => avainsana.test(teksti));
  return osuma ? osuma[0] : null;
}

// Tunnistus kolmessa portaassa luotettavuusjärjestyksessä: tuotteen nimi on
// vahvin signaali ("Illusion Cherry", "Clear Vision"), sitten sivun oma
// luokittelu ("Candies", "Clears") ja vasta viimeisenä markkinointiteksti -
// se mainitsee lakkasivullakin helposti candyt ja illusionit.
function poimiTyyppi(
  nimi: string | null,
  luokittelut: string,
  kuvausTeksti: string
): MaaliTyyppi | null {
  return (
    (nimi ? tunnistaTyyppi(nimi) : null) ??
    tunnistaTyyppi(luokittelut) ??
    tunnistaTyyppi(kuvausTeksti)
  );
}

// Sama heuristiikka kuin sovelluksen paattelyVarisavy (src/lib/vakiot.ts) -
// pidä listat synkassa. Järjestys ratkaisee kun nimi osuu useampaan sävyyn
// (esim. "Golden Bronze"): metallit ensin, sitten akromaattiset, sitten muut.
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

function tunnistaVarisavy(teksti: string): Varisavy | null {
  const osuma = VARISAVY_AVAINSANAT.find(([, avainsana]) => avainsana.test(teksti));
  return osuma ? osuma[0] : null;
}

// Markkinointiteksti mainitsee helposti muitakin värejä ("looks great over
// black"), joten siitä hyväksytään sävy vain jos koko teksti puhuu yhdestä
// ainoasta sävystä. Muuten jätetään tyhjäksi - admin valitsee lomakkeelta.
function ainoaSavyTekstissa(teksti: string): Varisavy | null {
  const osumat = VARISAVY_AVAINSANAT.filter(([, avainsana]) => avainsana.test(teksti));
  return osumat.length === 1 ? osumat[0][0] : null;
}

// Värisävy on vain suodatusta varten. Lakoille sitä ei aseteta (kirkas maali,
// ei omaa sävyä). Nimi ratkaisee ensin, sitten sivun luokittelu ("Reds",
// "Blues") ja viimeisenä yksiselitteinen kuvausteksti.
function poimiVarisavy(
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

function poimiPohjavariKuvaus(tyyppi: MaaliTyyppi | null, html: string): string | null {
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

function poimiAlkupera(html: string): Alkupera | null {
  if (/made in (the )?usa/i.test(html)) return "USA";
  if (/made in (the )?(eu|europe|european union)/i.test(html)) return "EU";
  return null;
}

interface RaakaHinta {
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
function poimiHinta(html: string): RaakaHinta | null {
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

function muunnaPerKg(hinta: number, yksikko: string): number | null {
  const y = yksikko.toLowerCase();
  if (y === "kg" || y === "kilogram" || y === "kilograms") return hinta;
  if (y === "lb" || y === "lbs" || y === "pound" || y === "pounds") return hinta / KG_PER_LB;
  if (y === "g" || y === "gram" || y === "grams") return hinta * 1000;
  if (y === "oz" || y === "ounce" || y === "ounces") return hinta / KG_PER_OZ;
  return null;
}

async function muunnaEuroiksi(maara: number, valuutta: string): Promise<number | null> {
  if (valuutta === "EUR") return maara;
  try {
    const vastaus = await fetch(
      `https://api.frankfurter.app/latest?amount=${maara}&from=${valuutta}&to=EUR`,
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!vastaus.ok) return null;
    const data = await vastaus.json();
    const arvo = data?.rates?.EUR;
    return typeof arvo === "number" ? arvo : null;
  } catch {
    return null;
  }
}

function pyoristaYlospain(arvo: number): number {
  return Math.ceil(arvo * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ virhe: "Ei kirjautunut" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ virhe: "Ei kirjautunut" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiili } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profiili?.role !== "admin") {
      return new Response(JSON.stringify({ virhe: "Vain admin voi hakea tiedot" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ virhe: "Linkki puuttuu" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let html: string;
    try {
      const vastaus = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JauhemaalaamoBot/1.0)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!vastaus.ok) {
        throw new Error(`HTTP ${vastaus.status}`);
      }
      html = await vastaus.text();
    } catch (haku_virhe) {
      const vastaus: HaeTiedotVastaus = {
        nimi: null,
        valmistaja: null,
        kuva_url: null,
        ohje_tiedosto_url: null,
        kiiltoaste: null,
        tyyppi: null,
        varisavy: null,
        vaatii_pohjavarin: false,
        pohjavari_kuvaus: null,
        alkupera: null,
        ostohinta_per_kg: null,
        alkuperainen_hinta: null,
        alkuperainen_valuutta: null,
        alkuperainen_yksikko: null,
        virhe: `Sivua ei voitu hakea: ${(haku_virhe as Error).message}`,
      };
      return new Response(JSON.stringify(vastaus), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const kuvausTeksti = dekoodaaHtmlEntiteetit(
      `${poimiMeta(html, "og:title") ?? ""} ${poimiMeta(html, "og:description") ?? ""} ${
        poimiMetaNimella(html, "description") ?? ""
      } ${poimiMetaNimella(html, "keywords") ?? ""}`
    );

    const nimi = poimiNimi(html);
    const luokittelut = poimiLuokittelut(html);

    const tyyppi = poimiTyyppi(nimi, luokittelut, kuvausTeksti);
    const varisavy = poimiVarisavy(tyyppi, nimi, luokittelut, kuvausTeksti);
    const vaatiiPohjavarin = tyyppi === "candy" || tyyppi === "illusion" || tyyppi === "transparent";

    const raakaHinta = poimiHinta(html);
    let ostohintaPerKg: number | null = null;
    const varoitukset: string[] = [];

    if (raakaHinta) {
      const perKgAlkuperaisessaValuutassa = muunnaPerKg(raakaHinta.hinta, raakaHinta.yksikko);
      if (perKgAlkuperaisessaValuutassa === null) {
        varoitukset.push(
          `Hinta löytyi (${raakaHinta.hinta} ${raakaHinta.valuutta}/${raakaHinta.yksikko}), mutta yksikköä ei osattu muuntaa kiloiksi - täytä ostohinta käsin.`
        );
      } else {
        const euroina = await muunnaEuroiksi(perKgAlkuperaisessaValuutassa, raakaHinta.valuutta);
        if (euroina === null) {
          varoitukset.push(
            `Hinta löytyi (${raakaHinta.hinta} ${raakaHinta.valuutta}/${raakaHinta.yksikko}), mutta valuutanmuunnos epäonnistui - täytä ostohinta käsin.`
          );
        } else {
          ostohintaPerKg = pyoristaYlospain(euroina);
        }
      }
    }

    const vastaus: HaeTiedotVastaus = {
      nimi,
      valmistaja: poimiValmistaja(html),
      kuva_url: poimiKuva(html, url),
      ohje_tiedosto_url: poimiOhjeTiedosto(html, url),
      kiiltoaste: poimiKiiltoaste(kuvausTeksti),
      tyyppi,
      varisavy,
      vaatii_pohjavarin: vaatiiPohjavarin,
      pohjavari_kuvaus: poimiPohjavariKuvaus(tyyppi, html),
      alkupera: poimiAlkupera(html),
      ostohinta_per_kg: ostohintaPerKg,
      alkuperainen_hinta: raakaHinta?.hinta ?? null,
      alkuperainen_valuutta: raakaHinta?.valuutta ?? null,
      alkuperainen_yksikko: raakaHinta?.yksikko ?? null,
      virhe: varoitukset.length > 0 ? varoitukset.join(" ") : null,
    };

    const mitaanEiLoytynyt =
      !vastaus.nimi &&
      !vastaus.kuva_url &&
      !vastaus.ohje_tiedosto_url &&
      !vastaus.ostohinta_per_kg;
    if (mitaanEiLoytynyt && !vastaus.virhe) {
      vastaus.virhe = "Tietoja ei löytynyt sivulta - täytä tiedot käsin.";
    }

    return new Response(JSON.stringify(vastaus), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ virhe: `Odottamaton virhe: ${(error as Error).message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
