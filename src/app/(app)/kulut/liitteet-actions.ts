"use server";

import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";

import type { KuittiTulos } from "./actions";

function virheteksti(virhe: unknown, oletus: string): string {
  return virhe instanceof Error && virhe.message ? virhe.message : oletus;
}

/**
 * Liitteiden järjestys uuteen järjestykseen.
 *
 * Kun samaan kuittiin kuuluu monta kuvaa, järjestys on merkitsevä: poiminta
 * lukee ne yhtenä kuittina, ja väärässä järjestyksessä kuitin loppusumma osuu
 * keskelle. Ensimmäinen liite peilautuu triggerillä kuitin omiin sarakkeisiin.
 */
export async function jarjestaLiitteet(
  kuittiId: string,
  liiteIdt: string[]
): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    for (const [jarjestys, id] of liiteIdt.entries()) {
      const { error } = await supabase
        .from("kuitin_liitteet")
        .update({ jarjestys })
        .eq("id", id)
        .eq("kuitti_id", kuittiId);
      if (error) return { ok: false, virhe: error.message };
    }

    revalidatePath(`/kulut/${kuittiId}`);
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Järjestyksen tallennus epäonnistui.") };
  }
}

/** Lisää kuitille uuden sivun. Pitkä kassakuitti on monta kuvaa. */
export async function lisaaLiite(
  kuittiId: string,
  polku: string,
  tyyppi: string,
  tiiviste: string | null
): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { data: viimeisin } = await supabase
      .from("kuitin_liitteet")
      .select("jarjestys")
      .eq("kuitti_id", kuittiId)
      .order("jarjestys", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("kuitin_liitteet").insert({
      kuitti_id: kuittiId,
      polku,
      tyyppi,
      jarjestys: (viimeisin?.jarjestys ?? -1) + 1,
      tiiviste,
    });
    if (error) return { ok: false, virhe: error.message };

    revalidatePath(`/kulut/${kuittiId}`);
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Sivun lisäys epäonnistui.") };
  }
}

/** Poistaa yhden sivun kuitilta, tiedostoineen. */
export async function poistaLiite(liiteId: string): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { data: liite } = await supabase
      .from("kuitin_liitteet")
      .select("kuitti_id, polku")
      .eq("id", liiteId)
      .maybeSingle();
    if (!liite) return { ok: false, virhe: "Liitettä ei löytynyt." };

    const { error } = await supabase.from("kuitin_liitteet").delete().eq("id", liiteId);
    if (error) return { ok: false, virhe: error.message };

    // Tiedosto vasta rivin jälkeen: Storage-politiikka torjuu poiston jos
    // kuitti on luovutettu, jolloin rivikään ei ole hävinnyt.
    await supabase.storage.from("kuitit").remove([liite.polku]);

    revalidatePath(`/kulut/${liite.kuitti_id}`);
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Sivun poisto epäonnistui.") };
  }
}

/**
 * Jakaa kuitin liitteet omiksi kuiteikseen.
 *
 * Yhdessä tiedostossa voi olla monta eri kuittia. Jakoa ei yritetä arvata
 * automaattisesti: väärin jaettu kuitti on työläämpi korjata kuin käsin
 * jaettu, joten käyttäjä päättää milloin jako tehdään. Ensimmäinen liite jää
 * alkuperäiselle kuitille, loput saavat omansa.
 */
export async function jaaKuittiLiitteittain(
  kuittiId: string
): Promise<{ ok: true; luotuja: number } | { ok: false; virhe: string }> {
  try {
    const kayttaja = await vaaditaanAdmin();
    const supabase = await createClient();

    const [{ data: kuitti }, { data: liitteet }] = await Promise.all([
      supabase.from("kuitit").select("*").eq("id", kuittiId).single(),
      supabase
        .from("kuitin_liitteet")
        .select("id, polku, tyyppi, tiiviste")
        .eq("kuitti_id", kuittiId)
        .order("jarjestys"),
    ]);
    if (!kuitti) return { ok: false, virhe: "Kuittia ei löytynyt." };
    if (!liitteet || liitteet.length < 2) {
      return { ok: false, virhe: "Jaettavaa ei ole: kuitilla on vain yksi sivu." };
    }
    if (kuitti.luovutettu_at) {
      return { ok: false, virhe: "Luovutettua kuittia ei voi jakaa. Mitätöi se ja lisää uudet." };
    }

    const jaettavat = liitteet.slice(1);
    const { data: uudet, error } = await supabase
      .from("kuitit")
      .insert(
        jaettavat.map(() => ({
          paivays: kuitti.paivays,
          lahde: kuitti.lahde,
          tila: "luonnos" as const,
          luoja_id: kayttaja.id,
          era_id: kuitti.era_id,
          poiminnan_tila: "jonossa",
        }))
      )
      .select("id");
    if (error || !uudet) {
      return { ok: false, virhe: error?.message ?? "Jako epäonnistui." };
    }

    for (const [i, liite] of jaettavat.entries()) {
      const { error: siirtoVirhe } = await supabase
        .from("kuitin_liitteet")
        .update({ kuitti_id: uudet[i].id, jarjestys: 0 })
        .eq("id", liite.id);
      if (siirtoVirhe) return { ok: false, virhe: siirtoVirhe.message };
    }

    // Alkuperäinen kuitti kannattaa lukea uudelleen: sen sisältö on nyt eri
    // kuin mistä nykyiset rivit poimittiin.
    await supabase
      .from("kuitit")
      .update({ poiminnan_tila: "jonossa", updated_at: new Date().toISOString() })
      .eq("id", kuittiId);

    revalidatePath(`/kulut/${kuittiId}`);
    revalidatePath("/kulut");
    return { ok: true, luotuja: uudet.length };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Jako epäonnistui.") };
  }
}

/**
 * Purkaa monisivuisen PDF:n sivut omiksi liitteikseen.
 *
 * Tämä on jaon esivaihe: kun sivut ovat erillisinä liitteinä, ne voi joko
 * jättää saman kuitin sivuiksi tai jakaa omiksi kuiteikseen. Sivumäärää ei
 * tulkita - käyttäjä tietää kuuluvatko sivut samaan tositteeseen.
 */
export async function jaaPdfSivuiksi(
  kuittiId: string,
  liiteId: string
): Promise<{ ok: true; sivuja: number } | { ok: false; virhe: string }> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { data: liite } = await supabase
      .from("kuitin_liitteet")
      .select("id, polku, tyyppi, jarjestys")
      .eq("id", liiteId)
      .eq("kuitti_id", kuittiId)
      .maybeSingle();
    if (!liite) return { ok: false, virhe: "Liitettä ei löytynyt." };
    if (liite.tyyppi !== "application/pdf") {
      return { ok: false, virhe: "Vain PDF:n voi purkaa sivuiksi." };
    }

    const { data: tiedosto, error: latausVirhe } = await supabase.storage
      .from("kuitit")
      .download(liite.polku);
    if (latausVirhe || !tiedosto) {
      return { ok: false, virhe: `Tiedostoa ei saatu luettua: ${latausVirhe?.message ?? "?"}` };
    }

    const lahde = await PDFDocument.load(await tiedosto.arrayBuffer());
    const sivuja = lahde.getPageCount();
    if (sivuja < 2) return { ok: false, virhe: "PDF:ssä on vain yksi sivu." };

    const vuosi = new Date().getFullYear();
    const uudet: { polku: string; jarjestys: number }[] = [];
    for (let i = 0; i < sivuja; i++) {
      const yksi = await PDFDocument.create();
      const [sivu] = await yksi.copyPages(lahde, [i]);
      yksi.addPage(sivu);
      const tavut = await yksi.save();

      const polku = `${vuosi}/${crypto.randomUUID()}.pdf`;
      const { error: latausvirhe } = await supabase.storage
        .from("kuitit")
        .upload(polku, tavut, { contentType: "application/pdf", upsert: false });
      if (latausvirhe) return { ok: false, virhe: `Sivun tallennus epäonnistui: ${latausvirhe.message}` };
      uudet.push({ polku, jarjestys: liite.jarjestys + i });
    }

    // Vanhat rivit siirretään uusien perään ennen kuin alkuperäinen poistuu,
    // jottei järjestys mene sekaisin.
    const { data: muut } = await supabase
      .from("kuitin_liitteet")
      .select("id, jarjestys")
      .eq("kuitti_id", kuittiId)
      .gt("jarjestys", liite.jarjestys);
    for (const rivi of muut ?? []) {
      await supabase
        .from("kuitin_liitteet")
        .update({ jarjestys: rivi.jarjestys + sivuja - 1 })
        .eq("id", rivi.id);
    }

    const { error: lisaysVirhe } = await supabase.from("kuitin_liitteet").insert(
      uudet.map((u) => ({
        kuitti_id: kuittiId,
        polku: u.polku,
        tyyppi: "application/pdf",
        jarjestys: u.jarjestys,
      }))
    );
    if (lisaysVirhe) return { ok: false, virhe: lisaysVirhe.message };

    await supabase.from("kuitin_liitteet").delete().eq("id", liite.id);
    await supabase.storage.from("kuitit").remove([liite.polku]);

    revalidatePath(`/kulut/${kuittiId}`);
    return { ok: true, sivuja };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "PDF:n purku epäonnistui.") };
  }
}
