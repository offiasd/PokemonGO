import { Euro, Palette, Scale } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { laskeVarinKokonaishinta, type VarinHintatiedot } from "@/lib/hinnat";
import { muotoileEuro, muotoileGrammat, muotoileKilot } from "@/lib/vakiot";
import type { Database } from "@/lib/supabase/database.types";

type AsetuksetRow = Database["public"]["Tables"]["asetukset"]["Row"];

/** Yhteenvetoon riittävät sarakkeet - hinnanlaskenta tarvitsee loput. */
export type VarastonVari = VarinHintatiedot & { saldo_g: number };

function Luku({
  otsikko,
  arvo,
  lisatieto,
  ikoni: Ikoni,
}: {
  otsikko: string;
  arvo: string;
  lisatieto: string;
  ikoni: typeof Euro;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Ikoni className="size-4" />
        {otsikko}
      </div>
      <p className="text-2xl font-bold">{arvo}</p>
      <p className="text-xs text-muted-foreground">{lisatieto}</p>
    </div>
  );
}

/**
 * Varaston yhteenveto: montako eri väriä, paljonko jauhetta ja mitä se on
 * maksanut. Arvo lasketaan värikohtaisesta kokonaishinnasta (ostohinta +
 * toimituskulu + tulli + maahantuonnin ALV), eli samasta luvusta jonka
 * värikortti ja värin oma sivu näyttävät.
 */
export function VarastoYhteenveto({
  varit,
  asetukset,
}: {
  varit: VarastonVari[];
  asetukset: AsetuksetRow;
}) {
  const paino = varit.reduce((summa, vari) => summa + vari.saldo_g, 0);
  const arvo = varit.reduce(
    (summa, vari) => summa + laskeVarinKokonaishinta(vari, asetukset) * (vari.saldo_g / 1000),
    0
  );
  const varastossa = varit.filter((vari) => vari.saldo_g > 0).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Varasto</CardTitle>
        <CardDescription>
          Mukana vain aktiiviset värit - poistetut jäävät pois, vaikka niillä olisi saldoa.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        <Luku
          ikoni={Palette}
          otsikko="Erilaisia värejä"
          arvo={String(varit.length)}
          lisatieto={`${varastossa} varastossa`}
        />
        <Luku
          ikoni={Scale}
          otsikko="Yhteispaino"
          arvo={muotoileKilot(paino)}
          lisatieto={muotoileGrammat(paino)}
        />
        <Luku
          ikoni={Euro}
          otsikko="Varaston arvo"
          arvo={muotoileEuro(arvo)}
          lisatieto="Sis. toimituskulun, tullin ja ALV:n"
        />
      </CardContent>
    </Card>
  );
}
