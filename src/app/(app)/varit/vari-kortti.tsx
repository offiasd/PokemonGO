import Link from "next/link";
import { Paintbrush } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaldoPalkki } from "@/components/saldo-palkki";
import { muotoileEuro, muotoileGrammat, varisavynNimi, VARISAVYN_VARIKOODI } from "@/lib/vakiot";
import type { Database } from "@/lib/supabase/database.types";

type VariRow = Database["public"]["Tables"]["varit"]["Row"];

// Kapealla kortilla (2 saraketta mobiilissa) otsikko + arvo eivät aina mahdu
// samalle riville. Card on flex-pystysarake, jonka lasten min-width on
// oletuksena auto - ilman min-w-0:aa lohko ei kutistu vaan piirtyy kortin
// reunan yli. flex-wrap + ml-auto siirtää arvon tarvittaessa omalle
// rivilleen oikeaan reunaan ylivuodon sijaan.
function TietoRivi({
  otsikko,
  arvo,
  pieni,
}: {
  otsikko: string;
  arvo: string;
  pieni?: boolean;
}) {
  return (
    <div
      className={
        pieni
          ? "flex min-w-0 flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground"
          : "flex min-w-0 flex-wrap items-center justify-between gap-x-2 text-sm"
      }
    >
      <span className={pieni ? "shrink-0" : "shrink-0 text-muted-foreground"}>{otsikko}</span>
      <span className={pieni ? "ml-auto shrink-0" : "ml-auto shrink-0 font-medium"}>{arvo}</span>
    </div>
  );
}

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
    <Link href={`/varit/${vari.id}`} className="block h-full">
      <Card
        className={`h-full overflow-hidden ${
          !vari.aktiivinen ? "opacity-60" : "transition-shadow hover:shadow-md"
        }`}
      >
        <CardHeader className="grid min-w-0 gap-3 px-4 sm:px-6">
          <p className="truncate text-xs text-muted-foreground sm:hidden">
            {vari.valmistaja ?? "Valmistaja tuntematon"}
          </p>
          <div className="flex min-w-0 items-start justify-between gap-2">
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
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="outline">{vari.alkupera}</Badge>
              {!vari.aktiivinen && <Badge variant="secondary">Poistettu</Badge>}
            </div>
          </div>
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-center gap-2 text-base">
              {vari.varisavy && (
                <span
                  className="inline-block size-3 shrink-0 rounded-full border"
                  style={{ backgroundColor: VARISAVYN_VARIKOODI[vari.varisavy] }}
                  title={varisavynNimi(vari.varisavy)}
                />
              )}
              <span className="min-w-0 break-words">{vari.nimi}</span>
            </CardTitle>
            <CardDescription className="hidden sm:block">
              {vari.valmistaja ?? "Valmistaja tuntematon"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="mt-auto grid min-w-0 gap-3 px-4 sm:px-6">
          <div className="grid min-w-0 gap-1">
            <TietoRivi otsikko="Saldo" arvo={muotoileGrammat(vari.saldo_g)} />
            <SaldoPalkki
              saldoG={vari.saldo_g}
              halytysrajaG={vari.halytysraja_g ?? oletusHalytysraja}
            />
            {vari.varattu_g > 0 && (
              <TietoRivi
                pieni
                otsikko="Varattu töihin"
                arvo={`${muotoileGrammat(vari.varattu_g)} (vapaana ${muotoileGrammat(
                  vari.saldo_g - vari.varattu_g
                )})`}
              />
            )}
          </div>
          {naytaHinnat && (
            <TietoRivi
              otsikko="Ostohinta"
              arvo={`${muotoileEuro(vari.ostohinta_per_kg)}/kg`}
            />
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
