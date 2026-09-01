import { cn } from "@/lib/utils";

interface SaldoPalkkiProps {
  saldoG: number;
  halytysrajaG: number;
  /** Skaalan yläraja - oletuksena 4x hälytysraja, jotta "täysi" palkki näyttää järkevältä. */
  maksimiG?: number;
  className?: string;
}

/**
 * Visuaalinen saldopalkki: vihreä (täysi) -> keltainen -> punainen (hälytysrajan alla).
 * Väri lasketaan suhteessa hälytysrajaan, ei absoluuttiseen maksimiin, koska väreillä
 * on eri pakkauskoot.
 */
export function SaldoPalkki({ saldoG, halytysrajaG, maksimiG, className }: SaldoPalkkiProps) {
  const yläraja = maksimiG ?? Math.max(halytysrajaG * 4, halytysrajaG + 1);
  const prosentti = Math.max(0, Math.min(100, (saldoG / yläraja) * 100));
  const halytysrajaProsentti = Math.max(0, Math.min(100, (halytysrajaG / yläraja) * 100));

  const suhde = halytysrajaG > 0 ? saldoG / halytysrajaG : saldoG > 0 ? 2 : 0;
  const vari =
    suhde <= 1 ? "bg-destructive" : suhde <= 1.5 ? "bg-warning" : "bg-success";

  return (
    <div className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all", vari)}
        style={{ width: `${prosentti}%` }}
      />
      <div
        className="absolute top-0 h-full w-px bg-foreground/40"
        style={{ left: `${halytysrajaProsentti}%` }}
        title="Hälytysraja"
      />
    </div>
  );
}
