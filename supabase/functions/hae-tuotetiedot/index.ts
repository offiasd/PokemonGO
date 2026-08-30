// Supabase Edge Function: "Hae tiedot" -painike värin muokkausnäkymässä.
// Admin antaa linkin valmistajan tuotesivulle -> yritetään hakea Open Graph -kuva
// ja linkitetty PDF-datasheet sivun julkisesta HTML-sisällöstä.
// Ajetaan vain admin-käyttäjän pyynnöstä, ei automaattisesti taustalla.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface HaeTiedotVastaus {
  kuva_url: string | null;
  ohje_tiedosto_url: string | null;
  virhe: string | null;
}

function poimiOgImage(html: string): string | null {
  const match =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );
  return match?.[1] ?? null;
}

function poimiPdfLinkki(html: string, baseUrl: string): string | null {
  const linkit = [...html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)].map(
    (m) => m[1]
  );
  if (linkit.length === 0) return null;
  try {
    return new URL(linkit[0], baseUrl).toString();
  } catch {
    return null;
  }
}

function absoluuttinenUrl(url: string | null, baseUrl: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
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
        kuva_url: null,
        ohje_tiedosto_url: null,
        virhe: `Sivua ei voitu hakea: ${(haku_virhe as Error).message}`,
      };
      return new Response(JSON.stringify(vastaus), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vastaus: HaeTiedotVastaus = {
      kuva_url: absoluuttinenUrl(poimiOgImage(html), url),
      ohje_tiedosto_url: poimiPdfLinkki(html, url),
      virhe: null,
    };

    if (!vastaus.kuva_url && !vastaus.ohje_tiedosto_url) {
      vastaus.virhe = "Kuvaa tai ohjetiedostoa ei löytynyt sivulta – lataa käsin.";
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
