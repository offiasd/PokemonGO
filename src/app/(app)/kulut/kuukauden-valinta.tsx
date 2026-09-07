"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { KUUKAUDEN_NIMI } from "@/lib/vakiot";

/**
 * Kuukauden selaus osoiteparametreina.
 *
 * Kuitit haetaan palvelimelta kuukausi kerrallaan, joten valinta kuuluu
 * osoitteeseen: linkin voi jakaa ja sivun päivittää ilman että näkymä hyppää
 * kuluvaan kuukauteen.
 */
export function KuukaudenValinta({
  vuosi,
  kuukausi,
  children,
  naapurit = false,
}: {
  vuosi: number;
  kuukausi: number;
  /** Nuolten väliin jäävä sisältö. Ilman tätä näytetään kuukauden nimi. */
  children?: React.ReactNode;
  /**
   * Nimeä nuolet naapurikuukausilla ja jätä keskiosa tyhjäksi. Käytetään kun
   * kuukauden nimi lukee jo vieressä: sama tieto kahdesti veisi vain tilaa.
   */
  naapurit?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nyt = new Date();

  const osoite = (siirto: number) => {
    const kohde = new Date(Date.UTC(vuosi, kuukausi + siirto, 1));
    const parametrit = new URLSearchParams(searchParams);
    parametrit.set("vuosi", String(kohde.getUTCFullYear()));
    parametrit.set("kk", String(kohde.getUTCMonth()));
    return `${pathname}?${parametrit.toString()}`;
  };

  // Tulevaan kuukauteen ei pääse: kuitteja ei voi olla vielä olemassa.
  const tuleva =
    vuosi > nyt.getUTCFullYear() ||
    (vuosi === nyt.getUTCFullYear() && kuukausi >= nyt.getUTCMonth());

  const nuoli =
    "flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

  const naapurinNimi = (siirto: number) =>
    KUUKAUDEN_NIMI[new Date(Date.UTC(vuosi, kuukausi + siirto, 1)).getUTCMonth()];

  const nappi = naapurit
    ? "flex items-center gap-1 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    : nuoli;

  return (
    <nav aria-label="Kuukausi" className="flex items-center justify-between gap-3">
      <Link href={osoite(-1)} aria-label="Edellinen kuukausi" className={nappi}>
        <ChevronLeft className="size-4" />
        {naapurit && naapurinNimi(-1)}
      </Link>
      {children ??
        (naapurit ? null : (
          <span className="text-sm font-semibold">
            {KUUKAUDEN_NIMI[kuukausi]} {vuosi}
          </span>
        ))}
      <Link
        href={osoite(1)}
        aria-label="Seuraava kuukausi"
        aria-disabled={tuleva || undefined}
        className={cn(nappi, tuleva && "pointer-events-none opacity-40")}
      >
        {naapurit && naapurinNimi(1)}
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}
