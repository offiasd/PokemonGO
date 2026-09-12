"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { muotoileEuro } from "@/lib/vakiot";

import { siirraRiviKalustoon } from "../kalusto/actions";

export interface SiirrettavaRivi {
  id: string;
  teksti: string;
  /** Veroton hinta: kalustossa hankintameno on aina ALV 0 %. */
  nettoEur: number;
  siirretty: boolean;
}

/**
 * Yli 1 200 euron rivit kuitilla.
 *
 * Nämä eivät ole pienhankintoja vaan kalustoa, joka vähennetään
 * menojäännöspoistoina usean vuoden yli. Siirto on yksi painallus siitä
 * kohtaa jossa hankinta on juuri luokiteltu - myöhemmin se on helppo unohtaa,
 * ja unohtunut hankinta katoaa poistopohjasta kokonaan.
 */
export function KalustoonSiirto({ rivit }: { rivit: SiirrettavaRivi[] }) {
  const router = useRouter();
  const [kesken, aja] = useTransition();
  const [siirrettava, setSiirrettava] = useState<string | null>(null);

  if (rivit.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Yli 1 200 euron hankinta</CardTitle>
        <CardDescription>
          Ei ole pienhankinta vaan kalustoa. Hankintameno kirjataan verottomana ja vähennetään
          menojäännöspoistoina.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rivit.map((rivi) => (
          <div
            key={rivi.id}
            className="grid gap-1 border-t pt-3 first:border-t-0 first:pt-0 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 font-medium wrap-anywhere">{rivi.teksti}</span>
              <span className="font-medium tabular-nums">
                {muotoileEuro(rivi.nettoEur)} (netto)
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {rivi.siirretty ? (
                <span className="text-muted-foreground">Siirretty kalustoon</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={kesken}
                  onClick={() => {
                    setSiirrettava(rivi.id);
                    aja(async () => {
                      try {
                        await siirraRiviKalustoon(rivi.id, rivi.teksti);
                        toast.success("Siirretty kalustoon.");
                        router.refresh();
                      } catch (virhe) {
                        toast.error(
                          virhe instanceof Error ? virhe.message : "Siirto epäonnistui."
                        );
                      } finally {
                        setSiirrettava(null);
                      }
                    });
                  }}
                >
                  <ArrowRightLeft className="size-4" />
                  {siirrettava === rivi.id ? "Siirretään" : "Siirrä kalustoon"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
