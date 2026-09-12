"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { muotoileEuro } from "@/lib/vakiot";
import type { YlisuuriHankinta } from "@/lib/kulut";

import { siirraRiviKalustoon } from "./actions";

/**
 * Kuitin rivit, jotka kuuluisivat kalustoon.
 *
 * Kaksi eri tilannetta samassa näkymässä:
 *
 * 1. Yli 1 200 euron hankinta ei ole pienhankinta lainkaan. Se kuuluu
 *    kalustoon, ja siirto on suoraviivainen.
 *
 * 2. Kun 3 600 euron vuosikatto ylittyy, ylimenevä osa aktivoidaan. Laki ei
 *    määrää mitkä hankinnat siirretään, joten valinta on käyttäjän - lista on
 *    suurin ensin, koska katon saa mahtumaan pienimmällä määrällä siirtoja
 *    siitä päästä. Valintaa ei automatisoida.
 */
export function SiirrettavatRivit({
  vuosi,
  ylisuuret,
  katonAlaiset,
  kaytettyEur,
  ylitysEur,
  kattoEur,
}: {
  vuosi: number;
  ylisuuret: YlisuuriHankinta[];
  katonAlaiset: YlisuuriHankinta[];
  kaytettyEur: number;
  ylitysEur: number;
  kattoEur: number;
}) {
  const router = useRouter();
  const [kesken, aja] = useTransition();
  const [siirrettava, setSiirrettava] = useState<string | null>(null);

  const kattoYlittyy = ylitysEur > 0;
  if (ylisuuret.length === 0 && !kattoYlittyy) return null;

  function siirra(rivi: YlisuuriHankinta) {
    if (!rivi.riviId) return;
    setSiirrettava(rivi.riviId);
    aja(async () => {
      try {
        await siirraRiviKalustoon(rivi.riviId as string, rivi.teksti);
        toast.success("Siirretty kalustoon ja poistolaskelma päivitetty.");
        router.refresh();
      } catch (virhe) {
        toast.error(virhe instanceof Error ? virhe.message : "Siirto epäonnistui.");
      } finally {
        setSiirrettava(null);
      }
    });
  }

  function Rivi({ rivi }: { rivi: YlisuuriHankinta }) {
    return (
      <div className="grid gap-1 border-t pt-3 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="min-w-0 font-medium wrap-anywhere">{rivi.teksti}</span>
          <span className="font-medium tabular-nums">{muotoileEuro(rivi.nettoEur)}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0 text-muted-foreground wrap-anywhere">
            {rivi.paivays ? new Date(rivi.paivays).toLocaleDateString("fi-FI") : ""}
            {rivi.toimittaja ? ` · ${rivi.toimittaja}` : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={kesken || rivi.riviId === null}
            onClick={() => siirra(rivi)}
          >
            <ArrowRightLeft className="size-4" />
            {siirrettava === rivi.riviId ? "Siirretään" : "Siirrä kalustoon"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {ylisuuret.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yli 1 200 euron hankinnat {vuosi}</CardTitle>
            <CardDescription>
              Nämä eivät ole pienhankintoja vaan poistopohjaa. Summat ovat verottomia.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {ylisuuret.map((rivi) => (
              <Rivi key={rivi.riviId ?? rivi.teksti} rivi={rivi} />
            ))}
          </CardContent>
        </Card>
      )}

      {kattoYlittyy && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pienhankintojen katto ylittyy</CardTitle>
            <CardDescription>
              Käytetty {muotoileEuro(kaytettyEur)} / {muotoileEuro(kattoEur)}. Ylimenevä osa{" "}
              {muotoileEuro(ylitysEur)} aktivoidaan kalustoksi.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="flex items-start gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Laki ei määrää mitkä hankinnat siirretään, joten valinta on sinun. Siirretty
                hankinta ei enää kuluta kattoa, vaan se vähennetään menojäännöspoistoina.
              </span>
            </p>
            <div className="grid gap-2">
              {katonAlaiset.map((rivi) => (
                <Rivi key={rivi.riviId ?? rivi.teksti} rivi={rivi} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
