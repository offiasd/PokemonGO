"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronRight, Clock, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToimittajanKuvake } from "@/components/toimittajan-kuvake";
import { cn } from "@/lib/utils";
import { muotoileEuro, muotoilePaivaLyhyt } from "@/lib/vakiot";

import { poistaKuittiEra } from "../../actions";

export interface EranKuitti {
  id: string;
  toimittaja: string | null;
  paivays: string;
  loppusummaEur: number;
  tila: "luonnos" | "tarkistettava" | "valmis";
  poiminnanTila: "ei_luettu" | "jonossa" | "luetaan" | "luettu" | "virhe";
  poiminnanVirhe: string | null;
}

/** Kysely kannalta sekunneissa. Jono etenee minuutin välein, tämä hieman tiheämmin. */
const PAIVITYSVALI_MS = 5000;

/**
 * Yhden kuitin tila sanoina.
 *
 * Neljä tilaa neljällä sanalla: jonossa, luetaan, tarkista, valmis. Virhe on
 * viides, ja sen syy näytetään sellaisenaan - "luku epäonnistui" ilman syytä
 * ei auta korjaamaan mitään.
 */
function tilanKuvaus(kuitti: EranKuitti): { teksti: string; sävy: string; ikoni: typeof Clock } {
  if (kuitti.poiminnanTila === "virhe") {
    return {
      teksti: kuitti.poiminnanVirhe ?? "Luku epäonnistui",
      sävy: "text-destructive",
      ikoni: AlertTriangle,
    };
  }
  if (kuitti.poiminnanTila === "jonossa") {
    return { teksti: "Jonossa", sävy: "text-muted-foreground", ikoni: Clock };
  }
  if (kuitti.poiminnanTila === "luetaan") {
    return { teksti: "Luetaan…", sävy: "text-muted-foreground", ikoni: Loader2 };
  }
  if (kuitti.tila === "valmis") {
    return { teksti: "Valmis", sävy: "text-tila-vihrea-teksti", ikoni: Check };
  }
  return { teksti: "Tarkista ja luokittele", sävy: "text-warning", ikoni: AlertTriangle };
}

export function EranTila({
  eraId,
  tiedostoja,
  luotu,
  kuitit,
}: {
  eraId: string;
  tiedostoja: number;
  luotu: string;
  kuitit: EranKuitti[];
}) {
  const router = useRouter();
  const [poistoAuki, setPoistoAuki] = useState(false);
  const [poistaa, poista] = useTransition();

  const kesken = kuitit.filter(
    (k) => k.poiminnanTila === "jonossa" || k.poiminnanTila === "luetaan"
  ).length;

  // Luku etenee taustalla, joten sivu haetaan palvelimelta uudelleen kunnes
  // jono on tyhjä. Päivitys tehdään router.refreshillä eikä omalla
  // kantakyselyllä: silloin sivu lukee tilan samaa tietä kuin ensimmäiselläkin
  // kerralla, eikä samaa kyselyä ole kahdessa paikassa. Kysely loppuu
  // itsestään - valmiin erän sivu ei jää päivittymään.
  useEffect(() => {
    if (kesken === 0) return;
    const ajastin = window.setInterval(() => router.refresh(), PAIVITYSVALI_MS);
    return () => window.clearInterval(ajastin);
  }, [kesken, router]);

  function vahvistaPoisto() {
    poista(async () => {
      const tulos = await poistaKuittiEra(eraId);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      setPoistoAuki(false);
      toast.success("Erä poistettu.");
      router.push("/kulut");
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-0.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <h1 className="truncate text-xl font-semibold">Tuontierä</h1>
          <p className="shrink-0 text-sm text-muted-foreground">
            {new Date(luotu).toLocaleString("fi-FI")}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {kuitit.length}/{tiedostoja} kuittia
          {kesken > 0 ? ` · ${kesken} luettavana` : " · luettu"}
        </p>
      </div>

      {kesken > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          Luku etenee taustalla muutama kuitti kerrallaan. Voit sulkea tämän näkymän - mikään ei
          katoa.
        </p>
      )}

      <div className="grid">
        {kuitit.map((kuitti, jarjestys) => {
          const tila = tilanKuvaus(kuitti);
          const Ikoni = tila.ikoni;
          return (
            <Link
              key={kuitti.id}
              href={`/kulut/${kuitti.id}`}
              className={cn(
                "-mx-2 flex min-w-0 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-accent/50",
                jarjestys > 0 && "border-t"
              )}
            >
              <ToimittajanKuvake
                toimittaja={kuitti.toimittaja}
                puutteellinen={kuitti.poiminnanTila === "virhe"}
              />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate font-medium">
                  {kuitti.toimittaja ?? "Toimittaja lukematta"}
                </span>
                <span className={cn("flex min-w-0 items-center gap-1.5 text-sm", tila.sävy)}>
                  <Ikoni
                    className={cn(
                      "size-3.5 shrink-0",
                      kuitti.poiminnanTila === "luetaan" && "animate-spin"
                    )}
                  />
                  <span className="truncate">{tila.teksti}</span>
                </span>
              </span>
              <span className="shrink-0 text-right text-sm text-muted-foreground">
                {muotoilePaivaLyhyt(kuitti.paivays)}
                <span className="block text-base font-medium tabular-nums text-foreground">
                  {muotoileEuro(kuitti.loppusummaEur)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setPoistoAuki(true)}
        >
          <Trash2 className="size-4" />
          Poista koko erä
        </Button>
      </div>

      <Dialog open={poistoAuki} onOpenChange={setPoistoAuki}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Poistetaanko koko erä?</DialogTitle>
            <DialogDescription>
              Erän {kuitit.length} kuittia ja niiden tiedostot poistetaan pysyvästi. Jos jokin erän
              kuiteista on jo luovutettu kirjanpitäjälle, poisto keskeytyy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={poistaa}
              onClick={() => setPoistoAuki(false)}
            >
              Peruuta
            </Button>
            <Button type="button" variant="destructive" disabled={poistaa} onClick={vahvistaPoisto}>
              {poistaa ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Poista erä
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
