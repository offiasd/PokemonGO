import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { kaytettavatKayttotarkoitukset, opinAvain, type Kayttotarkoitus } from "@/lib/kulut";

import { KuitinLomake } from "./kuitin-lomake";
import { KuitinPoisto } from "./kuitin-poisto";

/** Allekirjoitetun linkin voimassaolo. Kuitit ovat yksityisiä. */
const LINKIN_VOIMASSAOLO_S = 60 * 60;

export default async function KuittiSivu({ params }: { params: Promise<{ id: string }> }) {
  await vaaditaanAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const [{ data: kuitti }, luokatVastaus, opitutVastaus] = await Promise.all([
    supabase.from("kuitit").select("*").eq("id", id).single(),
    supabase.from("kululuokat").select("id, nimi").eq("aktiivinen", true).order("jarjestys"),
    supabase.from("kuittirivin_oppi").select("teksti, kayttotarkoitus, kululuokka_id"),
  ]);

  if (!kuitti) notFound();

  // Kuitit ovat yksityisessä ämpärissä, joten kuva luetaan aikarajoitetulla
  // allekirjoitetulla linkillä eikä julkisella osoitteella.
  let tiedostoUrl: string | null = null;
  if (kuitti.tiedosto_polku) {
    const { data } = await supabase.storage
      .from("kuitit")
      .createSignedUrl(kuitti.tiedosto_polku, LINKIN_VOIMASSAOLO_S);
    tiedostoUrl = data?.signedUrl ?? null;
  }

  const luokat = luokatVastaus.data ?? [];
  const opitut = Object.fromEntries(
    (opitutVastaus.data ?? []).map((o) => [
      opinAvain(o.teksti),
      { kayttotarkoitus: o.kayttotarkoitus as Kayttotarkoitus, kululuokkaId: o.kululuokka_id },
    ])
  );

  const { data: rivitData } = await supabase
    .from("kuitin_rivit")
    .select("*")
    .eq("kuitti_id", id)
    .order("jarjestys");
  const rivit = rivitData ?? [];

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/kulut">
            <ArrowLeft className="size-4" />
            Kulut
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="text-base">Kuitti</CardTitle>
          </CardHeader>
          <CardContent>
            {!tiedostoUrl && (
              <p className="text-sm text-muted-foreground">
                Kuittiin ei ole liitetty tiedostoa.
              </p>
            )}
            {tiedostoUrl && kuitti.tiedosto_tyyppi === "application/pdf" && (
              <a
                href={tiedostoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline underline-offset-2"
              >
                Avaa PDF
              </a>
            )}
            {tiedostoUrl && kuitti.tiedosto_tyyppi !== "application/pdf" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tiedostoUrl}
                alt="Kuitti"
                className="w-full rounded-md border object-contain"
              />
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Säilytettävä{" "}
              {new Date(kuitti.sailytettava_asti).toLocaleDateString("fi-FI")} asti
              (kirjanpitolaki 2:10 §).
            </p>

            <div className="mt-3 border-t pt-3">
              <KuitinPoisto
                kuittiId={kuitti.id}
                toimittaja={kuitti.toimittaja}
                paivays={kuitti.paivays}
                loppusummaEur={kuitti.loppusumma_eur}
                sailytettavaAsti={kuitti.sailytettava_asti}
              />
            </div>
          </CardContent>
        </Card>

        <KuitinLomake
          kuitti={{
            id: kuitti.id,
            toimittaja: kuitti.toimittaja,
            paivays: kuitti.paivays,
            maksupaiva: kuitti.maksupaiva,
            loppusummaEur: kuitti.loppusumma_eur,
            muistiinpano: kuitti.muistiinpano,
            tila: kuitti.tila,
            alvErittely: kuitti.alv_erittely,
          }}
          rivit={rivit.map((r) => ({
            avain: r.id,
            teksti: r.teksti,
            maara: r.maara,
            bruttoEur: r.brutto_eur,
            verokanta: r.verokanta,
            kayttotarkoitus: r.kayttotarkoitus,
            kululuokkaId: r.kululuokka_id,
            muistiinpano: r.muistiinpano,
          }))}
          luokat={luokat}
          opitut={opitut}
          kayttotarkoitukset={kaytettavatKayttotarkoitukset(asetukset)}
          naytaAlv={asetukset.alv_rekisterissa}
        />
      </div>
    </div>
  );
}
