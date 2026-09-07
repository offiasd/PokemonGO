"use client";

import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";

import { ToimittajanKuvake } from "@/components/toimittajan-kuvake";
import { cn } from "@/lib/utils";
import { muotoileEuro, muotoilePaivaLyhyt } from "@/lib/vakiot";

import { useViimeisinKuitti } from "./viimeisin-kuitti";

export interface KuittiListalla {
  id: string;
  toimittaja: string | null;
  paivays: string;
  loppusummaEur: number;
  kuluinaEur: number;
  onPdf: boolean;
  /** Puutteen syy suomeksi, tai null kun kuitti on kunnossa. */
  puute: string | null;
  /** Mitätöity kuitti ei ole summissa mukana mutta pysyy listalla. */
  mitatoity: boolean;
  mitatointiSyy: string | null;
}

/**
 * Kuukauden kuitit listana.
 *
 * Puutteellisia ei eroteta omaan laatikkoonsa vaan ne nostetaan esiin
 * paikallaan: lämmin kuvake ja puutteen syy päiväyksen perässä. Näin lista
 * pysyy aikajärjestyksessä eikä sama kuitti näy kahdessa paikassa.
 *
 * Nuoli merkitsee sen kuitin, joka on auki Kuitti-välilehdellä.
 *
 * Mitätöity kuitti pysyy listalla läpiviivattuna ja syineen: kirjanpidossa
 * vientejä ei poisteta vaan oikaistaan, ja lukijan pitää nähdä että jotain
 * korjattiin.
 */
export function Kuittilista({ kuitit }: { kuitit: KuittiListalla[] }) {
  const avoin = useViimeisinKuitti();

  if (kuitit.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Ei kuitteja tälle kuukaudelle. Kuvaa ensimmäinen alareunan painikkeesta.
      </p>
    );
  }

  return (
    <div className="grid">
      {kuitit.map((kuitti, jarjestys) => (
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
            puutteellinen={kuitti.puute !== null}
          />
          <span className={cn("grid min-w-0 flex-1 gap-0.5", kuitti.mitatoity && "opacity-60")}>
            <span className="flex min-w-0 items-center gap-1">
              <span className={cn("truncate font-medium", kuitti.mitatoity && "line-through")}>
                {kuitti.toimittaja ?? "Toimittaja puuttuu"}
              </span>
              {kuitti.id === avoin && (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
              {kuitti.onPdf && <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
            </span>
            <span
              className={cn(
                "truncate text-sm",
                kuitti.puute ? "text-warning" : "text-muted-foreground"
              )}
            >
              {muotoilePaivaLyhyt(kuitti.paivays)}
              {" · "}
              {kuitti.mitatoity
                ? `Mitätöity: ${kuitti.mitatointiSyy ?? "syytä ei kirjattu"}`
                : (kuitti.puute ?? `kuluina ${muotoileEuro(kuitti.kuluinaEur)}`)}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 text-lg font-medium tabular-nums",
              kuitti.mitatoity && "text-muted-foreground line-through"
            )}
          >
            {muotoileEuro(kuitti.loppusummaEur)}
          </span>
        </Link>
      ))}
    </div>
  );
}
