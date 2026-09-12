import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  laskePienhankinnat,
  KULUKSI_LASKETTAVAT,
  type Kayttotarkoitus,
} from "@/lib/kulut";
import type { Database } from "@/lib/supabase/database.types";
import type { TilikaudenAineisto, Tilannekuva, Yksityisotto } from "@/lib/tilikausi";

/**
 * Tilikauden aineiston haku.
 *
 * Yksi hakufunktio, jota sekä näkymä että vientireitti käyttävät: raportin
 * luvut eivät saa riippua siitä kummasta suunnasta niitä katsotaan.
 */

function pyorista(arvo: number): number {
  return Math.round(arvo * 100) / 100;
}

export async function haeTilikaudenAineisto(
  supabase: SupabaseClient<Database>,
  vuosi: number
): Promise<TilikaudenAineisto> {
  const alku = `${vuosi}-01-01`;
  const loppu = `${vuosi + 1}-01-01`;

  const [kuititVastaus, luokatVastaus, tyotVastaus, kuvaVastaus, kalustoVastaus, poistoVastaus] =
    await Promise.all([
    // Mitätöity kuitti on jo oikaistu, joten se ei kuulu tilikauden lukuihin.
    supabase
      .from("kuitit")
      .select("id, toimittaja, paivays")
      .gte("paivays", alku)
      .lt("paivays", loppu)
      .is("mitatoity_at", null)
      .order("paivays"),
    supabase.from("kululuokat").select("id, nimi").eq("aktiivinen", true).order("jarjestys"),
    supabase
      .from("tyojen_talous")
      .select("kuukausi, loppusumma_eur")
      .gte("ajankohta", alku)
      .lt("ajankohta", loppu),
    supabase
      .from("varastotilannekuvat")
      .select("*")
      .eq("tilikausi_paattyi", `${vuosi}-12-31`)
      .maybeSingle(),
    // Kalusto tilikauden päättyessä: kaikki mitä on hankittu viimeistään 31.12.
    // Luovutettukin kuuluu mukaan, koska luovutushinta vaikuttaa poistopohjaan.
    supabase
      .from("kalusto")
      .select("nimi, hankittu, hankintameno_eur, luovutettu, luovutushinta_eur, kuitin_rivi_id")
      .lte("hankittu", `${vuosi}-12-31`)
      .order("hankittu"),
    supabase
      .from("poistolaskelmat")
      .select("*")
      .eq("tilikausi_paattyi", `${vuosi}-12-31`)
      .maybeSingle(),
  ]);

  const kuitit = kuititVastaus.data ?? [];
  const kuittiTiedot = new Map(kuitit.map((k) => [k.id, k]));

  const { data: rivit } = kuitit.length
    ? await supabase
        .from("kuitin_rivit")
        .select("id, kuitti_id, teksti, brutto_eur, verokanta, kayttotarkoitus, kululuokka_id")
        .in(
          "kuitti_id",
          kuitit.map((k) => k.id)
        )
    : { data: [] };

  // Päivä ja toimittaja rivin mukaan: yli 1 200 euron hankinnat luetellaan
  // raportissa erikseen, eikä pelkkä rivin teksti riitä tunnistamaan ostosta.
  const rivitTiedoin = (rivit ?? []).map((r) => ({
    ...r,
    paivays: kuittiTiedot.get(r.kuitti_id)?.paivays ?? null,
    toimittaja: kuittiTiedot.get(r.kuitti_id)?.toimittaja ?? null,
  }));

  // Kalustoon siirretty rivi ei kuluta kattoa: se vähennetään poistoina.
  const kalustoRivit = kalustoVastaus.data ?? [];
  const kalustoonSiirretyt = new Set(
    kalustoRivit.map((k) => k.kuitin_rivi_id).filter((id): id is string => id !== null)
  );
  const pienhankinnat = laskePienhankinnat(rivitTiedoin, kalustoonSiirretyt);

  const luokanNimi = new Map((luokatVastaus.data ?? []).map((l) => [l.id, l.nimi]));
  const summat = new Map<string, number>();
  for (const luokka of luokatVastaus.data ?? []) summat.set(luokka.nimi, 0);

  let kulutYhteensa = 0;
  for (const rivi of rivitTiedoin) {
    if (!rivi.kayttotarkoitus) continue;
    if (!KULUKSI_LASKETTAVAT.includes(rivi.kayttotarkoitus as Kayttotarkoitus)) continue;
    const nimi = rivi.kululuokka_id
      ? (luokanNimi.get(rivi.kululuokka_id) ?? "Muut")
      : "Luokittelematta";
    summat.set(nimi, (summat.get(nimi) ?? 0) + rivi.brutto_eur);
    kulutYhteensa += rivi.brutto_eur;
  }

  const kululuokittain = [...summat.entries()]
    .map(([nimi, eur]) => ({ nimi, eur: pyorista(eur) }))
    .sort((a, b) => b.eur - a.eur || a.nimi.localeCompare(b.nimi, "fi"));

  const yksityisotot: Yksityisotto[] = rivitTiedoin
    .filter((r) => r.kayttotarkoitus === "yksityisotto")
    .map((r) => ({
      paivays: r.paivays ?? "",
      toimittaja: r.toimittaja,
      teksti: r.teksti,
      bruttoEur: r.brutto_eur,
    }))
    .sort((a, b) => a.paivays.localeCompare(b.paivays));

  const kuukaudet = new Map<number, { toita: number; myyntiEur: number }>();
  for (const tyo of tyotVastaus.data ?? []) {
    const kuukausi = new Date(tyo.kuukausi).getUTCMonth();
    const nyt = kuukaudet.get(kuukausi) ?? { toita: 0, myyntiEur: 0 };
    kuukaudet.set(kuukausi, {
      toita: nyt.toita + 1,
      myyntiEur: nyt.myyntiEur + tyo.loppusumma_eur,
    });
  }

  const myyntiKuukausittain = [...kuukaudet.entries()]
    .map(([kuukausi, arvot]) => ({
      kuukausi,
      toita: arvot.toita,
      myyntiEur: pyorista(arvot.myyntiEur),
      keskihintaEur: arvot.toita > 0 ? pyorista(arvot.myyntiEur / arvot.toita) : 0,
    }))
    .sort((a, b) => a.kuukausi - b.kuukausi);

  const kuva = kuvaVastaus.data;
  let tilannekuva: Tilannekuva | null = null;
  if (kuva) {
    const [{ data: kuvanRivit }, { data: ottaja }] = await Promise.all([
      supabase
        .from("varastotilannekuvan_rivit")
        .select("vari_nimi, valmistaja, saldo_g, hinta_per_kg, arvo_eur")
        .eq("tilannekuva_id", kuva.id)
        .order("vari_nimi"),
      kuva.ottaja_id
        ? supabase.from("profiles").select("full_name").eq("id", kuva.ottaja_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    tilannekuva = {
      otettu: kuva.otettu,
      ottaja: ottaja?.full_name ?? null,
      yhteensaEur: kuva.yhteensa_eur ?? 0,
      vareja: kuva.vareja ?? 0,
      muistiinpano: kuva.muistiinpano,
      rivit: kuvanRivit ?? [],
    };
  }

  const laskelma = poistoVastaus.data;

  return {
    vuosi,
    tilannekuva,
    kalusto: kalustoRivit.map((k) => ({
      nimi: k.nimi,
      hankittu: k.hankittu,
      hankintamenoEur: k.hankintameno_eur,
      luovutettu: k.luovutettu,
      luovutushintaEur: k.luovutushinta_eur,
    })),
    poistolaskelma: laskelma
      ? {
          tilikausiPaattyi: laskelma.tilikausi_paattyi,
          menojaannosAlussaEur: laskelma.menojaannos_alussa_eur,
          hankinnatEur: laskelma.hankinnat_eur,
          luovutushinnatEur: laskelma.luovutushinnat_eur,
          poistopohjaEur: laskelma.poistopohja_eur,
          poistoEnintaanEur: laskelma.poisto_enintaan_eur,
          poistoToteutunutEur: laskelma.poisto_toteutunut_eur,
          kertapoisto: laskelma.kertapoisto,
          menojaannosLopussaEur: laskelma.menojaannos_lopussa_eur,
          muistiinpano: laskelma.muistiinpano,
        }
      : null,
    pienhankinnat,
    kululuokittain,
    kulutYhteensaEur: pyorista(kulutYhteensa),
    myyntiKuukausittain,
    myyntiYhteensaEur: pyorista(
      myyntiKuukausittain.reduce((summa, k) => summa + k.myyntiEur, 0)
    ),
    yksityisotot,
    yksityisototYhteensaEur: pyorista(
      yksityisotot.reduce((summa, y) => summa + y.bruttoEur, 0)
    ),
    kuitteja: kuitit.length,
  };
}
