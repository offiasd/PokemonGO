import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function haeAsetukset() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("asetukset").select("*").single();

  if (error || !data) {
    throw new Error("Asetuksia ei löytynyt - onko tietokanta alustettu?");
  }

  return data;
}
