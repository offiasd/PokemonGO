import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { euromaaraPuuttuu, muotoileEuro } from "@/lib/vakiot";
import type { EhdotettuMaalirivi } from "@/lib/supabase/database.types";

import { TaydennysLomake, type ValittavaVari } from "./taydennys-lomake";

export default async function TaydennysSivu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Varastotäydennys muuttaa saldoja ja kilohintoja: taloustietoa läpeensä.
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { data: kuitti } = await supabase.from("kuitit").select("*").eq("id", id).single();
  if (!kuitti) notFound();

  const paluu = (
    <Button asChild variant="ghost" size="sm">
      <Link href={`/kulut/${id}`}>
        <ArrowLeft className="size-4" />
        Kuitti
      </Link>
    </Button>
  );

  // Jo käsitelty kuitti: toinen käsittely kasvattaisi saldon kahteen kertaan.
  if (kuitti.maaliera_id) {
    return (
      <div className="grid gap-4">
        {paluu}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kuitista on jo luotu erä</CardTitle>
            <CardDescription>
              Saman kuitin käsittely kahdesti kasvattaisi saldon kahteen kertaan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/varit/erat">Avaa erät</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vieraan valuutan kuitti ilman vahvistettua euromäärää: kilohinta olisi
  // väärä, ja väärä kilohinta vääristää kaikkien tulevien töiden katteen.
  if (euromaaraPuuttuu(kuitti.valuutta, kuitti.kurssin_lahde)) {
    return (
      <div className="grid gap-4">
        {paluu}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Euromäärä on vahvistamatta</CardTitle>
            <CardDescription>
              Kuitti on {kuitti.valuutta}-määräinen, eikä tililtä luettua veloitusta ole syötetty.
              Ilman euromäärää kilohinta olisi väärä, ja se vääristäisi kaikkien tulevien töiden
              katteen.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="flex items-start gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Loppusumma kuitilla {muotoileEuro(kuitti.loppusumma_valuutassa ?? 0)} (
                {kuitti.valuutta}). Syötä todellinen veloitus kuitin tiedoissa, niin täydennyksen
                voi luoda.
              </span>
            </p>
            <Button asChild>
              <Link href={`/kulut/${id}`}>Avaa kuitin tiedot</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [{ data: ehdotukset }, { data: varit }] = await Promise.all([
    supabase.rpc("ehdota_maalirivit", { p_kuitti_id: id }),
    supabase
      .from("varit")
      .select("id, nimi, valmistaja")
      .eq("aktiivinen", true)
      .order("nimi"),
  ]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {paluu}
        <div>
          <h1 className="text-xl font-semibold">Varastotäydennys kuitista</h1>
          <p className="text-sm text-muted-foreground">
            {kuitti.toimittaja ?? "Toimittaja puuttuu"} ·{" "}
            {new Date(kuitti.paivays).toLocaleDateString("fi-FI")}
          </p>
        </div>
      </div>

      <TaydennysLomake
        kuittiId={id}
        ehdotukset={(ehdotukset ?? []) as EhdotettuMaalirivi[]}
        varit={(varit ?? []) as ValittavaVari[]}
      />
    </div>
  );
}
