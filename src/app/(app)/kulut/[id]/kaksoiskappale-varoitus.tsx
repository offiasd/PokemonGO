import Link from "next/link";
import { AlertTriangle, Copy } from "lucide-react";

import { kaksoiskappaleenViesti, type Kaksoiskappaleenvarmuus } from "@/lib/kulut";
import { muotoileEuro } from "@/lib/vakiot";
import { cn } from "@/lib/utils";

export interface Epailty {
  id: string;
  toimittaja: string | null;
  paivays: string;
  loppusummaEur: number;
  tositenumero: string | null;
  varmuus: Kaksoiskappaleenvarmuus;
}

function Rivi({
  otsikko,
  toimittaja,
  paivays,
  loppusummaEur,
  tositenumero,
  linkki,
}: {
  otsikko: string;
  toimittaja: string | null;
  paivays: string;
  loppusummaEur: number;
  tositenumero: string | null;
  linkki?: string;
}) {
  const sisalto = (
    <>
      <span className="text-xs text-muted-foreground">{otsikko}</span>
      <span className="truncate font-medium">{toimittaja ?? "Toimittaja puuttuu"}</span>
      <span className="text-sm text-muted-foreground">
        {new Date(paivays).toLocaleDateString("fi-FI")} &middot; {muotoileEuro(loppusummaEur)}
      </span>
      <span className="text-sm text-muted-foreground">
        {tositenumero ? `Tosite ${tositenumero}` : "Tositenumero puuttuu"}
      </span>
    </>
  );

  if (!linkki) {
    return <div className="grid min-w-0 gap-0.5 rounded-md border bg-card p-3">{sisalto}</div>;
  }
  return (
    <Link
      href={linkki}
      className="grid min-w-0 gap-0.5 rounded-md border bg-card p-3 transition-colors hover:bg-accent/50"
    >
      {sisalto}
    </Link>
  );
}

/**
 * Kaksoiskappale-epäily kuitin sivulla.
 *
 * Epäily näytetään, ei estetä: kaksi aitoa käyntiä samana päivänä on todellinen
 * tilanne, ja käyttäjä tietää sen paremmin kuin järjestelmä. Molemmat kuitit
 * näytetään rinnakkain tositenumeroineen, jolloin ero näkyy heti eikä
 * kumpaakaan tarvitse avata erikseen.
 *
 * Sanamuoto seuraa varmuustasoa: sama tositenumero on varma osuma, pelkkä sama
 * päivä ja summa vain samankaltaisuus.
 */
export function KaksoiskappaleVaroitus({
  kuitti,
  epaillyt,
}: {
  kuitti: {
    toimittaja: string | null;
    paivays: string;
    loppusummaEur: number;
    tositenumero: string | null;
  };
  epaillyt: Epailty[];
}) {
  if (epaillyt.length === 0) return null;

  // Vahvin epäily ratkaisee sävyn: sama numero on varma, muut arvioita.
  const vahvin = epaillyt[0].varmuus;
  const varma = vahvin === "sama_numero";
  const Ikoni = varma ? Copy : AlertTriangle;

  return (
    <div
      className={cn(
        "grid gap-3 rounded-lg border p-4",
        varma ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Ikoni className={cn("size-4 shrink-0", varma ? "text-destructive" : "text-warning")} />
        {kaksoiskappaleenViesti(vahvin)}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Rivi
          otsikko="Tämä kuitti"
          toimittaja={kuitti.toimittaja}
          paivays={kuitti.paivays}
          loppusummaEur={kuitti.loppusummaEur}
          tositenumero={kuitti.tositenumero}
        />
        {epaillyt.map((epailty) => (
          <Rivi
            key={epailty.id}
            otsikko={
              epailty.varmuus === "sama_numero"
                ? "Sama tositenumero"
                : epailty.varmuus === "samankaltainen"
                  ? "Sama päivä ja summa"
                  : "Sama päivä ja summa, eri numero"
            }
            toimittaja={epailty.toimittaja}
            paivays={epailty.paivays}
            loppusummaEur={epailty.loppusummaEur}
            tositenumero={epailty.tositenumero}
            linkki={`/kulut/${epailty.id}`}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Tämä on huomautus, ei este: tallennus onnistuu normaalisti. Jos kyseessä on sama tosite
        kahdesti, poista tarpeeton kuitti.
      </p>
    </div>
  );
}
