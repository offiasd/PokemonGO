import { cn } from "@/lib/utils";
import { SALDO_TILAT, saldonTila } from "@/lib/vakiot";

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

  // Kynnykset ovat vakiot.ts:n saldonTila-funktiossa, jotta Värit-sivun
  // saldosuodatin ja tämä palkki eivät voi ajautua eri linjoille.
  const tila = saldonTila(saldoG, halytysrajaG);
  const vari = SALDO_TILAT.find((t) => t.arvo === tila)!.luokka;

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
