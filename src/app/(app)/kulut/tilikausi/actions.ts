"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";

/**
 * Varaston tilannekuva tilikauden päättyessä.
 *
 * Ei ajastusta: ajastettu tehtävä voisi osua hetkeen jolloin joulukuun
 * viimeiset työt ovat vielä kirjaamatta, ja väärä tilannekuva on pahempi kuin
 * puuttuva - se näyttää oikealta. Admin painaa nappia silloin kun tietää
 * kirjausten olevan ajan tasalla.
 *
 * Uudelleenotto korvaa saman tilikauden vanhan kuvan. Puuttuva kirjaus
 * huomataan usein vasta tilannekuvan jälkeen.
 */
export async function otaTilannekuva(vuosi: number, muistiinpano: string | null): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("ota_varastotilannekuva", {
    p_tilikausi_paattyi: `${vuosi}-12-31`,
    p_muistiinpano: muistiinpano,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/kulut/tilikausi");
  revalidatePath("/kulut");
}
