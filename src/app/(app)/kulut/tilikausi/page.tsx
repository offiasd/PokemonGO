import Link from "next/link";
import { AlertTriangle, Download } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { KUUKAUDEN_NIMI, muotoileEuro, muotoileGrammat } from "@/lib/vakiot";
import { PIENHANKINNAN_RAJA_EUR, PIENHANKINTAKATTO_EUR } from "@/lib/kulut";
import { haeTilikaudenAineisto } from "@/lib/tilikausi-haku";

import { KulutValilehdet } from "../valilehdet";
import { TilannekuvanOtto } from "./tilannekuvan-otto";

function kilohinta(arvo: number): string {
  return `${arvo.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kg`;
}

export default async function TilikausiSivu({
  searchParams,
}: {
  searchParams: Promise<{ vuosi?: string }>;
}) {
  // Koko näkymä on taloustietoa: varastoarvo, katteet ja yksityisotot.
  await vaaditaanAdmin();
  const parametrit = await searchParams;
  const supabase = await createClient();

  const nyt = new Date();
  const oletusvuosi =
    // Tammikuussa katsotaan yleensä juuri päättynyttä tilikautta.
    nyt.getUTCMonth() === 0 ? nyt.getUTCFullYear() - 1 : nyt.getUTCFullYear();
  const vuosi = Number(parametrit.vuosi) || oletusvuosi;

  const aineisto = await haeTilikaudenAineisto(supabase, vuosi);
  const kuva = aineisto.tilannekuva;
  const nollasaldoisia = kuva?.rivit.filter((r) => r.saldo_g === 0).length ?? 0;

  return (
    <div className="grid gap-4">
      <KulutValilehdet />

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold">Tilikausi {vuosi}</h1>
              <p className="text-sm text-muted-foreground">
                Apuaineisto kirjanpitäjälle. Sovellus ei tee tilinpäätöstä eikä veroilmoitusta.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/kulut/tilikausi?vuosi=${vuosi - 1}`}>{vuosi - 1}</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/kulut/tilikausi?vuosi=${vuosi + 1}`}>{vuosi + 1}</Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/api/tilikausi?vuosi=${vuosi}&muodot=pdf,csv`}>
                <Download className="size-4" />
                Lataa kooste ja taulukot
              </a>
            </Button>
            <Button asChild variant="ghost">
              <a href={`/api/tilikausi?vuosi=${vuosi}&muodot=pdf`}>Vain PDF</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Varaston arvo */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">Varaston arvo 31.12.{vuosi}</CardTitle>
              <CardDescription>
                {kuva
                  ? `Tilannekuvasta ${new Date(kuva.otettu).toLocaleString("fi-FI")}${kuva.ottaja ? ` · ${kuva.ottaja}` : ""}`
                  : "Tilannekuvaa ei ole otettu."}
              </CardDescription>
            </div>
            <TilannekuvanOtto vuosi={vuosi} onJoOtettu={kuva !== null} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!kuva ? (
            <p className="flex items-start gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Varaston arvoa ei voi esittää jälkikäteen. Saldot muuttuvat heti seuraavasta
                työstä, ja kilohinta on liukuva keskihinta joka ei kerro mikä se oli joulukuussa.
                Elävää saldoa ei näytetä tässä tilalla - se olisi väärä luku väärältä päivältä.
              </span>
            </p>
          ) : (
            <>
              {kuva.muistiinpano && (
                <p className="text-sm text-muted-foreground">{kuva.muistiinpano}</p>
              )}
              {/* Viisi saraketta ja seitsemänkymmentä riviä: puhelimella
                  jokainen väri on oma korttinsa, sm-koosta ylöspäin taulukko. */}
              <div className="grid gap-2 sm:hidden">
                {kuva.rivit.map((rivi, jarjestys) => (
                  <div
                    key={`${rivi.vari_nimi}-${jarjestys}`}
                    className={cn(
                      "grid gap-1 rounded-md border p-3 text-sm",
                      rivi.saldo_g === 0 && "text-muted-foreground"
                    )}
                  >
                    <p className="font-medium wrap-anywhere">
                      {rivi.vari_nimi}
                      {rivi.valmistaja ? ` · ${rivi.valmistaja}` : ""}
                    </p>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-muted-foreground">Saldo</span>
                      <span className="tabular-nums">{muotoileGrammat(rivi.saldo_g)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-muted-foreground">Kilohinta</span>
                      <span className="tabular-nums">{kilohinta(rivi.hinta_per_kg)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-muted-foreground">Arvo</span>
                      <span className="font-medium tabular-nums">
                        {muotoileEuro(rivi.arvo_eur)}
                      </span>
                    </div>
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
                    {kuva.rivit.map((rivi, jarjestys) => (
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
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3">
                <span className="text-sm text-muted-foreground">
                  {kuva.vareja} väriä
                  {nollasaldoisia > 0 && ` · ${nollasaldoisia} ilman saldoa, arvo 0`}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {muotoileEuro(kuva.yhteensaEur)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pienhankinnat */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pienhankinnat {vuosi}</CardTitle>
          <CardDescription>
            Verottomista hinnoista, {muotoileEuro(PIENHANKINTAKATTO_EUR)} kattoa vasten. Sama
            laskenta kuin kuukausinäkymässä.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-semibold tabular-nums">
              {muotoileEuro(aineisto.pienhankinnat.kaytettyEur)}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              / {muotoileEuro(PIENHANKINTAKATTO_EUR)}
            </span>
          </div>
          <Progress value={aineisto.pienhankinnat.osuus * 100} />
        </CardContent>
      </Card>

      {/* Yli 1 200 euron hankinnat */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Yli {muotoileEuro(PIENHANKINNAN_RAJA_EUR)} hankinnat
          </CardTitle>
          <CardDescription>Eivät ole pienhankintoja vaan poistopohjaa.</CardDescription>
        </CardHeader>
        <CardContent>
          {aineisto.pienhankinnat.ylisuuret.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ei tällaisia hankintoja.</p>
          ) : (
            <div className="grid gap-2">
              {aineisto.pienhankinnat.ylisuuret.map((hankinta, jarjestys) => (
                <div
                  key={`${hankinta.teksti}-${jarjestys}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-2 text-sm first:border-t-0 first:pt-0"
                >
                  <span>
                    <span className="text-muted-foreground">
                      {hankinta.paivays
                        ? new Date(hankinta.paivays).toLocaleDateString("fi-FI")
                        : "-"}{" "}
                      · {hankinta.toimittaja ?? "Toimittaja puuttuu"} ·{" "}
                    </span>
                    {hankinta.teksti}
                  </span>
                  <span className="font-medium tabular-nums">
                    {muotoileEuro(hankinta.nettoEur)} (netto)
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kululuokat */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kulut kululuokittain</CardTitle>
          <CardDescription>Vain yrityksen kulut: yksityisotot eivät ole mukana.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {aineisto.kululuokittain.map((luokka) => (
            <div key={luokka.nimi} className="flex justify-between gap-2 text-sm">
              <span className={cn(luokka.eur === 0 && "text-muted-foreground")}>{luokka.nimi}</span>
              <span className="tabular-nums">{muotoileEuro(luokka.eur)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-2 border-t pt-2 font-medium">
            <span>Yhteensä</span>
            <span className="tabular-nums">{muotoileEuro(aineisto.kulutYhteensaEur)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Myynti */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Myynti kuukausittain</CardTitle>
          <CardDescription>Valmistuneet työt.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {aineisto.myyntiKuukausittain.length === 0 && (
            <p className="text-sm text-muted-foreground">Ei valmistuneita töitä.</p>
          )}
          {aineisto.myyntiKuukausittain.map((kuukausi) => (
            <div key={kuukausi.kuukausi} className="flex justify-between gap-2 text-sm">
              <span>
                {KUUKAUDEN_NIMI[kuukausi.kuukausi]}
                <span className="text-muted-foreground">
                  {" · "}
                  {kuukausi.toita} {kuukausi.toita === 1 ? "työ" : "työtä"} · keskihinta{" "}
                  {muotoileEuro(kuukausi.keskihintaEur)}
                </span>
              </span>
              <span className="tabular-nums">{muotoileEuro(kuukausi.myyntiEur)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-2 border-t pt-2 font-medium">
            <span>Yhteensä</span>
            <span className="tabular-nums">{muotoileEuro(aineisto.myyntiYhteensaEur)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Yksityisotot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yksityisotot</CardTitle>
          <CardDescription>Toiminimellä nämä kysytään aina, joten ne ovat omanaan.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {aineisto.yksityisotot.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ei yksityisottoja.</p>
          ) : (
            <>
              {aineisto.yksityisotot.map((otto, jarjestys) => (
                <div
                  key={`${otto.teksti}-${jarjestys}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                >
                  <span>
                    <span className="text-muted-foreground">
                      {otto.paivays ? new Date(otto.paivays).toLocaleDateString("fi-FI") : "-"} ·{" "}
                      {otto.toimittaja ?? "Toimittaja puuttuu"} ·{" "}
                    </span>
                    {otto.teksti}
                  </span>
                  <span className="tabular-nums">{muotoileEuro(otto.bruttoEur)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-t pt-2 font-medium">
                <span>Yhteensä</span>
                <span className="tabular-nums">
                  {muotoileEuro(aineisto.yksityisototYhteensaEur)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
