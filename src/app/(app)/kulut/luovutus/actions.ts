"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import type { LuovutuksenTarkistukset, Vientiasetukset } from "@/lib/luovutus";

import type { KuittiTulos } from "../actions";

function virheteksti(virhe: unknown, oletus: string): string {
  return virhe instanceof Error && virhe.message ? virhe.message : oletus;
}

/**
 * Kauden tarkistukset ja kokoaminen.
 *
 * Kokoaminen tallentaa tuloksen kantaan, jotta kuukausiautomaatin kokoama
 * tila ja käyttöliittymässä nähty ovat sama asia. Lähetettyä kautta ei koota
 * uudelleen - sen luvut ovat sitä mitä kirjanpitäjälle lähti.
 */
export async function kokoaLuovutus(
  kausi: string
): Promise<{ ok: true; tarkistukset: LuovutuksenTarkistukset } | { ok: false; virhe: string }> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("kokoa_luovutus", { p_kausi: kausi });
    if (error) return { ok: false, virhe: error.message };
    return { ok: true, tarkistukset: data as LuovutuksenTarkistukset };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kokoaminen epäonnistui.") };
  }
}

/**
 * Kauden lähetys kirjanpitäjälle.
 *
 * Lähetys lukitsee kauden ja jää lokiin: mitkä kuitit, milloin ja millä
 * asetuksilla. Kanta tarkistaa puutteet uudelleen, jottei estoa voi kiertää
 * käyttöliittymän ohi.
 */
export async function lahetaLuovutus(
  kausi: string,
  asetukset: Vientiasetukset
): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("laheta_luovutus", {
      p_kausi: kausi,
      p_asetukset: asetukset,
    });
    if (error) return { ok: false, virhe: error.message };

    revalidatePath("/kulut");
    revalidatePath("/kulut/luovutus");
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Lähetyksen merkitseminen epäonnistui.") };
  }
}

/**
 * Lukitun kauden avaaminen.
 *
 * Oma toimintonsa, koska kirjanpitäjälle mennyttä aineistoa ei voi perua:
 * avaaminen tarkoittaa että hänelle lähtee myöhemmin uusi aineisto. Sekin jää
 * lokiin.
 */
export async function avaaLuovutus(kausi: string): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("avaa_luovutus", { p_kausi: kausi });
    if (error) return { ok: false, virhe: error.message };

    revalidatePath("/kulut");
    revalidatePath("/kulut/luovutus");
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Avaaminen epäonnistui.") };
  }
}
