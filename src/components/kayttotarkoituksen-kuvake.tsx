import { CircleHelp, Coffee, Handshake, User, Wrench } from "lucide-react";

import type { Kayttotarkoitus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const KUVAKKEET = {
  yrityksen_tarvike: Wrench,
  edustus: Handshake,
  henkilokunnan_tarjoilu: Coffee,
  yksityisotto: User,
} satisfies Record<Kayttotarkoitus, typeof Wrench>;

/**
 * Rivin käyttötarkoitus kuvakkeena.
 *
 * Yrityksen kulut erottuvat yksityisotoista jo silmäyksellä: väri kertoo
 * kumpaan pinoon rivi kuuluu, kuvake mihin se meni. Luokittelematon on
 * lämpimällä taustalla, koska juuri se estää kuukauden luovutuksen.
 */
export function KayttotarkoituksenKuvake({
  kayttotarkoitus,
  className,
}: {
  kayttotarkoitus: Kayttotarkoitus | null;
  className?: string;
}) {
  const Kuvake = kayttotarkoitus ? KUVAKKEET[kayttotarkoitus] : CircleHelp;
  const yrityksenKulu = kayttotarkoitus !== null && kayttotarkoitus !== "yksityisotto";

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        kayttotarkoitus === null && "bg-warning/15 text-warning",
        yrityksenKulu && "bg-korostus/10 text-korostus",
        kayttotarkoitus === "yksityisotto" && "bg-muted text-muted-foreground",
        className
      )}
    >
      <Kuvake className="size-4" />
    </span>
  );
}
