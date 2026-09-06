import Link from "next/link";
import { ExternalLink, Paintbrush } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaldoMerkinta, SaldoPalkki } from "@/components/saldo-palkki";
import { laskeSaldoTila } from "@/lib/saldo";
import { muotoileEuro, muotoileGrammat, varisavynNimi, VARISAVYN_VARIKOODI } from "@/lib/vakiot";
import type { Database } from "@/lib/supabase/database.types";

type VariRow = Database["public"]["Tables"]["varit"]["Row"];

// Nimi mahtuu harvoin yhdelle riville kaikilla korttileveyksillä, joten
// fonttikoko lasketaan nimen pituudesta suhteessa kortin leveyteen (cqi =
// sisältöalueen leveys, ks. @container/kortti alempana). Geist Sansin
// keskimääräinen merkkileveys on noin 0,59em, eli N merkkiä mahtuu leveyteen W
// kun fonttikoko on ~W * 1,7 / N. Ala- ja yläraja pitävät tuloksen luettavana:
// kapeimmilla korteilla pisin nimi rivittyy silti, mikä on parempi kuin
// katkaisu - tietoa ei katoa.
const MERKKIKERROIN = 1.7;
const PIENIN_NIMI = "0.6875rem";
const SUURIN_NIMI = "1.125rem";
// Värisävyn pallukka (size-3) + sen jälkeinen väli (gap-2) vievät nimeltä tilaa.
const SAVYN_TILA = "1.25rem";

function nimenFonttikoko(nimi: string, onSavy: boolean): string {
  const merkit = Math.max(nimi.length, 1);
  const kaytettavissa = onSavy ? `(100cqi - ${SAVYN_TILA})` : "100cqi";
  return `clamp(${PIENIN_NIMI}, calc(${kaytettavissa} * ${MERKKIKERROIN} / ${merkit}), ${SUURIN_NIMI})`;
}

// Myyjän linkki on käsin syötetty kenttä, joten protokolla tarkistetaan ennen
// kuin se päätyy href-attribuuttiin: esim. javascript:-osoite suoritettaisiin
// klikkauksella. Lomakkeen type="url" ei estä sitä.
function turvallinenLinkki(linkki: string | null): string | null {
  if (!linkki) return null;
  try {
    const osoite = new URL(linkki);
    return osoite.protocol === "https:" || osoite.protocol === "http:" ? osoite.href : null;
  } catch {
    return null;
  }
}

export function VariKortti({
  vari,
  oletusHalytysraja,
  oletusTaysiraja,
  naytaHinnat,
  kokonaishinta,
}: {
  vari: VariRow;
  oletusHalytysraja: number;
  oletusTaysiraja: number;
  naytaHinnat: boolean;
  /** Ostohinta + toimituskulu + tulli + ALV (asetusten arvoilla). */
  kokonaishinta: number;
}) {
  const tilauslinkki = turvallinenLinkki(vari.myyja_linkki);
  const rajat = {
    saldoG: vari.saldo_g,
    varattuG: vari.varattu_g,
    halytysrajaG: vari.halytysraja_g,
    taysirajaG: vari.taysiraja_g,
    oletusHalytysG: oletusHalytysraja,
    oletusTaysiG: oletusTaysiraja,
  };
  // Merkintä ja palkki lukevat saman funktion, jottei kortissa voi näkyä
  // keltainen palkki vihreällä merkinnällä.
  const { tila, teksti } = laskeSaldoTila(rajat);

  return (
    <Card
      className={`h-full gap-3 overflow-hidden py-4 ${
        !vari.aktiivinen ? "opacity-60" : "transition-shadow hover:shadow-md"
      }`}
    >
      {/* Kortin oma linkki kattaa kaiken tilausnappia lukuun ottamatta: nappi
          on Linkin sisarus, koska <a> ei saa olla toisen <a>:n sisällä. */}
      <Link href={`/varit/${vari.id}`} className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Valmistaja yläreunassa keskellä. */}
        <CardHeader className="gap-0 px-4 sm:px-6">
          <p className="truncate text-center text-xs text-muted-foreground">
            {vari.valmistaja ?? "Valmistaja tuntematon"}
          </p>
        </CardHeader>

        {/* Tuotekuva isona keskellä. Alkuperä ja tilamerkki ovat kuvan päällä
            oikeassa yläkulmassa: omalla rivillään ne veisivät leveyttä joko
            kuvalta tai keskitetyltä valmistajalta, ja kapealla kortilla
            (2 saraketta mobiilissa) kumpikaan ei siedä sitä. */}
        <div className="relative mx-4 aspect-square shrink-0 overflow-hidden rounded-md border bg-muted sm:mx-6">
          {vari.kuva_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vari.kuva_url} alt={vari.nimi} className="size-full object-contain" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Paintbrush className="size-8 text-muted-foreground" />
            </div>
          )}
          <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
            {/* Läpinäkyvä outline-badge katoaisi kuvan päällä. */}
            <Badge variant="outline" className="bg-background/85 backdrop-blur-sm">
              {vari.alkupera}
            </Badge>
            {!vari.aktiivinen && <Badge variant="secondary">Poistettu</Badge>}
          </div>
        </div>

        {/* Nimi, hinta ja varastosaldo vasemmassa alareunassa, heti kuvan alla.
            auto-rows-fr venyttää rivin korkeimman kortin mittaan; ylimääräinen
            tila jää tämän lohkon alapuolelle napin yläpuolelle, koska aukko
            kuvan ja nimen välissä hajottaisi ne erillisiksi palasiksi. */}
        <CardContent className="@container/kortti grid min-w-0 gap-2 px-4 sm:px-6">
          <CardTitle className="flex min-w-0 items-center gap-2 leading-tight">
            {vari.varisavy && (
              <span
                className="inline-block size-3 shrink-0 rounded-full border"
                style={{ backgroundColor: VARISAVYN_VARIKOODI[vari.varisavy] }}
                title={varisavynNimi(vari.varisavy)}
              />
            )}
            <span
              className="min-w-0 break-words"
              style={{ fontSize: nimenFonttikoko(vari.nimi, Boolean(vari.varisavy)) }}
            >
              {vari.nimi}
            </span>
          </CardTitle>

          {naytaHinnat && (
            <p className="min-w-0 text-sm">
              <span className="text-muted-foreground">Hinta</span>{" "}
              <span className="font-medium">{muotoileEuro(kokonaishinta)}/kg</span>
            </p>
          )}

          <div className="grid min-w-0 gap-1">
            {/* Merkintä mahtuu saldorivin oikeaan reunaan. Kapeimmalla
                kortilla (2 saraketta 320 px:n näytöllä) se ei mahdu, jolloin se
                kiertyy omalle rivilleen - saldoluvun katkaisu olisi pahempi,
                koska juuri se luku kortista luetaan. */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
              <p className="min-w-0 text-sm">
                <span className="text-muted-foreground">Saldo</span>{" "}
                <span className="font-medium">{muotoileGrammat(vari.saldo_g)}</span>
              </p>
              <SaldoMerkinta tila={tila} teksti={teksti} />
            </div>
            <SaldoPalkki {...rajat} />
            {vari.varattu_g > 0 && (
              <p className="min-w-0 text-xs text-muted-foreground">
                Varattu töihin {muotoileGrammat(vari.varattu_g)} (vapaana{" "}
                {muotoileGrammat(vari.saldo_g - vari.varattu_g)})
              </p>
            )}
          </div>
        </CardContent>
      </Link>

      {/* Tilausnappi kortin pohjalla. Ilman linkkiä nappi jää näkyviin
          poiskytkettynä, jotta korttien alareunat pysyvät samalla viivalla ja
          puuttuva linkki huomataan. */}
      <div className="mt-auto px-4 sm:px-6">
        {tilauslinkki ? (
          <Button asChild variant="outline" size="sm" className="w-full">
            <a href={tilauslinkki} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Tilaa
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full" disabled>
            Ei tilauslinkkiä
          </Button>
        )}
      </div>
    </Card>
  );
}
