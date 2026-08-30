// Supabase Edge Function: värivaraston hälytysten tarkistus.
// Tarkoitettu ajettavaksi ajastetusti (Supabase Scheduled Functions / pg_cron),
// esim. kerran päivässä. Hakee hälytysrajan alittaneet värit ja lähettää
// koosteilmoituksen. Sähköposti-/push-integraatio (esim. Resend) on jätetty
// TODO-kohdaksi, koska tämä ympäristö ei sisällä valmiita lähetystunnuksia.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: halytykset, error } = await supabase
    .from("varit_halytykset")
    .select("id, nimi, saldo_g, efektiivinen_halytysraja_g");

  if (error) {
    return new Response(JSON.stringify({ virhe: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!halytykset || halytykset.length === 0) {
    return new Response(JSON.stringify({ viesti: "Ei hälytyksiä", maara: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // TODO: liitä sähköposti-/push-lähetys (esim. Resend) kun palvelun tunnukset
  // ovat tiedossa. Toistaiseksi hälytykset näkyvät vain dashboardilla
  // (ks. src/app/(app)/page.tsx ja varit_halytykset-näkymä).
  console.log(`Varastohälytys: ${halytykset.length} väriä hälytysrajalla tai alle`, halytykset);

  return new Response(
    JSON.stringify({ viesti: "Hälytykset käsitelty", maara: halytykset.length, halytykset }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
