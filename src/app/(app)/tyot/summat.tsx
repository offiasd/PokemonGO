import { muotoileEuro, muotoileProsentti } from "@/lib/vakiot";

/**
 * Työn loppusumma. Alennusrivi näytetään vain kun alennus on annettu, jotta
 * tavallinen työ ei saa turhaa "Alennus 0 %" -riviä.
 */
export function Summat({
  tyo,
  summat,
}: {
  tyo: { alennus_prosentti: number };
  summat: { valisumma: number; alennusEur: number; loppusumma: number };
}) {
  return (
    <div className="grid gap-1 border-t pt-2 text-sm">
      {tyo.alennus_prosentti > 0 && (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Välisumma</span>
            <span>{muotoileEuro(summat.valisumma)}</span>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Alennus {muotoileProsentti(tyo.alennus_prosentti)}</span>
            <span>-{muotoileEuro(summat.alennusEur)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between gap-4 font-medium">
        <span>Yhteensä</span>
        <span>{muotoileEuro(summat.loppusumma)}</span>
      </div>
    </div>
  );
}
