"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";

/**
 * Takuiden tallennus.
 *
 * Takuu on omassa taulussaan eikä kuitin rivillä, joten se tallentuu heti eikä
 * kuitin lomakkeen mukana. Juuri siksi sen voi lisätä myös luovutetun kauden
 * kuitille: kauden lukitus koskee kuitin rivejä, ei takuita.
 */

export type TakuuTulos = { ok: true } | { ok: false; virhe: string };

export interface TakuuSyote {
  /** Annettuna päivitetään olemassa oleva takuu. */
  id?: string | null;
  kuittiId?: string | null;
  /** Kuitin rivin id, jos se tiedetään. Linkitys korjataan tallennuksessa. */
  kuitinRiviId?: string | null;
  /** Rivin teksti kuitilta: sen varassa takuu löytää rivinsä uudelleen. */
  rivinTeksti?: string | null;
  nimi: string;
  alkaa: string;
  paattyy: string;
  sarjanumero?: string | null;
  muistiinpano?: string | null;
}

function siisti(arvo: string | null | undefined): string | null {
  const teksti = (arvo ?? "").trim();
  return teksti === "" ? null : teksti;
}

function tarkista(syote: TakuuSyote): string | null {
  if (siisti(syote.nimi) === null) return "Anna takuulle nimi.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(syote.alkaa)) return "Tarkista alkamispäivä.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(syote.paattyy)) return "Valitse takuun kesto.";
  if (syote.paattyy < syote.alkaa) return "Takuu ei voi päättyä ennen alkamistaan.";
  return null;
}

export async function tallennaTakuu(syote: TakuuSyote): Promise<TakuuTulos> {
  try {
    await vaaditaanAdmin();
    const virhe = tarkista(syote);
    if (virhe) return { ok: false, virhe };
    const supabase = await createClient();

    const arvot = {
      kuitti_id: syote.kuittiId ?? null,
      kuitin_rivi_id: syote.kuitinRiviId ?? null,
      rivin_teksti: siisti(syote.rivinTeksti),
      nimi: siisti(syote.nimi) as string,
      alkaa: syote.alkaa,
      paattyy: syote.paattyy,
      sarjanumero: siisti(syote.sarjanumero),
      muistiinpano: siisti(syote.muistiinpano),
    };

    if (syote.id) {
      // Lähdettä ei muuteta: kuitilta luettu takuu pysyy kuitilta luettuna,
      // vaikka sen päiviä korjattaisiin käsin.
      const { error } = await supabase
        .from("takuut")
        .update({
          nimi: arvot.nimi,
          alkaa: arvot.alkaa,
          paattyy: arvot.paattyy,
          sarjanumero: arvot.sarjanumero,
          muistiinpano: arvot.muistiinpano,
        })
        .eq("id", syote.id);
      if (error) return { ok: false, virhe: error.message };
    } else {
      const { error } = await supabase
        .from("takuut")
        .insert({ ...arvot, lahde: "kasin" });
      if (error) return { ok: false, virhe: error.message };
    }

    // Käsin lisätty takuu osuu riviinsä heti, kun kuitti on tiedossa.
    if (syote.kuittiId) {
      await supabase.rpc("linkita_takuut", { p_kuitti_id: syote.kuittiId });
    }

    paivita(syote.kuittiId ?? null);
    return { ok: true };
  } catch (virhe) {
    return {
      ok: false,
      virhe: virhe instanceof Error ? virhe.message : "Takuun tallennus epäonnistui.",
    };
  }
}

export async function poistaTakuu(id: string): Promise<TakuuTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();
    // Kuitti haetaan ennen poistoa, jotta myös kuittisivun välimuisti
    // päivittyy: muuten poistettu takuu jää rivin siruksi näkyviin.
    const { data: takuu } = await supabase
      .from("takuut")
      .select("kuitti_id")
      .eq("id", id)
      .maybeSingle();
    const { error } = await supabase.from("takuut").delete().eq("id", id);
    if (error) return { ok: false, virhe: error.message };
    paivita(takuu?.kuitti_id ?? null);
    return { ok: true };
  } catch (virhe) {
    return {
      ok: false,
      virhe: virhe instanceof Error ? virhe.message : "Takuun poisto epäonnistui.",
    };
  }
}

function paivita(kuittiId: string | null) {
  revalidatePath("/kulut");
  revalidatePath("/kulut/takuut");
  revalidatePath("/kulut/kalusto");
  // Kuittisivu näyttää takuun rivin siruna, joten sekin on päivitettävä.
  if (kuittiId) revalidatePath(`/kulut/${kuittiId}`);
}
