// Supabase Edge Function: kuitin luku.
// Vision-malli lukee Storageen tallennetut kuitin liitteet ja palauttaa rivit,
// päiväyksen, toimittajan, loppusumman ja ALV-erittelyn.
//
// Kaksi kutsutapaa:
//
//   1. Käyttäjä painaa "Lue kuitti". Funktio ei kirjoita kantaan mitään vaan
//      palauttaa poiminnan lomakkeelle, jossa käyttäjä tarkistaa ja tallentaa:
//      poiminta on ehdotus, ei totuus, ja sama tallennuspolku pysyy yhtenä
//      riippumatta siitä tuliko tieto mallilta vai näppäimistöltä.
//   2. Lukujono kutsuu palvelinavaimella ({ jono: true }). Silloin kirjoitus
//      tehdään kannassa, koska monen kuitin erää ei lueta selaimen auki
//      pitämisen varassa - käyttäjä voi sulkea näkymän kesken.
//
// Kuitilla voi olla monta liitettä: pitkä kassakuitti ei mahdu yhteen kuvaan.
// Ne annetaan mallille järjestyksessä yhtenä kuittina.
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

/** Kuitin yksi liite valmiina mallille. */
interface Liite {
  polku: string;
  tyyppi: string;
}

/**
 * Bearer-tunnisteen rooli.
 *
 * Allekirjoitusta ei tarvitse tarkistaa täällä: Supabasen portti tarkistaa
 * JWT:n ennen kuin funktio ajetaan, joten tänne asti pääsee vain kelvollinen
 * tunniste. Rooli erottaa palvelinavaimen käyttäjän tunnisteesta - avaimen
 * merkkijonovertailu ei kelpaa, koska projektilla voi olla sekä vanha JWT- että
 * uusi salaisuusmuotoinen palvelinavain.
 */
function tunnisteenRooli(authHeader: string): string | null {
  try {
    const osat = authHeader.replace(/^Bearer\s+/i, "").split(".");
    if (osat.length !== 3) return null;
    const runko = JSON.parse(atob(osat[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof runko?.role === "string" ? runko.role : null;
  } catch {
    return null;
  }
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

  const palvelinavain = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const osoite = Deno.env.get("SUPABASE_URL") ?? "";
  let jonokuitti: string | null = null;
  let jonoAsiakas: ReturnType<typeof createClient> | null = null;

  /**
   * Virhe ulos yhtä tietä.
   *
   * Jonokutsussa virhe on merkittävä kuitille: kukaan ei ole katsomassa
   * vastausta, ja ilman merkintää kuitti jäisi ikuisesti "luetaan"-tilaan.
   */
  async function virhe(viesti: string, status = 200): Promise<Response> {
    if (jonokuitti && jonoAsiakas) {
      await jonoAsiakas.rpc("merkitse_poiminta_virheeksi", {
        p_kuitti_id: jonokuitti,
        p_virhe: viesti,
      });
    }
    return json({ virhe: viesti }, status);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ virhe: "Ei kirjautunut" }, 401);

    const pyynto = await req.json().catch(() => ({}));
    const kuittiId = typeof pyynto?.kuitti_id === "string" ? pyynto.kuitti_id : null;
    if (!kuittiId) return json({ virhe: "Kuitin tunniste puuttuu" }, 400);

    // Jonokutsu tunnistetaan palvelinavaimesta: sitä ei ole selaimessa, joten
    // kirjoitusoikeutta ei voi saada käyttäjän tunnuksilla.
    const jonokutsu =
      pyynto?.jono === true &&
      (tunnisteenRooli(authHeader) === "service_role" ||
        (palvelinavain !== "" && authHeader === `Bearer ${palvelinavain}`));

    const supabase = jonokutsu
      ? createClient(osoite, palvelinavain)
      : createClient(osoite, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
          global: { headers: { Authorization: authHeader } },
        });

    if (jonokutsu) {
      jonokuitti = kuittiId;
      jonoAsiakas = supabase;
    } else {
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
    }

    const avain = Deno.env.get("ANTHROPIC_API_KEY");
    if (!avain) {
      return await virhe(
        "Automaattinen poiminta ei ole käytössä: ANTHROPIC_API_KEY puuttuu Supabase-projektin asetuksista. Täytä kuitin tiedot käsin."
      );
    }

    // Liitteet järjestyksessä: pitkä kassakuitti on monta kuvaa, ja niiden
    // järjestys ratkaisee kumpi puolikas on kuitin alku.
    const { data: liitteet } = await supabase
      .from("kuitin_liitteet")
      .select("polku, tyyppi")
      .eq("kuitti_id", kuittiId)
      .order("jarjestys", { ascending: true })
      .order("created_at", { ascending: true });

    let lista: Liite[] = (liitteet ?? []).map((l) => ({
      polku: l.polku as string,
      tyyppi: (l.tyyppi as string) ?? "image/jpeg",
    }));

    if (lista.length === 0) {
      // Vanha kuitti ilman liiteriviä: sarake on yhä olemassa peilikuvana.
      const { data: kuitti, error: kuittiVirhe } = await supabase
        .from("kuitit")
        .select("tiedosto_polku, tiedosto_tyyppi")
        .eq("id", kuittiId)
        .single();
      if (kuittiVirhe || !kuitti) return await virhe("Kuittia ei löytynyt", 404);
      if (kuitti.tiedosto_polku) {
        lista = [
          { polku: kuitti.tiedosto_polku, tyyppi: kuitti.tiedosto_tyyppi ?? "image/jpeg" },
        ];
      }
    }

    if (lista.length === 0) {
      return await virhe("Kuittiin ei ole liitetty tiedostoa, joten luettavaa ei ole.");
    }

    const lohkot: Record<string, unknown>[] = [];
    for (const liite of lista) {
      if (liite.tyyppi !== "application/pdf" && !TUETUT_KUVAT.includes(liite.tyyppi)) {
        return await virhe(
          `Tiedostomuotoa ${liite.tyyppi} ei voi lukea automaattisesti. Kuvaa kuitti uudelleen tai liitä se PDF:nä.`
        );
      }

      const { data: tiedosto, error: latausVirhe } = await supabase.storage
        .from("kuitit")
        .download(liite.polku);
      if (latausVirhe || !tiedosto) {
        return await virhe(
          `Kuitin tiedostoa ei saatu luettua: ${latausVirhe?.message ?? "tuntematon syy"}`
        );
      }

      const tavut = new Uint8Array(await tiedosto.arrayBuffer());
      const raja = liite.tyyppi === "application/pdf" ? PDF_ENIMMAISKOKO : KUVAN_ENIMMAISKOKO;
      if (tavut.length > raja) {
        return await virhe(
          `Tiedosto on ${(tavut.length / 1024 / 1024).toFixed(1)} MB ja liian suuri luettavaksi (yläraja ${(raja / 1024 / 1024).toFixed(1)} MB). Kuvaa kuitti uudelleen.`
        );
      }

      lohkot.push(sisaltolohko(liite.tyyppi, base64(tavut)));
    }

    // Yksi kuitti, monta sivua: mallille kerrotaan että kyse on samasta
    // tositteesta, jottei se lue kolmea kuvaa kolmena kuittina.
    const ohje =
      lista.length === 1
        ? "Lue tämä kuitti."
        : `Nämä ${lista.length} kuvaa ovat saman kuitin osia järjestyksessä. Lue ne yhtenä kuittina.`;

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
            content: [...lohkot, { type: "text", text: ohje }],
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
      return await virhe(`Kuitin luku epäonnistui: ${syy} Voit täyttää tiedot käsin.`);
    }

    const runko = await vastaus.json();
    const sisalto: unknown[] = Array.isArray(runko?.content) ? runko.content : [];
    const tyokalu = sisalto.find(
      (lohko): lohko is { type: string; name: string; input: unknown } =>
        typeof lohko === "object" &&
        lohko !== null &&
        (lohko as { type?: unknown }).type === "tool_use" &&
        (lohko as { name?: unknown }).name === TYOKALU.name
    );
    if (!tyokalu) {
      return await virhe(
        "Malli ei palauttanut kuitin tietoja. Yritä uudelleen tai täytä tiedot käsin."
      );
    }

    const poiminta = jasennaPoiminta(tyokalu.input);
    const arvio = arvioiPoiminta(poiminta);

    if (jonokutsu) {
      const { error: tallennusVirhe } = await supabase.rpc("tallenna_poiminta", {
        p_kuitti_id: kuittiId,
        p_poiminta: poiminta as unknown as Record<string, unknown>,
      });
      if (tallennusVirhe) {
        return await virhe(`Poiminnan tallennus epäonnistui: ${tallennusVirhe.message}`);
      }
    }

    return json({ poiminta, arvio });
  } catch (poikkeus) {
    console.error("lue-kuitti epäonnistui", poikkeus);
    return await virhe(
      "Kuitin luku epäonnistui odottamattomaan virheeseen. Voit täyttää tiedot käsin."
    );
  }
});
