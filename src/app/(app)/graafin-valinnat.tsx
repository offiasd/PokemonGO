"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GraafinMittari } from "@/components/vuosigraafi";

const MITTARIT: { arvo: GraafinMittari; nimi: string }[] = [
  { arvo: "tyot", nimi: "Työt" },
  { arvo: "euroa", nimi: "Laskutus" },
];

/**
 * Graafin vuosi ja mittari osoiteparametreina samalla tavalla kuin jakso, jotta
 * valinta säilyy sivun päivityksessä eikä graafi tarvitse omaa tilaansa.
 *
 * Tulevaan vuoteen ei pääse: nuoli on silloin pois käytöstä eikä pelkkä
 * himmennetty linkki, jota voisi silti painaa.
 */
export function GraafinValinnat({
  vuosi,
  mittari,
  suurinVuosi,
  pieninVuosi,
}: {
  vuosi: number;
  mittari: GraafinMittari;
  suurinVuosi: number;
  pieninVuosi: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const osoite = (muutokset: { vuosi?: number; mittari?: GraafinMittari }) => {
    const parametrit = new URLSearchParams(searchParams);
    if (muutokset.vuosi !== undefined) {
      if (muutokset.vuosi === suurinVuosi) parametrit.delete("vuosi");
      else parametrit.set("vuosi", String(muutokset.vuosi));
    }
    if (muutokset.mittari !== undefined) {
      if (muutokset.mittari === "tyot") parametrit.delete("graafi");
      else parametrit.set("graafi", muutokset.mittari);
    }
    const kysely = parametrit.toString();
    return kysely ? `${pathname}?${kysely}` : pathname;
  };

  const nuoli =
    "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
  const poisKaytosta = "pointer-events-none opacity-40";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Link
          href={osoite({ vuosi: vuosi - 1 })}
          aria-label={`Vuosi ${vuosi - 1}`}
          aria-disabled={vuosi <= pieninVuosi || undefined}
          className={cn(nuoli, vuosi <= pieninVuosi && poisKaytosta)}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-14 text-center text-sm font-semibold tabular-nums">
          {vuosi}
        </span>
        <Link
          href={osoite({ vuosi: vuosi + 1 })}
          aria-label={`Vuosi ${vuosi + 1}`}
          aria-disabled={vuosi >= suurinVuosi || undefined}
          className={cn(nuoli, vuosi >= suurinVuosi && poisKaytosta)}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <nav aria-label="Graafin mittari" className="flex gap-1">
        {MITTARIT.map(({ arvo, nimi }) => (
          <Link
            key={arvo}
            href={osoite({ mittari: arvo })}
            aria-current={mittari === arvo ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              mittari === arvo
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {nimi}
          </Link>
        ))}
      </nav>
    </div>
  );
}
