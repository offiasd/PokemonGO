/**
 * Kuukauden aineiston lataus kirjanpitäjälle.
 *
 * Kolme muotoa, yhdisteltävissä: PDF-kooste kuvineen, CSV rivitasolla ja
 * kuvat ZIP:nä. Useampi muoto kerralla pakataan yhteen ZIP:iin, jotta lataus
 * on yksi tiedosto eikä kolme painallusta.
 *
 * Reittikäsittelijä eikä server action, koska tuloksena on tiedosto eikä
 * tilamuutos: selain saa sen suoraan latauksena ilman välivaihetta.
 *
 * Lähetys ja kauden lukitus ovat erikseen (ks. kulut/luovutus/actions.ts).
 * Lataaminen ei lähetä mitään - kirjanpitäjälle mennyttä ei voi perua, joten
 * aineiston voi katsoa ensin.
 */

import { NextResponse } from "next/server";
import { zipSync } from "fflate";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { kokoaTiedostot, type Tosite } from "@/lib/luovutus-paketti";
import {
  paketinNimi,
  suodataYksityisotot,
  type Ryhmittely,
  type Tarkkuus,
  type Vientiasetukset,
  type Vientimuoto,
  type VientiKuitti,
} from "@/lib/luovutus";

// pdf-lib ja kuvien käsittely vaativat Node-ympäristön.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(pyynto: Request) {
  const kayttaja = await vaaditaanKayttaja();
  if (kayttaja.role !== "admin") {
    return NextResponse.json({ virhe: "Vain admin voi ladata aineiston." }, { status: 403 });
  }

  const parametrit = new URL(pyynto.url).searchParams;
  const kausiParam = parametrit.get("kausi") ?? "";
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(kausiParam)) {
    return NextResponse.json({ virhe: "Virheellinen kausi." }, { status: 400 });
  }
  const kausi = `${kausiParam.slice(0, 7)}-01`;

  const muodot = (parametrit.get("muodot") ?? "pdf,csv,zip")
    .split(",")
    .filter((m): m is Vientimuoto => m === "pdf" || m === "csv" || m === "zip");
  if (muodot.length === 0) {
    return NextResponse.json({ virhe: "Valitse vähintään yksi muoto." }, { status: 400 });
  }

  const ryhmittelyParam = parametrit.get("ryhmittely");
  const tarkkuusParam = parametrit.get("tarkkuus");
  const asetukset: Vientiasetukset = {
    muodot,
    ryhmittely:
      ryhmittelyParam === "toimittaja" || ryhmittelyParam === "kayttotarkoitus"
        ? (ryhmittelyParam as Ryhmittely)
        : "kuukausi",
    tarkkuus: (tarkkuusParam === "kuittikohtainen" ? "kuittikohtainen" : "rivitaso") as Tarkkuus,
    yksityisototMukaan: parametrit.get("yksityisotot") !== "0",
  };

  const supabase = await createClient();
  const loppu = new Date(Date.UTC(Number(kausi.slice(0, 4)), Number(kausi.slice(5, 7)), 1))
    .toISOString()
    .slice(0, 10);

  const [kuititVastaus, luokatVastaus] = await Promise.all([
    supabase
      .from("kuitit")
      .select("*")
      .gte("paivays", kausi)
      .lt("paivays", loppu)
      // Mitätöity kuitti on jo kertaalleen luovutettu ja oikaistu, joten se ei
      // kuulu pakettiin uudelleen.
      .is("mitatoity_at", null)
      .order("paivays"),
    supabase.from("kululuokat").select("id, nimi"),
  ]);

  const kuititRaaka = kuititVastaus.data ?? [];
  if (kuititRaaka.length === 0) {
    return NextResponse.json({ virhe: "Kaudella ei ole kuitteja." }, { status: 400 });
  }

  const [{ data: rivitRaaka }, { data: liiteRivit }] = await Promise.all([
    supabase
      .from("kuitin_rivit")
      .select("*")
      .in(
        "kuitti_id",
        kuititRaaka.map((k) => k.id)
      )
      .order("jarjestys"),
    // Kuitilla voi olla monta sivua, ja kirjanpitäjälle menevät ne kaikki.
    supabase
      .from("kuitin_liitteet")
      .select("kuitti_id, polku, tyyppi, jarjestys")
      .in(
        "kuitti_id",
        kuititRaaka.map((k) => k.id)
      )
      .order("jarjestys"),
  ]);

  const luokat = new Map((luokatVastaus.data ?? []).map((l) => [l.id, l.nimi]));
  const kaikki: VientiKuitti[] = kuititRaaka.map((kuitti) => ({
    id: kuitti.id,
    toimittaja: kuitti.toimittaja,
    paivays: kuitti.paivays,
    maksupaiva: kuitti.maksupaiva,
    loppusumma_eur: kuitti.loppusumma_eur,
    muistiinpano: kuitti.muistiinpano,
    tiedosto_polku: kuitti.tiedosto_polku,
    tiedosto_tyyppi: kuitti.tiedosto_tyyppi,
    liitteet: (liiteRivit ?? [])
      .filter((l) => l.kuitti_id === kuitti.id)
      .map((l) => ({ polku: l.polku, tyyppi: l.tyyppi })),
    rivit: (rivitRaaka ?? [])
      .filter((r) => r.kuitti_id === kuitti.id)
      .map((r) => ({
        teksti: r.teksti,
        maara: r.maara,
        brutto_eur: r.brutto_eur,
        verokanta: r.verokanta,
        kayttotarkoitus: r.kayttotarkoitus,
        kululuokka: r.kululuokka_id ? (luokat.get(r.kululuokka_id) ?? null) : null,
        muistiinpano: r.muistiinpano,
      })),
  }));

  const kuitit = suodataYksityisotot(kaikki, asetukset.yksityisototMukaan);

  // Tositteet ladataan kerran ja jaetaan PDF:n ja ZIP:n kesken: sama kuva ei
  // kannata hakea Storagesta kahdesti.
  const tiedostot = new Map<string, Tosite>();
  if (muodot.includes("pdf") || muodot.includes("zip")) {
    for (const kuitti of kuitit) {
      for (const liite of kuitti.liitteet) {
        if (tiedostot.has(liite.polku)) continue;
        const { data } = await supabase.storage.from("kuitit").download(liite.polku);
        if (!data) continue;
        tiedostot.set(liite.polku, {
          data: new Uint8Array(await data.arrayBuffer()),
          tyyppi: liite.tyyppi,
        });
      }
    }
  }

  const paketti = await kokoaTiedostot(kausi, kuitit, asetukset, tiedostot);

  const yksi = paketti.size === 1 ? [...paketti.entries()][0] : null;
  if (yksi) {
    const [nimi, data] = yksi;
    const tyyppi = nimi.endsWith(".pdf")
      ? "application/pdf"
      : nimi.endsWith(".csv")
        ? "text/csv; charset=utf-8"
        : "application/zip";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": tyyppi,
        "Content-Disposition": `attachment; filename="${nimi}"`,
      },
    });
  }

  const kaikkiYhdessa = zipSync(Object.fromEntries(paketti), { level: 0 });
  return new NextResponse(new Uint8Array(kaikkiYhdessa), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${paketinNimi(kausi, "paketti")}"`,
    },
  });
}
