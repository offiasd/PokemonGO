import { Fuel, Hammer, Package, Receipt, ShoppingCart, SprayCan, Store } from "lucide-react";

import { toimittajanIkoni, type ToimittajanIkoni } from "@/lib/kulut";
import { cn } from "@/lib/utils";

const KUVAKKEET = {
  polttoaine: Fuel,
  rautakauppa: Hammer,
  maali: SprayCan,
  posti: Package,
  kauppa: ShoppingCart,
  verkkokauppa: Store,
  kuitti: Receipt,
} satisfies Record<ToimittajanIkoni, typeof Receipt>;

/**
 * Toimittajan tunnusikoni kuittilistalla.
 *
 * Puutteellinen kuitti saa lämpimän taustan: se erottuu listalta ilman että
 * riviä pitää lukea, ja juuri ne kuitit estävät kuukauden luovutuksen.
 */
export function ToimittajanKuvake({
  toimittaja,
  puutteellinen = false,
  className,
}: {
  toimittaja: string | null;
  puutteellinen?: boolean;
  className?: string;
}) {
  const Kuvake = KUVAKKEET[toimittajanIkoni(toimittaja)];
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md",
        puutteellinen ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
        className
      )}
    >
      <Kuvake className="size-4" />
    </span>
  );
}
