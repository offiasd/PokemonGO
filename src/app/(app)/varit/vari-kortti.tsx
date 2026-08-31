import Link from "next/link";
import { Paintbrush } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaldoPalkki } from "@/components/saldo-palkki";
import { muotoileEuro, muotoileGrammat, varisavynNimi, VARISAVYN_VARIKOODI } from "@/lib/vakiot";
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
        <CardHeader className="grid gap-3">
          <p className="truncate text-xs text-muted-foreground sm:hidden">
            {vari.valmistaja ?? "Valmistaja tuntematon"}
          </p>
          <div className="flex items-start justify-between gap-2">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {vari.kuva_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={vari.kuva_url}
                  alt={vari.nimi}
                  className="size-full object-cover"
                />
              ) : (
                <Paintbrush className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline">{vari.alkupera}</Badge>
              {!vari.aktiivinen && <Badge variant="secondary">Poistettu</Badge>}
            </div>
          </div>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {vari.varisavy && (
                <span
                  className="inline-block size-3 shrink-0 rounded-full border"
                  style={{ backgroundColor: VARISAVYN_VARIKOODI[vari.varisavy] }}
                  title={varisavynNimi(vari.varisavy)}
                />
              )}
              {vari.nimi}
            </CardTitle>
            <CardDescription className="hidden sm:block">
              {vari.valmistaja ?? "Valmistaja tuntematon"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Saldo</span>
              <span className="font-medium">{muotoileGrammat(vari.saldo_g)}</span>
            </div>
            <SaldoPalkki
              saldoG={vari.saldo_g}
              halytysrajaG={vari.halytysraja_g ?? oletusHalytysraja}
            />
            {vari.varattu_g > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Varattu keskeneräisiin töihin</span>
                <span className="text-right">
                  {muotoileGrammat(vari.varattu_g)} (käytettävissä{" "}
                  {muotoileGrammat(vari.saldo_g - vari.varattu_g)})
                </span>
              </div>
            )}
          </div>
          {naytaHinnat && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Ostohinta</span>
              <span className="font-medium">{muotoileEuro(vari.ostohinta_per_kg)}/kg</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
