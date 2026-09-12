"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import type { MaalieranKuittirivi } from "@/lib/supabase/database.types";

/**
 * Erän luonti kuitista.
 *
 * Hintalaskentaa ei tehdä täällä eikä selaimessa: kanta kokoaa rivit ja
 * kutsuu samaa luo_maaliera-funktiota kuin käsin kirjattu erä. Näin kuitista
 * ja käsin syötetystä erästä tulee sama tulos.
 */
export async function luoTaydennysKuitista(
  kuittiId: string,
  rivit: MaalieranKuittirivi[],
  rahtiEur: number,
  muistiinpano: string | null
): Promise<string> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("luo_maaliera_kuitista", {
    p_kuitti_id: kuittiId,
    p_rivit: rivit,
    p_rahti_eur: rahtiEur,
    p_muistiinpano: muistiinpano,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/kulut");
  revalidatePath(`/kulut/${kuittiId}`);
  revalidatePath("/varit");
  revalidatePath("/varit/erat");
  for (const rivi of rivit) revalidatePath(`/varit/${rivi.vari_id}`);

  return data;
}
