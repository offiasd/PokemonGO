// Supabase Edge Function: "Lue kuitti" -painike kuitin sivulla.
// Vision-malli lukee Storageen tallennetun kuitin ja palauttaa rivit,
// päiväyksen, toimittajan, loppusumman ja ALV-erittelyn.
//
// Funktio ei kirjoita kantaan mitään. Se palauttaa poiminnan lomakkeelle,
// jossa käyttäjä tarkistaa ja tallentaa: poiminta on ehdotus, ei totuus,
// ja sama tallennuspolku pysyy yhtenä riippumatta siitä tuliko tieto
// mallilta vai näppäimistöltä.
//
// Avaimeton ympäristö on sallittu tila: ilman ANTHROPIC_API_KEY:tä funktio
// palauttaa siistin suomenkielisen viestin eikä kaadu, jolloin käsinsyöttö
// toimii kuten ennenkin.
//
// Poimintalogiikka on poiminta.ts:ssä, jotta täsmäytyksen saa ajettua
// oikeita kuitteja vasten ilman Denoa. Täällä on verkko ja tunnistautuminen.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  arvioiPoiminta,
  jasennaPoiminta,
  KEHOTE,
  TYOKALU,
  type KuittiPoiminta,
  type PoiminnanArvio,
} from "./poiminta.ts";

/** Anthropicin tukemat kuvatyypit. HEIC ei ole niiden joukossa. */
const TUETUT_KUVAT = ["image/jpeg", "image/png", "image/gif", "image/webp"];
/** Kuvan yläraja rajapinnassa. Storagen raja on 10 MB, tämä tiukempi. */
const KUVAN_ENIMMAISKOKO = 4.5 * 1024 * 1024;
const PDF_ENIMMAISKOKO = 9 * 1024 * 1024;
const RAJAPINTA = "https://api.anthropic.com/v1/messages";
const RAJAPINNAN_VERSIO = "2023-06-01";
/** Pitkä kuitti voi olla kymmeniä rivejä; vastauksen pitää mahtua kokonaan. */
const ENIMMAISVASTAUS = 8000;

interface LueKuittiVastaus {
  poiminta: KuittiPoiminta;
  arvio: PoiminnanArvio;
}

function json(vastaus: LueKuittiVastaus | { virhe: string }, status = 200): Response {
  return new Response(JSON.stringify(vastaus), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Tavut base64-muotoon.
 *
 * Pala kerrallaan, koska String.fromCharCode(...tavut) ylittää kutsupinon
 * megatavun kokoisella kuitilla.
 */
function base64(tavut: Uint8Array): string {
  const PALA = 0x8000;
  let teksti = "";
  for (let i = 0; i < tavut.length; i += PALA) {
    teksti += String.fromCharCode(...tavut.subarray(i, i + PALA));
  }
  return btoa(teksti);
}

/** Kuitin sisältölohko mallille: PDF omanaan, kuva omanaan. */
function sisaltolohko(tyyppi: string, data: string): Record<string, unknown> {
  if (tyyppi === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }
  return { type: "image", source: { type: "base64", media_type: tyyppi, data } };
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
    if (profiili?.role !== "admin") return json({ virhe: "Vain admin voi lukea kuitteja" }, 403);

    const avain = Deno.env.get("ANTHROPIC_API_KEY");
    if (!avain) {
      return json({
        virhe:
          "Automaattinen poiminta ei ole käytössä: ANTHROPIC_API_KEY puuttuu Supabase-projektin asetuksista. Täytä kuitin tiedot käsin.",
      });
    }

    const { kuitti_id } = await req.json().catch(() => ({ kuitti_id: null }));
    if (!kuitti_id || typeof kuitti_id !== "string") {
      return json({ virhe: "Kuitin tunniste puuttuu" }, 400);
    }

    const { data: kuitti, error: kuittiVirhe } = await supabase
      .from("kuitit")
      .select("tiedosto_polku, tiedosto_tyyppi")
      .eq("id", kuitti_id)
      .single();
    if (kuittiVirhe || !kuitti) return json({ virhe: "Kuittia ei löytynyt" }, 404);
    if (!kuitti.tiedosto_polku) {
      return json({ virhe: "Kuittiin ei ole liitetty tiedostoa, joten luettavaa ei ole." });
    }

    const tyyppi = kuitti.tiedosto_tyyppi ?? "image/jpeg";
    if (tyyppi !== "application/pdf" && !TUETUT_KUVAT.includes(tyyppi)) {
      return json({
        virhe: `Tiedostomuotoa ${tyyppi} ei voi lukea automaattisesti. Kuvaa kuitti uudelleen tai liitä se PDF:nä.`,
      });
    }

    const { data: tiedosto, error: latausVirhe } = await supabase.storage
      .from("kuitit")
      .download(kuitti.tiedosto_polku);
    if (latausVirhe || !tiedosto) {
      return json({ virhe: `Kuitin tiedostoa ei saatu luettua: ${latausVirhe?.message ?? "tuntematon syy"}` });
    }

    const tavut = new Uint8Array(await tiedosto.arrayBuffer());
    const raja = tyyppi === "application/pdf" ? PDF_ENIMMAISKOKO : KUVAN_ENIMMAISKOKO;
    if (tavut.length > raja) {
      return json({
        virhe: `Tiedosto on ${(tavut.length / 1024 / 1024).toFixed(1)} MB ja liian suuri luettavaksi (yläraja ${(raja / 1024 / 1024).toFixed(1)} MB). Kuvaa kuitti uudelleen.`,
      });
    }

    const vastaus = await fetch(RAJAPINTA, {
      method: "POST",
      headers: {
        "x-api-key": avain,
        "anthropic-version": RAJAPINNAN_VERSIO,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Malli on ympäristömuuttujassa, jotta sen voi vaihtaa julkaisematta
        // funktiota uudelleen.
        model: Deno.env.get("KUITIN_MALLI") ?? "claude-sonnet-5",
        max_tokens: ENIMMAISVASTAUS,
        system: KEHOTE,
        tools: [TYOKALU],
        // Pakotettu työkalu: vastaus tulee aina samassa rakenteessa eikä
        // vapaana tekstinä, jota pitäisi jäsentää arvaamalla.
        tool_choice: { type: "tool", name: TYOKALU.name },
        messages: [
          {
            role: "user",
            content: [
              sisaltolohko(tyyppi, base64(tavut)),
              { type: "text", text: "Lue tämä kuitti." },
            ],
          },
        ],
      }),
    });

    if (!vastaus.ok) {
      const teksti = await vastaus.text().catch(() => "");
      console.error("Anthropic-rajapinta palautti virheen", vastaus.status, teksti);
      const syy =
        vastaus.status === 401
          ? "ANTHROPIC_API_KEY ei kelvannut."
          : vastaus.status === 429
            ? "Rajapinnan käyttöraja tuli vastaan. Yritä hetken kuluttua uudelleen."
            : `Rajapinta vastasi virheellä ${vastaus.status}.`;
      return json({ virhe: `Kuitin luku epäonnistui: ${syy} Voit täyttää tiedot käsin.` });
    }

    const runko = await vastaus.json();
    const lohkot: unknown[] = Array.isArray(runko?.content) ? runko.content : [];
    const tyokalu = lohkot.find(
      (lohko): lohko is { type: string; name: string; input: unknown } =>
        typeof lohko === "object" &&
        lohko !== null &&
        (lohko as { type?: unknown }).type === "tool_use" &&
        (lohko as { name?: unknown }).name === TYOKALU.name
    );
    if (!tyokalu) {
      return json({
        virhe: "Malli ei palauttanut kuitin tietoja. Yritä uudelleen tai täytä tiedot käsin.",
      });
    }

    const poiminta = jasennaPoiminta(tyokalu.input);
    return json({ poiminta, arvio: arvioiPoiminta(poiminta) });
  } catch (virhe) {
    console.error("lue-kuitti epäonnistui", virhe);
    return json({
      virhe: "Kuitin luku epäonnistui odottamattomaan virheeseen. Voit täyttää tiedot käsin.",
    });
  }
});
