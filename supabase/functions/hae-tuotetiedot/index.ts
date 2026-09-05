// Supabase Edge Function: "Hae tiedot" -painike värin muokkausnäkymässä.
// Admin antaa linkin myyjän tuotesivulle -> yritetään esitäyttää lomake.
// Kaikki poiminta on parhaan yrityksen heuristiikkaa: funktio ehdottaa, admin
// hyväksyy. Ajetaan vain admin-käyttäjän pyynnöstä, ei automaattisesti.
//
// Kaksi haaraa lähteen mukaan:
//
//   Shopify-kaupat (Pulverkönig / pulverlackfachhandel.de)
//     Tuotteen saa koneluettavana lisäämällä ".json" osoitteen perään.
//     Rakenne on vakaa eikä hajoa kun kauppa vaihtaa teemaa, joten sitä
//     kokeillaan ensin ja HTML jää varalle.
//
//   Muut (Prismatic Powders)
//     Open Graph -metatiedot ja tekstinparsinta sivun HTML:stä.
//
// Poimintalogiikka on poiminta.ts:ssä, jotta sen saa ajettua oikeita
// tuotesivuja vasten ilman Denoa. Täällä on verkko, tunnistautuminen ja
// kannan apufunktioiden kutsut.
//
// HUOM: toimituskuluarviota EI haeta myyjän sivulta (vaatisi ostoskori/osoite-
// automaation, hidasta ja haurasta) - ks. asetukset.toimituskulu_per_kg_*_oletus.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  alkuperaVerkkotunnuksesta,
  dekoodaaHtmlEntiteetit,
  htmlRiveiksi,
  kanoninenUrl,
  muunnaPerKg,
  nimiOtsikosta,
  poimiAlkupera,
  poimiEnglanninOhjeet,
  poimiHinta,
  poimiKiiltoaste,
  poimiKuva,
  poimiLakkausvaatimus,
  poimiLuokittelut,
  poimiMeta,
  poimiMetaNimella,
  poimiNimi,
  poimiOhjeet,
  poimiOhjeTiedosto,
  poimiPohjavariKuvaus,
  poimiTyyppi,
  poimiValmistaja,
  poimiVarisavy,
  pyoristaYlospain,
  ralTyyppi,
  shopifyJsonOsoite,
  shopifyHintavariantti,
  shopifyKilohinta,
  suomennaHakusanat,
  type Alkupera,
  type MaaliTyyppi,
  type ShopifyTuote,
  type Varisavy,
} from "./poiminta.ts";

interface HaeTiedotVastaus {
  nimi: string | null;
  valmistaja: string | null;
  kuva_url: string | null;
  ohje_tiedosto_url: string | null;
  ohjeet: string | null;
  /** Alkuperäinen tuoteotsikko, jotta haku löytää värin myös myyjän sanoilla. */
  hakusanat: string | null;
  /** Tuotesivun osoite ilman seurantaparametreja. */
  myyja_linkki: string | null;
  kiiltoaste: string | null;
  tyyppi: MaaliTyyppi | null;
  varisavy: Varisavy | null;
  vaatii_pohjavarin: boolean;
  vaatii_lakkauksen: boolean;
  pohjavari_kuvaus: string | null;
  alkupera: Alkupera | null;
  ostohinta_per_kg: number | null;
  alkuperainen_hinta: number | null;
  alkuperainen_valuutta: string | null;
  alkuperainen_yksikko: string | null;
  virhe: string | null;
}

function tyhjaVastaus(virhe: string | null = null): HaeTiedotVastaus {
  return {
    nimi: null,
    valmistaja: null,
    kuva_url: null,
    ohje_tiedosto_url: null,
    ohjeet: null,
    hakusanat: null,
    myyja_linkki: null,
    kiiltoaste: null,
    tyyppi: null,
    varisavy: null,
    vaatii_pohjavarin: false,
    vaatii_lakkauksen: false,
    pohjavari_kuvaus: null,
    alkupera: null,
    ostohinta_per_kg: null,
    alkuperainen_hinta: null,
    alkuperainen_valuutta: null,
    alkuperainen_yksikko: null,
    virhe,
  };
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

async function haeTeksti(url: string, aikakatkaisuMs = 10_000): Promise<string> {
  const vastaus = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; JauhemaalaamoBot/1.0)" },
    signal: AbortSignal.timeout(aikakatkaisuMs),
  });
  if (!vastaus.ok) throw new Error(`HTTP ${vastaus.status}`);
  return await vastaus.text();
}

/** Shopifyn tuote-JSON, tai null jos osoite ei ole Shopify-tuote tai ei vastaa. */
async function haeShopifyTuote(url: string): Promise<ShopifyTuote | null> {
  const jsonOsoite = shopifyJsonOsoite(url);
  if (!jsonOsoite) return null;
  try {
    const teksti = await haeTeksti(jsonOsoite, 8_000);
    const data = JSON.parse(teksti);
    const tuote = data?.product;
    return tuote && typeof tuote.title === "string" ? (tuote as ShopifyTuote) : null;
  } catch {
    return null;
  }
}

/** Kannan RAL-apurit: yksi määritelmä, jota sekä kanta että tämä funktio käyttää. */
async function ralKoodi(supabase: SupabaseClient, teksti: string): Promise<string | null> {
  const { data } = await supabase.rpc("ral_koodi", { p_teksti: teksti });
  return typeof data === "string" ? data : null;
}

async function ralVarisavy(supabase: SupabaseClient, koodi: string): Promise<Varisavy | null> {
  const { data } = await supabase.rpc("ral_varisavy", { p_koodi: koodi });
  return typeof data === "string" ? (data as Varisavy) : null;
}

/**
 * Shopify-tuotteesta koottu vastaus. HTML haetaan vain kuvan varalle, jos
 * JSONissa ei ole kuvia - muuten koko sivua ei tarvitse ladata.
 */
function shopifystaVastaus(
  tuote: ShopifyTuote,
  osoite: string,
  ralkoodi: string | null
): HaeTiedotVastaus {
  const otsikko = dekoodaaHtmlEntiteetit(tuote.title ?? "");
  const rivit = htmlRiveiksi(tuote.body_html ?? "");
  const kuvausTeksti = `${otsikko} ${rivit.join(" ")}`;

  const variantti = shopifyHintavariantti(tuote);
  const kilohinta = variantti ? shopifyKilohinta(variantti) : null;

  const tyyppi = ralkoodi
    ? ralTyyppi(kuvausTeksti)
    : poimiTyyppi(otsikko, [tuote.product_type, tuote.tags].flat().join(" "), kuvausTeksti);

  const vastaus = tyhjaVastaus();
  vastaus.nimi = nimiOtsikosta(otsikko, ralkoodi);
  vastaus.valmistaja = tuote.vendor?.trim() || null;
  vastaus.kuva_url = tuote.images?.[0]?.src ?? null;
  vastaus.ohjeet = poimiOhjeet(rivit);
  // Hakusanoihin sekä valmistajan alkuperäinen otsikko että sen suomennos:
  // haku "Tiefschwarz", "hochglanz", "syvänmusta" tai "korkeakiilto" löytää
  // värin, vaikka nimeksi jäi pelkkä RAL-koodi.
  vastaus.hakusanat = suomennaHakusanat(otsikko);
  vastaus.myyja_linkki = osoite;
  vastaus.kiiltoaste = poimiKiiltoaste(kuvausTeksti);
  vastaus.tyyppi = tyyppi;
  vastaus.vaatii_pohjavarin = tyyppi === "candy" || tyyppi === "illusion" || tyyppi === "transparent";
  vastaus.vaatii_lakkauksen = poimiLakkausvaatimus(tyyppi, kuvausTeksti);
  vastaus.pohjavari_kuvaus = poimiPohjavariKuvaus(tyyppi, kuvausTeksti);
  vastaus.alkupera = alkuperaVerkkotunnuksesta(osoite) ?? poimiAlkupera(kuvausTeksti);
  // Saksalainen hinta sisältää Saksan ALV:n ja on siksi sellaisenaan
  // maalaamon todellinen kustannus: sitä ei muunneta suuntaan eikä toiseen.
  vastaus.ostohinta_per_kg = kilohinta === null ? null : pyoristaYlospain(kilohinta);
  vastaus.alkuperainen_hinta = variantti?.price ? Number(variantti.price) : null;
  vastaus.alkuperainen_valuutta = variantti?.price_currency ?? "EUR";
  vastaus.alkuperainen_yksikko = variantti?.option1 ?? variantti?.title ?? null;

  if (vastaus.ostohinta_per_kg === null && variantti) {
    vastaus.virhe =
      "Pakkauskokoa ei osattu lukea, joten kilohinta jäi täyttämättä - täytä ostohinta käsin.";
  }
  return vastaus;
}

/** Open Graph -metatiedot ja tekstinparsinta (Prismatic Powders ja muut). */
async function htmlstaVastaus(html: string, osoite: string): Promise<HaeTiedotVastaus> {
  const kuvausTeksti = dekoodaaHtmlEntiteetit(
    `${poimiMeta(html, "og:title") ?? ""} ${poimiMeta(html, "og:description") ?? ""} ${
      poimiMetaNimella(html, "description") ?? ""
    } ${poimiMetaNimella(html, "keywords") ?? ""}`
  );

  const nimi = poimiNimi(html);
  const luokittelut = poimiLuokittelut(html);
  const tyyppi = poimiTyyppi(nimi, luokittelut, kuvausTeksti);

  // Ohjeet luetaan pelkästä tuotekuvauksesta: kuvausTeksti sisältää saman
  // tekstin kahdesti (og-tagi ja meta-kuvaus) sekä otsikon, eikä otsikossa ole
  // ohjeita.
  const tuotekuvaus = dekoodaaHtmlEntiteetit(
    poimiMeta(html, "og:description") ?? poimiMetaNimella(html, "description") ?? ""
  );

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

  const vastaus = tyhjaVastaus();
  vastaus.nimi = nimi;
  vastaus.valmistaja = poimiValmistaja(html);
  vastaus.kuva_url = poimiKuva(html, osoite);
  vastaus.ohje_tiedosto_url = poimiOhjeTiedosto(html, osoite);
  vastaus.ohjeet = poimiEnglanninOhjeet(tuotekuvaus);
  vastaus.hakusanat = suomennaHakusanat(nimi ?? "");
  vastaus.myyja_linkki = osoite;
  vastaus.kiiltoaste = poimiKiiltoaste(kuvausTeksti);
  vastaus.tyyppi = tyyppi;
  vastaus.varisavy = poimiVarisavy(tyyppi, nimi, luokittelut, kuvausTeksti);
  vastaus.vaatii_pohjavarin = tyyppi === "candy" || tyyppi === "illusion" || tyyppi === "transparent";
  // Lakkaussuositus voi olla missä tahansa kohtaa sivun tekstiä, joten
  // katsotaan sekä tiivistelmä että koko HTML.
  vastaus.vaatii_lakkauksen = poimiLakkausvaatimus(tyyppi, `${kuvausTeksti} ${html}`);
  vastaus.pohjavari_kuvaus = poimiPohjavariKuvaus(tyyppi, html);
  vastaus.alkupera = poimiAlkupera(html) ?? alkuperaVerkkotunnuksesta(osoite);
  vastaus.ostohinta_per_kg = ostohintaPerKg;
  vastaus.alkuperainen_hinta = raakaHinta?.hinta ?? null;
  vastaus.alkuperainen_valuutta = raakaHinta?.valuutta ?? null;
  vastaus.alkuperainen_yksikko = raakaHinta?.yksikko ?? null;
  vastaus.virhe = varoitukset.length > 0 ? varoitukset.join(" ") : null;
  return vastaus;
}

function json(vastaus: HaeTiedotVastaus | { virhe: string }, status = 200): Response {
  return new Response(JSON.stringify(vastaus), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ virhe: "Ei kirjautunut" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ virhe: "Ei kirjautunut" }, 401);

    const { data: profiili } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profiili?.role !== "admin") return json({ virhe: "Vain admin voi hakea tiedot" }, 403);

    const { url } = await req.json();
    if (!url || typeof url !== "string") return json({ virhe: "Linkki puuttuu" }, 400);

    const osoite = kanoninenUrl(url);

    // Shopify-JSON ensin: se on rakenteinen eikä hajoa teemamuutoksesta.
    const shopify = await haeShopifyTuote(osoite);
    let vastaus: HaeTiedotVastaus;

    if (shopify) {
      const koodi = await ralKoodi(supabase, shopify.title ?? "");
      vastaus = shopifystaVastaus(shopify, osoite, koodi);
      // Värisävy RAL-koodista on esitäyttö, ei totuus - admin voi korjata sen
      // värin sivulla. Lakalle sävyä ei aseteta lainkaan.
      if (koodi && vastaus.tyyppi !== "transparent") {
        vastaus.varisavy = await ralVarisavy(supabase, koodi);
      }
    } else {
      let html: string;
      try {
        html = await haeTeksti(osoite);
      } catch (haku_virhe) {
        return json(tyhjaVastaus(`Sivua ei voitu hakea: ${(haku_virhe as Error).message}`));
      }
      vastaus = await htmlstaVastaus(html, osoite);

      // Myös HTML-lähteen otsikossa voi olla RAL-koodi (esim. toinen
      // eurooppalainen kauppa), jolloin nimi lyhenee samalla säännöllä.
      const koodi = await ralKoodi(supabase, vastaus.nimi ?? "");
      if (koodi) {
        // Nimi lyhenee koodiksi, joten otsikon sanat siirtyvät hakusanoiksi.
        vastaus.hakusanat = suomennaHakusanat(vastaus.nimi ?? "") ?? vastaus.hakusanat;
        vastaus.nimi = koodi;
        if (!vastaus.varisavy && vastaus.tyyppi !== "transparent") {
          vastaus.varisavy = await ralVarisavy(supabase, koodi);
        }
      }
    }

    const mitaanEiLoytynyt =
      !vastaus.nimi && !vastaus.kuva_url && !vastaus.ohje_tiedosto_url && !vastaus.ostohinta_per_kg;
    if (mitaanEiLoytynyt && !vastaus.virhe) {
      vastaus.virhe = "Tietoja ei löytynyt sivulta - täytä tiedot käsin.";
    }

    return json(vastaus);
  } catch (error) {
    return json({ virhe: `Odottamaton virhe: ${(error as Error).message}` }, 500);
  }
});
