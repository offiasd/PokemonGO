"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import type {
  MaalieranEsikatselu,
  MaalieranRiviSyote,
  MaalieranSyote,
} from "@/lib/supabase/database.types";

/**
 * Erän kilohinnat ennen tallennusta.
 *
 * Laskenta tehdään kannassa eikä selaimessa, jotta esikatselu ja tallennus
 * käyttävät varmasti samaa kaavaa. Kaksi toteutusta erkaantuisi ennemmin tai
 * myöhemmin, ja ero näkyisi vasta kilohinnoissa.
 */
export async function esikatseleEra(
  rivit: MaalieranRiviSyote[],
  rahtiEur: number,
  tulliEur: number | null,
  tuontiAlvEur: number | null
): Promise<MaalieranEsikatselu> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("esikatsele_maaliera", {
    p_rivit: rivit,
    p_rahti_eur: rahtiEur,
    p_tulli_eur: tulliEur,
    p_tuonti_alv_eur: tuontiAlvEur,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function luoEra(
  era: MaalieranSyote,
  rivit: MaalieranRiviSyote[]
): Promise<string> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("luo_maaliera", { p_era: era, p_rivit: rivit });
  if (error) throw new Error(error.message);

  revalidatePath("/varit");
  revalidatePath("/varit/erat");
  for (const rivi of rivit) revalidatePath(`/varit/${rivi.vari_id}`);

  return data;
}

/**
 * Tullauspäätöksen luvut kesken olleelle erälle.
 *
 * Kilohinnat ja keskihinnat korjataan erotuksella: arvio oli voimassa siihen
 * asti, ja korjaus koskee vain tulevaa kulutusta. Jo tehtyjen töiden
 * maalikustannus on lukittu kulutushetkeensä eikä muutu tästä.
 */
export async function viimeisteleEra(
  eraId: string,
  tulliEur: number,
  tuontiAlvEur: number
): Promise<void> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("viimeistele_maaliera", {
    p_era_id: eraId,
    p_tulli_eur: tulliEur,
    p_tuonti_alv_eur: tuontiAlvEur,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/varit");
  revalidatePath("/varit/erat");
}
