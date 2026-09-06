"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { opinAvain, type Kayttotarkoitus } from "@/lib/kulut";

/**
 * Toiminnon lopputulos arvona eikä heitettynä virheenä: Next.js piilottaa
 * tuotannossa server actionin heittämän virheen ja korvaa sen yleisellä
 * React-virheellä, jolloin käyttäjä näkisi numerosarjan.
 */
export type KuittiTulos = { ok: true; id?: string } | { ok: false; virhe: string };

function virheteksti(virhe: unknown, oletus: string): string {
  return virhe instanceof Error && virhe.message ? virhe.message : oletus;
}

export interface KuitinRiviSyote {
  teksti: string;
  maara: number | null;
  bruttoEur: number;
  verokanta: number | null;
  kayttotarkoitus: Kayttotarkoitus | null;
  kululuokkaId: string | null;
  muistiinpano: string | null;
}

/**
 * Luo kuitin tallennetusta tiedostosta.
 *
 * Kuitti syntyy heti luonnoksena, kun tiedosto on Storagessa: kassalla ehtii
 * kuvata mutta ei luokitella, ja luokittelematon kuitti on parempi kuin
 * kuvaamatta jäänyt.
 */
export async function luoKuitti(
  tiedostoPolku: string,
  tiedostoTyyppi: string,
  lahde: "kamera" | "tiedosto"
): Promise<KuittiTulos> {
  try {
    const kayttaja = await vaaditaanAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("kuitit")
      .insert({
        paivays: new Date().toISOString().slice(0, 10),
        lahde,
        tiedosto_polku: tiedostoPolku,
        tiedosto_tyyppi: tiedostoTyyppi,
        tila: "luonnos",
        luoja_id: kayttaja.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, virhe: error?.message ?? "Kuitin tallennus epäonnistui." };
    }

    revalidatePath("/kulut");
    return { ok: true, id: data.id };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kuitin tallennus epäonnistui.") };
  }
}

/**
 * Tallentaa kuitin tiedot ja rivit.
 *
 * Rivit korvataan kokonaan: kuitti on yksi tosite, ja rivien osittainen
 * päivitys jättäisi poistetut rivit roikkumaan. Samalla opitaan jokaisen rivin
 * luokittelu, jotta sama tuoteteksti esitäyttyy seuraavalla kerralla.
 */
export async function tallennaKuitti(
  kuittiId: string,
  kuitti: {
    toimittaja: string | null;
    paivays: string;
    maksupaiva: string | null;
    loppusummaEur: number;
    muistiinpano: string | null;
    tila: "luonnos" | "tarkistettava" | "valmis";
  },
  rivit: KuitinRiviSyote[]
): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { error: kuittiVirhe } = await supabase
      .from("kuitit")
      .update({
        toimittaja: kuitti.toimittaja,
        paivays: kuitti.paivays,
        maksupaiva: kuitti.maksupaiva,
        loppusumma_eur: kuitti.loppusummaEur,
        muistiinpano: kuitti.muistiinpano,
        tila: kuitti.tila,
        updated_at: new Date().toISOString(),
      })
      .eq("id", kuittiId);
    if (kuittiVirhe) return { ok: false, virhe: kuittiVirhe.message };

    const { error: poistoVirhe } = await supabase
      .from("kuitin_rivit")
      .delete()
      .eq("kuitti_id", kuittiId);
    if (poistoVirhe) return { ok: false, virhe: poistoVirhe.message };

    if (rivit.length > 0) {
      const { error: riviVirhe } = await supabase.from("kuitin_rivit").insert(
        rivit.map((rivi, jarjestys) => ({
          kuitti_id: kuittiId,
          teksti: rivi.teksti.trim(),
          maara: rivi.maara,
          brutto_eur: rivi.bruttoEur,
          verokanta: rivi.verokanta,
          kayttotarkoitus: rivi.kayttotarkoitus,
          kululuokka_id: rivi.kululuokkaId,
          muistiinpano: rivi.muistiinpano,
          jarjestys,
        }))
      );
      if (riviVirhe) return { ok: false, virhe: riviVirhe.message };

      // Opitaan vain luokitellut rivit. Sama teksti voi esiintyä kuitilla
      // kahdesti, joten viimeinen jää voimaan - ne ovat joka tapauksessa sama
      // päätös samasta tuotteesta.
      const opittavat = new Map<string, { kayttotarkoitus: Kayttotarkoitus; kululuokka_id: string | null }>();
      for (const rivi of rivit) {
        if (!rivi.kayttotarkoitus) continue;
        opittavat.set(opinAvain(rivi.teksti), {
          kayttotarkoitus: rivi.kayttotarkoitus,
          kululuokka_id: rivi.kululuokkaId,
        });
      }
      if (opittavat.size > 0) {
        await supabase.from("kuittirivin_oppi").upsert(
          [...opittavat].map(([teksti, arvot]) => ({
            teksti,
            kayttotarkoitus: arvot.kayttotarkoitus,
            kululuokka_id: arvot.kululuokka_id,
            paivitetty: new Date().toISOString(),
          })),
          { onConflict: "teksti" }
        );
      }
    }

    revalidatePath("/kulut");
    revalidatePath(`/kulut/${kuittiId}`);
    revalidatePath("/");
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kuitin tallennus epäonnistui.") };
  }
}

/**
 * Poistaa kuitin.
 *
 * Kanta estää poiston säilytysajan kuluessa omalla liipaisimellaan; tämä
 * kertoo saman suomeksi ennen turhaa kantakutsua ja siivoaa myös tiedoston.
 */
export async function poistaKuitti(kuittiId: string): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { data: kuitti } = await supabase
      .from("kuitit")
      .select("tiedosto_polku, sailytettava_asti")
      .eq("id", kuittiId)
      .single();
    if (!kuitti) return { ok: false, virhe: "Kuittia ei löytynyt." };

    if (new Date(kuitti.sailytettava_asti) >= new Date()) {
      const paiva = new Date(kuitti.sailytettava_asti).toLocaleDateString("fi-FI");
      return {
        ok: false,
        virhe: `Kuittia ei voi poistaa ennen ${paiva}: kirjanpitolaki vaatii tositteen säilyttämisen.`,
      };
    }

    const { error } = await supabase.from("kuitit").delete().eq("id", kuittiId);
    if (error) return { ok: false, virhe: error.message };

    if (kuitti.tiedosto_polku) {
      await supabase.storage.from("kuitit").remove([kuitti.tiedosto_polku]);
    }

    revalidatePath("/kulut");
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kuitin poisto epäonnistui.") };
  }
}
