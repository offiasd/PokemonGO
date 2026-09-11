"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { opinAvain, type Kayttotarkoitus } from "@/lib/kulut";
import type { AlvErittelynRivi, Yksikko } from "@/lib/supabase/database.types";

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
  /** Määrän yksikkö. Paljas luku ei kelpaa varastotäydennykseen. */
  yksikko: Yksikko | null;
  /**
   * Rivin summa kuitin omassa valuutassa. EUR-kuitilla tämä on suoraan
   * euroja; vieraalla valuutalla kanta johtaa euromäärän tästä.
   */
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
  lahde: "kamera" | "tiedosto",
  tiiviste?: string
): Promise<KuittiTulos> {
  try {
    const kayttaja = await vaaditaanAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("kuitit")
      .insert({
        paivays: new Date().toISOString().slice(0, 10),
        lahde,
        tila: "luonnos",
        luoja_id: kayttaja.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, virhe: error?.message ?? "Kuitin tallennus epäonnistui." };
    }

    // Tiedosto tulee liitteenä, ja trigger peilaa ensimmäisen liitteen kuitin
    // omiin sarakkeisiin. Näin sama kuitti voi myöhemmin saada lisää sivuja
    // ilman että mikään vanha kysely muuttuu.
    const { error: liiteVirhe } = await supabase.from("kuitin_liitteet").insert({
      kuitti_id: data.id,
      polku: tiedostoPolku,
      tyyppi: tiedostoTyyppi,
      jarjestys: 0,
      tiiviste: tiiviste ?? null,
    });
    if (liiteVirhe) {
      await supabase.from("kuitit").delete().eq("id", data.id);
      return { ok: false, virhe: liiteVirhe.message };
    }

    revalidatePath("/kulut");
    return { ok: true, id: data.id };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kuitin tallennus epäonnistui.") };
  }
}

/** Yksi ladattu tiedosto matkalla kuitiksi. */
export interface LadattuTiedosto {
  polku: string;
  tyyppi: string;
  tiiviste: string;
}

/**
 * Luo erän tiedostoista yhden kuitin kutakin kohden ja asettaa ne lukujonoon.
 *
 * Kuitteja ei lueta tässä: kaksikymmentä vision-kutsua peräkkäin kaatuisi
 * Edge Functionin aikarajaan. Rivit syntyvät heti luonnoksina, ja jono lukee
 * ne muutama kerrallaan taustalla - näkymän voi sulkea kesken.
 */
export async function luoKuititErasta(
  eraId: string,
  tiedostot: LadattuTiedosto[],
  lahde: "kamera" | "tiedosto"
): Promise<{ ok: true; luotuja: number } | { ok: false; virhe: string }> {
  try {
    const kayttaja = await vaaditaanAdmin();
    const supabase = await createClient();

    if (tiedostot.length === 0) return { ok: false, virhe: "Ei ladattuja tiedostoja." };
    if (tiedostot.length > 20) return { ok: false, virhe: "Kerralla voi lisätä enintään 20 tiedostoa." };

    const tanaan = new Date().toISOString().slice(0, 10);
    const { data: luodut, error } = await supabase
      .from("kuitit")
      .insert(
        tiedostot.map(() => ({
          paivays: tanaan,
          lahde,
          tila: "luonnos" as const,
          luoja_id: kayttaja.id,
          era_id: eraId,
          poiminnan_tila: "jonossa",
        }))
      )
      .select("id");
    if (error || !luodut) {
      return { ok: false, virhe: error?.message ?? "Kuittien luonti epäonnistui." };
    }

    const { error: liiteVirhe } = await supabase.from("kuitin_liitteet").insert(
      luodut.map((kuitti, i) => ({
        kuitti_id: kuitti.id,
        polku: tiedostot[i].polku,
        tyyppi: tiedostot[i].tyyppi,
        jarjestys: 0,
        tiiviste: tiedostot[i].tiiviste,
      }))
    );
    if (liiteVirhe) {
      await supabase
        .from("kuitit")
        .delete()
        .in("id", luodut.map((k) => k.id));
      return { ok: false, virhe: liiteVirhe.message };
    }

    revalidatePath("/kulut");
    return { ok: true, luotuja: luodut.length };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kuittien luonti epäonnistui.") };
  }
}

/** Poistaa koko erän kuitteineen ja tiedostoineen. */
export async function poistaKuittiEra(eraId: string): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { data: polut, error } = await supabase.rpc("poista_kuittiera", { p_era_id: eraId });
    if (error) return { ok: false, virhe: error.message };

    if (polut && polut.length > 0) {
      await supabase.storage.from("kuitit").remove(polut);
    }

    revalidatePath("/kulut");
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Erän poisto epäonnistui.") };
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
    /** Poiminnan lukema erittely. Tallennetaan myös ilman ALV-rekisteröintiä. */
    alvErittely: AlvErittelynRivi[] | null;
    /** Kuitti- tai laskunumero. Kanta normalisoi vertailumuodon triggerillä. */
    tositenumero: string | null;
    tositetyyppi: "kuitti" | "lasku" | null;
    /** Laskun valuutta ISO-koodina. */
    valuutta: string;
    /** Tililtä luettu todellinen euroveloitus. Ensisijainen euromäärän lähde. */
    todellinenEur: number | null;
    /** Euroa per yksikkö valuuttaa. Varajärjestelmä kun veloitusta ei tiedetä. */
    valuuttakurssi: number | null;
  },
  rivit: KuitinRiviSyote[]
): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    // Lomakkeen luvut ovat kuitin omassa valuutassa. EUR-kuitilla euromäärä on
    // sama luku, joten se kirjoitetaan suoraan; vieraalla valuutalla kanta
    // laskee sen todellisesta veloituksesta tai kurssista.
    const euroina = kuitti.valuutta === "EUR";

    const { error: kuittiVirhe } = await supabase
      .from("kuitit")
      .update({
        toimittaja: kuitti.toimittaja,
        paivays: kuitti.paivays,
        maksupaiva: kuitti.maksupaiva,
        valuutta: kuitti.valuutta,
        loppusumma_valuutassa: kuitti.loppusummaEur,
        todellinen_eur: euroina ? null : kuitti.todellinenEur,
        valuuttakurssi: euroina ? null : kuitti.valuuttakurssi,
        ...(euroina ? { loppusumma_eur: kuitti.loppusummaEur } : {}),
        muistiinpano: kuitti.muistiinpano,
        tila: kuitti.tila,
        alv_erittely: kuitti.alvErittely,
        tositenumero: kuitti.tositenumero,
        tositetyyppi: kuitti.tositetyyppi,
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
          yksikko: rivi.yksikko,
          brutto_valuutassa: rivi.bruttoEur,
          // Euromäärä kirjoitetaan vain euromääräiselle kuitille. Vieraalla
          // valuutalla sen laskee paivita_kuitin_eurot - siihen asti nolla,
          // ei valuutassa oleva luku.
          brutto_eur: euroina ? rivi.bruttoEur : 0,
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

    // Rivit kirjoitettiin vasta nyt, joten euromäärät lasketaan tässä: kuitin
    // oma trigger ei näe rivien muutoksia.
    if (!euroina) {
      const { error: valuuttaVirhe } = await supabase.rpc("paivita_kuitin_eurot", {
        p_kuitti_id: kuittiId,
      });
      if (valuuttaVirhe) return { ok: false, virhe: valuuttaVirhe.message };
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
 * Poistaa kuitin, sen rivit ja tiedoston pysyvästi.
 *
 * Poisto on sallittu vain kuitille jota ei ole luovutettu kirjanpitäjälle:
 * luovuttamaton kuitti ei ole tosite, joten vahingossa kuvattua kuvaa ei
 * tarvitse säilyttää kuutta vuotta. Luovutetulle kuitille kanta torjuu
 * poiston ja ohjaa mitätöintiin. Riviensä luokitteluista opittu jää voimaan -
 * se on tieto tuotteesta, ei kuitista.
 */
export async function poistaKuitti(kuittiId: string): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { data: polut, error } = await supabase.rpc("poista_kuitti_pysyvasti", {
      p_kuitti_id: kuittiId,
    });
    if (error) return { ok: false, virhe: error.message };

    // Tiedostot vasta kun rivi on poissa: jos poisto kaatuu, tosite säilyy
    // kokonaisena eikä jää kuvattomaksi. Liitteitä voi olla monta.
    if (polut && polut.length > 0) {
      await supabase.storage.from("kuitit").remove(polut);
    }

    revalidatePath("/kulut");
    revalidatePath("/");
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kuitin poisto epäonnistui.") };
  }
}

/**
 * Mitätöi luovutetun kuitin syineen.
 *
 * Kirjanpidossa vientejä ei poisteta vaan oikaistaan: kun kuitti on jo mennyt
 * kirjanpitäjälle, virhe korjataan merkitsemällä kuitti mitätöidyksi ja
 * kirjaamalla miksi. Kuva ja rivit säilyvät, mutta summiin kuitti ei enää
 * kuulu.
 */
export async function mitatoiKuitti(kuittiId: string, syy: string): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    const { error } = await supabase.rpc("mitatoi_kuitti", {
      p_kuitti_id: kuittiId,
      p_syy: syy,
    });
    if (error) return { ok: false, virhe: error.message };

    revalidatePath("/kulut");
    revalidatePath(`/kulut/${kuittiId}`);
    revalidatePath("/");
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Kuitin mitätöinti epäonnistui.") };
  }
}

/**
 * Vaihtaa kuitin tiedoston uuteen.
 *
 * Uudelleenkuvaus on tarjottava ennen käsin korjaamista: lämpöpaperi
 * haalistuu ja rypistyy, ja tarkempi kuva korjaa poiminnan kerralla siinä
 * missä käsin naputtelu korjaa yhden rivin. Vanha tiedosto poistetaan vasta
 * kun uusi on kannassa, jottei kuitti jää hetkeksikään ilman tositetta.
 */
export async function korvaaKuitinTiedosto(
  kuittiId: string,
  tiedostoPolku: string,
  tiedostoTyyppi: string,
  lahde: "kamera" | "tiedosto",
  tiiviste?: string
): Promise<KuittiTulos> {
  try {
    await vaaditaanAdmin();
    const supabase = await createClient();

    // Uudelleenkuvaus korvaa ensimmäisen sivun. Muut sivut jäävät paikoilleen:
    // pitkästä kuitista kuvataan yleensä uudelleen se sivu joka epäonnistui.
    const { data: vanha } = await supabase
      .from("kuitin_liitteet")
      .select("id, polku")
      .eq("kuitti_id", kuittiId)
      .order("jarjestys")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (vanha) {
      const { error } = await supabase
        .from("kuitin_liitteet")
        .update({ polku: tiedostoPolku, tyyppi: tiedostoTyyppi, tiiviste: tiiviste ?? null })
        .eq("id", vanha.id);
      if (error) return { ok: false, virhe: error.message };
    } else {
      const { error } = await supabase.from("kuitin_liitteet").insert({
        kuitti_id: kuittiId,
        polku: tiedostoPolku,
        tyyppi: tiedostoTyyppi,
        jarjestys: 0,
        tiiviste: tiiviste ?? null,
      });
      if (error) return { ok: false, virhe: error.message };
    }

    const { error: kuittiVirhe } = await supabase
      .from("kuitit")
      .update({ lahde, updated_at: new Date().toISOString() })
      .eq("id", kuittiId);
    if (kuittiVirhe) return { ok: false, virhe: kuittiVirhe.message };

    if (vanha?.polku && vanha.polku !== tiedostoPolku) {
      await supabase.storage.from("kuitit").remove([vanha.polku]);
    }

    revalidatePath(`/kulut/${kuittiId}`);
    return { ok: true };
  } catch (virhe) {
    return { ok: false, virhe: virheteksti(virhe, "Tiedoston vaihto epäonnistui.") };
  }
}
