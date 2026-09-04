"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Paintbrush,
  Settings,
  Users,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { NykyinenKayttaja } from "@/lib/supabase/kayttaja";

import { kirjauduUlos } from "../kirjaudu/actions";

const LINKIT = [
  { href: "/", label: "Etusivu", icon: LayoutDashboard, adminVain: false },
  { href: "/varit", label: "Värit", icon: Paintbrush, adminVain: false },
  { href: "/osat", label: "Osat", icon: Wrench, adminVain: false },
  { href: "/tyot", label: "Työt", icon: ClipboardCheck, adminVain: false },
  { href: "/raportit", label: "Raportit", icon: BarChart3, adminVain: false },
  { href: "/halytykset", label: "Hälytykset", icon: AlertTriangle, adminVain: false },
  { href: "/kayttajat", label: "Käyttäjät", icon: Users, adminVain: true },
  // Asetukset on kaikille: maalaaja hallitsee siellä omia tietojaan ja
  // kirjautumisen suojausta, admin lisäksi maalaamon asetuksia.
  { href: "/asetukset", label: "Asetukset", icon: Settings, adminVain: false },
];

function nimikirjaimet(nimi: string | null) {
  if (!nimi) return "?";
  return nimi
    .split(" ")
    .map((osa) => osa[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SovellusNavigaatio({ kayttaja }: { kayttaja: NykyinenKayttaja }) {
  const pathname = usePathname();
  const linkit = LINKIT.filter((linkki) => !linkki.adminVain || kayttaja.role === "admin");
  const onAktiivinen = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const listaRef = useRef<HTMLDivElement>(null);
  const aktiivinenRef = useRef<HTMLAnchorElement>(null);

  // Nykyinen sivu voi olla neljän näkyvän ulkopuolella, jolloin käyttäjä ei
  // näkisi missä on. Vieritetään se keskelle - vain vaakasuunnassa, jottei sivu
  // hyppää pystysuunnassa kuten scrollIntoView tekisi.
  useEffect(() => {
    const lista = listaRef.current;
    const kohta = aktiivinenRef.current;
    if (!lista || !kohta) return;
    lista.scrollLeft = kohta.offsetLeft - (lista.clientWidth - kohta.clientWidth) / 2;
  }, [pathname]);

  const tunniste = (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Paintbrush className="size-4" />
      </div>
      <span className="font-semibold">Jauhemaalaamo</span>
    </div>
  );

  const kayttajaTiedot = (
    <>
      <Avatar className="size-8">
        <AvatarFallback>{nimikirjaimet(kayttaja.fullName ?? kayttaja.email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{kayttaja.fullName ?? kayttaja.email}</p>
        <p className="truncate text-xs text-muted-foreground capitalize">
          {kayttaja.role === "admin" ? "Admin" : "Maalaaja"}
        </p>
      </div>
      <form action={kirjauduUlos}>
        <Button type="submit" variant="ghost" size="icon" title="Kirjaudu ulos">
          <LogOut className="size-4" />
        </Button>
      </form>
    </>
  );

  return (
    <>
      {/* Puhelimessa navigointi siirtyy alareunaan, joten tunniste ja
          uloskirjautuminen tarvitsevat oman ohuen palkkinsa ylös. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 py-2 md:hidden">
        {tunniste}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback>{nimikirjaimet(kayttaja.fullName ?? kayttaja.email)}</AvatarFallback>
          </Avatar>
          <form action={kirjauduUlos}>
            <Button type="submit" variant="ghost" size="icon" title="Kirjaudu ulos">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      {/* Työpöydällä sivupalkki pysyy ennallaan. */}
      <aside className="hidden shrink-0 flex-col border-r bg-card md:flex md:h-screen md:w-64">
        <div className="px-4 py-4">{tunniste}</div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
          {linkit.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={onAktiivinen(href) ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                onAktiivinen(href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t px-4 py-4">{kayttajaTiedot}</div>
      </aside>

      {/* Puhelimen navigointi: kiinni alareunassa, neljä kohtaa kerrallaan ja
          loput vierittämällä. Turva-alue jättää tilaa iPhonen kotipalkille. */}
      <nav
        aria-label="Päänavigaatio"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card md:hidden"
      >
        <div
          ref={listaRef}
          className="flex snap-x snap-mandatory overflow-x-auto pb-[env(safe-area-inset-bottom)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {linkit.map(({ href, label, icon: Icon }) => {
            const aktiivinen = onAktiivinen(href);
            return (
              <Link
                key={href}
                href={href}
                ref={aktiivinen ? aktiivinenRef : undefined}
                aria-current={aktiivinen ? "page" : undefined}
                // w-1/4 tekee tasan neljä kohtaa näkyviin ruudun leveydestä
                // riippumatta; loput ovat vierityksen takana.
                className={cn(
                  "flex w-1/4 shrink-0 snap-start flex-col items-center gap-1 px-1 pt-2 pb-1.5 transition-colors",
                  aktiivinen ? "text-primary" : "text-muted-foreground"
                )}
              >
                {/* Aktiivinen erottuu sävyllä, lihavoinnilla ja kuvakkeen
                    taustapillerillä. Nosto olisi hypännyt vieritettäessä, ja
                    pelkkä sävy jää kirkkaassa valossa helposti huomaamatta. */}
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    aktiivinen && "bg-primary/10"
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[0.6875rem] leading-tight",
                    aktiivinen ? "font-semibold" : "font-medium"
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
