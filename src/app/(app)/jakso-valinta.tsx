"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { JAKSOT, OLETUSJAKSO } from "@/lib/jaksot";

/**
 * Jakson valinta linkkeinä eikä lomakkeena: valinta säilyy osoitteessa, joten
 * sivun voi jakaa ja päivittää ilman että näkymä hyppää takaisin oletukseen.
 */
export function JaksoValinta({ valittu }: { valittu: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Yhteenvedon aikaväli" className="flex flex-wrap gap-1">
      {JAKSOT.map(({ arvo, nimi }) => (
        <Link
          key={arvo}
          href={arvo === OLETUSJAKSO ? pathname : `${pathname}?jakso=${arvo}`}
          aria-current={valittu === arvo ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            valittu === arvo
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {nimi}
        </Link>
      ))}
    </nav>
  );
}
