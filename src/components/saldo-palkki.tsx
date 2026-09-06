import { cn } from "@/lib/utils";
import { laskeSaldoTila, type SaldoRajat, type SaldoTila } from "@/lib/saldo";

/**
 * Varastosaldo palkkina.
 *
 * Täytetty osa on vapaa saldo, sen jatkeena vaaleampi osa jo varatuille
 * grammoille. Pystyviiva on hälytysrajan kohdalla: se kertoo silmäyksellä
 * kuinka lähellä tilaustarvetta ollaan. Aiemmin viiva oli aina puolivälissä
 * eikä siis kertonut värikohtaista tietoa.
 */
export function SaldoPalkki({ className, ...rajat }: SaldoRajat & { className?: string }) {
  const { vari, vapaaG, halytysG, taysiG, rajatKelvolliset } = laskeSaldoTila(rajat);

  // Ristiriitaiset rajat (täysiraja hälytysrajan alla) antaisivat negatiivisen
  // asteikon, jolloin palkki näyttäisi mitä sattuu. Harmaa palkki kertoo että
  // luvut pitää korjata, eikä sivu kaadu.
  if (!rajatKelvolliset) {
    return (
      <div
        className={cn("h-2.5 w-full rounded-full bg-muted", className)}
        title="Täysiraja on hälytysrajan alapuolella - tarkista rajat"
      />
    );
  }

  const varattuG = rajat.varattuG ?? 0;
  const leveys = (g: number) => `${Math.min(100, (g / taysiG) * 100)}%`;

  return (
    <div className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full transition-[width,background-color] duration-300 motion-reduce:transition-none"
        style={{ width: leveys(vapaaG), background: vari }}
      />
      {varattuG > 0 && (
        <div
          className="absolute top-0 h-full opacity-35"
          style={{ left: leveys(vapaaG), width: leveys(varattuG), background: vari }}
        />
      )}
      <div
        className="absolute inset-y-0 w-[1.5px] bg-background"
        style={{ left: leveys(halytysG) }}
        title="Hälytysraja"
      />
    </div>
  );
}

const MERKINNAN_TYYLI: Record<SaldoTila, string> = {
  loppu: "bg-tila-punainen-pinta text-tila-punainen-teksti",
  vahissa: "bg-tila-punainen-pinta text-tila-punainen-teksti",
  "tilaa-pian": "bg-tila-keltainen-pinta text-tila-keltainen-teksti",
  riittaa: "bg-tila-vihrea-pinta text-tila-vihrea-teksti",
};

/** Saldon tila sanana palkin rinnalle: väri yksin ei kerro mitä pitäisi tehdä. */
export function SaldoMerkinta({ tila, teksti }: { tila: SaldoTila; teksti: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] whitespace-nowrap",
        MERKINNAN_TYYLI[tila]
      )}
    >
      {teksti}
    </span>
  );
}
