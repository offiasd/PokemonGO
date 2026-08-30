import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Palvelinpuolen admin-asiakas Service Role -avaimella. Ohittaa RLS:n kokonaan,
 * joten sitä saa käyttää vain admin-toiminnoissa (esim. käyttäjäkutsut) ja aina
 * sen jälkeen kun kutsuvan käyttäjän admin-rooli on tarkistettu.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY puuttuu ympäristömuuttujista.");
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
