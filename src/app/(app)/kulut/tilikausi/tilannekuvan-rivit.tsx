"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { muotoileEuro, muotoileGrammat } from "@/lib/vakiot";
import type { TilannekuvanRivi } from "@/lib/tilikausi";

/** Kilohinta neljällä desimaalilla, kuten muuallakin varastossa. */
function kilohinta(arvo: number): string {
  return `${arvo.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kg`;
}

/**
 * Tilannekuvan rivit.
 *
 * Seitsemänkymmentä väriä on pitkä lista, ja tilikausinäkymässä sen alle jää
 * kaikki muu - pienhankinnat, poistolaskelma, myynti. Lista on siksi napin
 * takana ja yhteenveto aina näkyvissä.
 *
 * Tiivistäminen ei saa muuttaa tietoja: jokainen rivi näyttää edelleen nimen,
 * valmistajan, saldon, kilohinnan ja arvon. Puhelimella ne ovat kahdella
 * rivillä neljän sijaan - nimi ja arvo ovat ne kaksi lukua joita listasta
 * haetaan, loput kulkevat niiden alla. Vienti ja kooste lukevat saman
 * aineiston eivätkä muutu tästä lainkaan.
 */
export function TilannekuvanRivit({
  rivit,
  vareja,
  nollasaldoisia,
  yhteensaEur,
}: {
  rivit: TilannekuvanRivi[];
  vareja: number;
  nollasaldoisia: number;
  yhteensaEur: number;
}) {
  const [auki, setAuki] = useState(false);

  return (
    <div className="grid gap-3">
      {/* Ei yläviivaa: yhteenveto on nyt listan yläpuolella, ja viiva jäisi
          roikkumaan kortin alkuun ilman mitään erotettavaa. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-muted-foreground">
          {vareja} väriä
          {nollasaldoisia > 0 && ` · ${nollasaldoisia} ilman saldoa, arvo 0`}
        </span>
        <span className="text-lg font-semibold tabular-nums">{muotoileEuro(yhteensaEur)}</span>
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={auki}
          onClick={() => setAuki((edellinen) => !edellinen)}
        >
          {auki ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {auki ? "Piilota värit" : `Näytä värit (${vareja})`}
        </Button>
      </div>

      {auki && (
        <>
          {/* Puhelimella kaksi riviä väriä kohti: nimi ja arvo ylös, muut
              tiedot niiden alle. sm-koosta ylöspäin taulukko kuten ennen. */}
          <div className="grid border-t pt-1 sm:hidden">
            {rivit.map((rivi, jarjestys) => (
              <div
                key={`${rivi.vari_nimi}-${jarjestys}`}
                className={cn(
                  "grid gap-0.5 border-t py-2 text-sm first:border-t-0",
                  rivi.saldo_g === 0 && "text-muted-foreground"
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-medium wrap-anywhere">{rivi.vari_nimi}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {muotoileEuro(rivi.arvo_eur)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {rivi.valmistaja ? `${rivi.valmistaja} · ` : ""}
                  {muotoileGrammat(rivi.saldo_g)} · {kilohinta(rivi.hinta_per_kg)}
                </p>
              </div>
            ))}
          </div>

          <div className="hidden sm:block sm:overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Väri</TableHead>
                  <TableHead>Valmistaja</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Kilohinta</TableHead>
                  <TableHead className="text-right">Arvo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rivit.map((rivi, jarjestys) => (
                  <TableRow
                    key={`${rivi.vari_nimi}-${jarjestys}`}
                    className={cn(rivi.saldo_g === 0 && "text-muted-foreground")}
                  >
                    <TableCell className="font-medium">{rivi.vari_nimi}</TableCell>
                    <TableCell>{rivi.valmistaja ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {muotoileGrammat(rivi.saldo_g)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {kilohinta(rivi.hinta_per_kg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {muotoileEuro(rivi.arvo_eur)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
