import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type Ajoneuvotyyppi = Database["public"]["Tables"]["ajoneuvotyypit"]["Row"];

/**
 * Osille valittavat ajoneuvotyypit adminin määrittämässä järjestyksessä.
 *
 * Lista on dataa eikä koodissa olevaa vakiota, joten se haetaan palvelimella ja
 * välitetään propsina niille lomakkeille ja suodattimille, jotka ovat
 * asiakaskomponentteja.
 */
export async function haeAjoneuvotyypit(): Promise<Ajoneuvotyyppi[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ajoneuvotyypit")
    .select("*")
    .order("jarjestys")
    .order("nimi");
  return data ?? [];
}
