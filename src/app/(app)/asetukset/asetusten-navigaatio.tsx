"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  Boxes,
  Clock,
  Euro,
  Package,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Asetusten osiot. Oma tili on kaikille, loput vain adminille - maalaaja
 * hallitsee vain omia tietojaan, ei koko maalaamon hinnoittelua.
 */
const OSIOT = [
  { href: "/asetukset", nimi: "Omat tiedot", ikoni: UserRound, adminVain: false },
  { href: "/asetukset/suojaus", nimi: "Suojaus", ikoni: ShieldCheck, adminVain: false },
  { href: "/asetukset/hinnoittelu", nimi: "Hinnoittelu", ikoni: Euro, adminVain: true },
  { href: "/asetukset/tyoajat", nimi: "Työ ja tuntihinnat", ikoni: Clock, adminVain: true },
  { href: "/asetukset/varasto", nimi: "Varasto", ikoni: Package, adminVain: true },
  { href: "/asetukset/ilmoitukset", nimi: "Ilmoitukset", ikoni: Bell, adminVain: true },
  { href: "/asetukset/osaryhmat", nimi: "Osaryhmät", ikoni: Boxes, adminVain: true },
  { href: "/asetukset/yritys", nimi: "Yritys", ikoni: Building2, adminVain: true },
];

export function AsetustenNavigaatio({ onAdmin }: { onAdmin: boolean }) {
  const pathname = usePathname();
  const osiot = OSIOT.filter((o) => !o.adminVain || onAdmin);

  return (
    // Kapealla näytöllä vaakarivi joka vierii, työpöydällä pystylista
    // sivupalkkina. Vierityssäiliö estää sivun venymisen puhelimessa.
    <nav
      aria-label="Asetusten osiot"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {osiot.map(({ href, nimi, ikoni: Ikoni }) => {
        // Tarkka vertailu: /asetukset olisi muuten aktiivinen joka osiossa.
        const aktiivinen = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={aktiivinen ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
              aktiivinen
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Ikoni className="size-4 shrink-0" />
            {nimi}
          </Link>
        );
      })}
    </nav>
  );
}
