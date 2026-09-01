"use client";

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
  { href: "/asetukset", label: "Asetukset", icon: Settings, adminVain: true },
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

  return (
    <aside className="flex shrink-0 flex-col border-b bg-card md:h-screen md:w-64 md:border-r md:border-b-0">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Paintbrush className="size-4" />
        </div>
        <span className="font-semibold">Jauhemaalaamo</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-x-auto px-2 py-2 md:overflow-visible">
        {linkit.map(({ href, label, icon: Icon }) => {
          const aktiivinen = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                aktiivinen
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t px-4 py-4">
        <Avatar className="size-8">
          <AvatarFallback>{nimikirjaimet(kayttaja.fullName ?? kayttaja.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {kayttaja.fullName ?? kayttaja.email}
          </p>
          <p className="truncate text-xs text-muted-foreground capitalize">
            {kayttaja.role === "admin" ? "Admin" : "Maalaaja"}
          </p>
        </div>
        <form action={kirjauduUlos}>
          <Button type="submit" variant="ghost" size="icon" title="Kirjaudu ulos">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </aside>
  );
}
