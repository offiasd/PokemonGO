import { muotoileEuro, muotoileProsentti } from "@/lib/vakiot";

/**
 * Alennusrivin selite.
 *
 * Alennus voi olla prosentti, kiinteä euromäärä tai molemmat. Selite kertoo
 * kumpi se oli: pelkkä euroluku rivin lopussa ei erottaisi kymmenen prosentin
 * alennusta kahdenkympin alennuksesta.
 */
export function alennuksenSelite(prosentti: number, summaEur: number): string {
  if (prosentti > 0 && summaEur > 0) {
    return `Alennus ${muotoileProsentti(prosentti)} + ${muotoileEuro(summaEur)}`;
  }
  if (prosentti > 0) return `Alennus ${muotoileProsentti(prosentti)}`;
  return "Alennus";
}

/**
 * Työn loppusumma. Alennusrivi näytetään vain kun alennus on annettu, jotta
 * tavallinen työ ei saa turhaa "Alennus 0 %" -riviä.
 */
export function Summat({
  tyo,
  summat,
}: {
  tyo: { alennus_prosentti: number; alennus_summa_eur: number };
  summat: { valisumma: number; alennusEur: number; loppusumma: number };
}) {
  const alennettu = tyo.alennus_prosentti > 0 || tyo.alennus_summa_eur > 0;
  return (
    <div className="grid gap-1 border-t pt-2 text-sm">
      {alennettu && (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Välisumma</span>
            <span>{muotoileEuro(summat.valisumma)}</span>
          </div>
          <div className="flex min-w-0 justify-between gap-4 text-muted-foreground">
            <span className="min-w-0 wrap-anywhere">
              {alennuksenSelite(tyo.alennus_prosentti, tyo.alennus_summa_eur)}
            </span>
            <span className="shrink-0">-{muotoileEuro(summat.alennusEur)}</span>
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
