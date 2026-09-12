/**
 * Tilikauden koosteen lataus kirjanpitäjälle.
 *
 * Kuukausipaketin sisar: sama hahmo, eri sisältö. Kuukausipaketti luovuttaa
 * tositteet kuvineen, tämä kokoaa vuoden luvut yhteen. Kuittikuvat jäävät
 * tästä pois - ne on jo luovutettu kuukausittain, eikä vuoden kuvia kannata
 * lähettää toiseen kertaan.
 *
 * Reittikäsittelijä eikä server action, koska tuloksena on tiedosto eikä
 * tilamuutos.
 */

import { NextResponse } from "next/server";
import { zipSync } from "fflate";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { tilikaudenNimi, type TilikaudenMuoto } from "@/lib/tilikausi";
import { haeTilikaudenAineisto } from "@/lib/tilikausi-haku";
import { kokoaTilikausi } from "@/lib/tilikausi-paketti";

// pdf-lib vaatii Node-ympäristön.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(pyynto: Request) {
  const kayttaja = await vaaditaanKayttaja();
  if (kayttaja.role !== "admin") {
    return NextResponse.json({ virhe: "Vain admin voi ladata aineiston." }, { status: 403 });
  }

  const parametrit = new URL(pyynto.url).searchParams;
  const vuosi = Number(parametrit.get("vuosi"));
  if (!Number.isInteger(vuosi) || vuosi < 2000 || vuosi > 2100) {
    return NextResponse.json({ virhe: "Virheellinen tilikausi." }, { status: 400 });
  }

  const muodot = (parametrit.get("muodot") ?? "pdf,csv")
    .split(",")
    .filter((m): m is TilikaudenMuoto => m === "pdf" || m === "csv");
  if (muodot.length === 0) {
    return NextResponse.json({ virhe: "Valitse vähintään yksi muoto." }, { status: 400 });
  }

  const supabase = await createClient();
  const aineisto = await haeTilikaudenAineisto(supabase, vuosi);
  const paketti = await kokoaTilikausi(aineisto, muodot);

  const yksi = paketti.size === 1 ? [...paketti.entries()][0] : null;
  if (yksi) {
    const [nimi, data] = yksi;
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": nimi.endsWith(".pdf") ? "application/pdf" : "application/zip",
        "Content-Disposition": `attachment; filename="${nimi}"`,
      },
    });
  }

  // Molemmat muodot: PDF ja taulukko-ZIP yhteen. Sisältö on jo pakattua,
  // joten uudelleenpakkaus veisi aikaa eikä tilaa.
  const kaikki = zipSync(Object.fromEntries(paketti), { level: 0 });
  return new NextResponse(new Uint8Array(kaikki), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${tilikaudenNimi(vuosi, "paketti")}"`,
    },
  });
}
