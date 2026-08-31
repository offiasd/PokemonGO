import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaldoPalkki } from "@/components/saldo-palkki";
import { muotoileEuro, muotoileGrammat } from "@/lib/vakiot";
import type { Database } from "@/lib/supabase/database.types";

type VariRow = Database["public"]["Tables"]["varit"]["Row"];

export function VariKortti({
  vari,
  oletusHalytysraja,
  naytaHinnat,
}: {
  vari: VariRow;
  oletusHalytysraja: number;
  naytaHinnat: boolean;
}) {
  return (
    <Link href={`/varit/${vari.id}`}>
      <Card className={!vari.aktiivinen ? "opacity-60" : "transition-shadow hover:shadow-md"}>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{vari.nimi}</CardTitle>
              <CardDescription>{vari.valmistaja ?? "Valmistaja tuntematon"}</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline">{vari.alkupera}</Badge>
              {!vari.aktiivinen && <Badge variant="secondary">Poistettu</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Saldo</span>
              <span className="font-medium">{muotoileGrammat(vari.saldo_g)}</span>
            </div>
            <SaldoPalkki
              saldoG={vari.saldo_g}
              halytysrajaG={vari.halytysraja_g ?? oletusHalytysraja}
            />
          </div>
          {naytaHinnat && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ostohinta</span>
              <span className="font-medium">{muotoileEuro(vari.ostohinta_per_kg)}/kg</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
