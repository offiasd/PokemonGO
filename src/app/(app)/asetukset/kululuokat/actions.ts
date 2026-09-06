"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";

export type LuokkaTulos = { ok: true } | { ok: false; virhe: string };

function virheteksti(virhe: unknown, oletus: string): string {
  return virhe instanceof Error && virhe.message ? virhe.message : oletus;
}

function paivita() {
  revalidatePath("/asetukset/kululuokat");
  revalidatePath("/kulut");
}

export async function lisaaKululuokka(nimi: string): Promise<LuokkaTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    // Uusi luokka listan loppuun: järjestys on käyttäjän oma, eikä uusi luokka
    // saa hypätä vakioluokkien väliin.
    const { data: viimeinen } = await supabase
      .from("kululuokat")
      .select("jarjestys")
      .order("jarjestys", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase
      .from("kululuokat")
      .insert({ nimi, jarjestys: (viimeinen?.jarjestys ?? 0) + 10 });
    if (error) {
      return {
        ok: false,
        virhe: error.code === "23505" ? "Samanniminen kululuokka on jo olemassa." : error.message,
      };
    }

    paivita();
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kululuokan lisäys epäonnistui.") };
  }
}

/**
 * Nimeää luokan uudelleen.
 *
 * Rivit viittaavat tunnisteeseen eivätkä nimeen, joten nimenmuutos ei riko
 * olemassa olevia kuitteja.
 */
export async function nimeaKululuokka(id: string, nimi: string): Promise<LuokkaTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("kululuokat").update({ nimi }).eq("id", id);
    if (error) {
      return {
        ok: false,
        virhe: error.code === "23505" ? "Samanniminen kululuokka on jo olemassa." : error.message,
      };
    }
    paivita();
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Nimeäminen epäonnistui.") };
  }
}

/**
 * Poistaa luokan.
 *
 * Vain käyttämätön luokka voidaan poistaa: käytössä olevan poisto jättäisi
 * kuittirivit ilman seurantatietoa.
 */
export async function poistaKululuokka(id: string): Promise<LuokkaTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { count } = await supabase
      .from("kuitin_rivit")
      .select("id", { count: "exact", head: true })
      .eq("kululuokka_id", id);
    if ((count ?? 0) > 0) {
      return { ok: false, virhe: "Käytössä olevaa kululuokkaa ei voi poistaa." };
    }

    const { error } = await supabase.from("kululuokat").delete().eq("id", id);
    if (error) return { ok: false, virhe: error.message };

    paivita();
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Poisto epäonnistui.") };
  }
}
