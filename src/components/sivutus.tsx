"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * Sivunumerot näkyviin: aina ensimmäinen ja viimeinen, nykyisen ympäriltä yksi
 * kumpaankin suuntaan ja väliin kolme pistettä. Näin nappirivi pysyy saman
 * levyisenä myös silloin kun sivuja on kymmeniä.
 */
function sivunumerot(sivu: number, sivuja: number): (number | "...")[] {
  if (sivuja <= 7) return Array.from({ length: sivuja }, (_, i) => i + 1);

  const numerot = new Set([1, sivuja, sivu - 1, sivu, sivu + 1]);
  const jarjestetyt = [...numerot].filter((n) => n >= 1 && n <= sivuja).sort((a, b) => a - b);

  const tulos: (number | "...")[] = [];
  let edellinen = 0;
  for (const n of jarjestetyt) {
    if (edellinen && n - edellinen > 1) tulos.push("...");
    tulos.push(n);
    edellinen = n;
  }
  return tulos;
}

export function Sivutus({
  sivu,
  sivuja,
  className,
}: {
  sivu: number;
  sivuja: number;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (sivuja <= 1) return null;

  /** Säilyttää muut hakuehdot ja vaihtaa vain sivun. Sivu 1 jätetään pois. */
  function osoite(kohde: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (kohde <= 1) {
      params.delete("sivu");
    } else {
      params.set("sivu", String(kohde));
    }
    const kysely = params.toString();
    return kysely ? `${pathname}?${kysely}` : pathname;
  }

  const nappi = (valittu: boolean) =>
    cn(
      buttonVariants({ variant: valittu ? "default" : "outline", size: "icon" }),
      "size-9",
      valittu && "pointer-events-none"
    );

  return (
    <nav aria-label="Sivutus" className={cn("flex flex-wrap items-center gap-1", className)}>
      <Link
        href={osoite(sivu - 1)}
        aria-label="Edellinen sivu"
        aria-disabled={sivu === 1}
        tabIndex={sivu === 1 ? -1 : undefined}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "size-9",
          sivu === 1 && "pointer-events-none opacity-50"
        )}
      >
        <ChevronLeft className="size-4" />
      </Link>

      {sivunumerot(sivu, sivuja).map((n, i) =>
        n === "..." ? (
          <span key={`valj-${i}`} className="px-1 text-muted-foreground">
            ...
          </span>
        ) : (
          <Link
            key={n}
            href={osoite(n)}
            aria-label={`Sivu ${n}`}
            aria-current={n === sivu ? "page" : undefined}
            className={nappi(n === sivu)}
          >
            {n}
          </Link>
        )
      )}

      <Link
        href={osoite(sivu + 1)}
        aria-label="Seuraava sivu"
        aria-disabled={sivu === sivuja}
        tabIndex={sivu === sivuja ? -1 : undefined}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "size-9",
          sivu === sivuja && "pointer-events-none opacity-50"
        )}
      >
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}
