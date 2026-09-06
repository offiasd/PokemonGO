"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { KUUKAUDEN_LYHENNE, KUUKAUDEN_NIMI, muotoileEuro, muotoileKilot } from "@/lib/vakiot";
import {
  katteenSuunta,
  muotoileKateEtumerkilla,
  onTyhja,
  oletusKuukausi,
  suurinArvo,
  tyomaaranTeksti,
  type KatteenSuunta,
  type TalousKuukausi,
} from "@/lib/talous";

type Nakyma = "euroa" | "tyot";

const SUUNNAN_TYYLI: Record<KatteenSuunta, { ikoni: typeof TrendingUp; pinta: string; teksti: string }> = {
  plus: {
    ikoni: TrendingUp,
    pinta: "bg-talous-tulo-pinta text-talous-tulo",
    teksti: "text-talous-tulo",
  },
  miinus: {
    ikoni: TrendingDown,
    pinta: "bg-talous-meno-pinta text-talous-meno",
    teksti: "text-talous-meno",
  },
  tyhja: {
    ikoni: Minus,
    pinta: "bg-talous-neutraali text-muted-foreground",
    teksti: "text-muted-foreground",
  },
};

/** Vaakapalkki kuukauden summalle. Nolla jää ohueksi tyngäksi. */
function Summapalkki({
  otsikko,
  arvo,
  suurin,
  vari,
}: {
  otsikko: string;
  arvo: number;
  suurin: number;
  vari: string;
}) {
  const osuus = suurin > 0 ? (arvo / suurin) * 100 : 0;
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-3">
      <span className="truncate text-xs text-muted-foreground">{otsikko}</span>
      <div className="h-2 rounded-full bg-talous-neutraali">
        <div
          className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${Math.max(osuus, arvo > 0 ? 2 : 0)}%`, background: vari }}
        />
      </div>
      <span className="text-sm font-medium tabular-nums">{muotoileEuro(arvo)}</span>
    </div>
  );
}

/**
 * Etusivun talouskortti: kuukauden luvut ja koko vuoden pylväsrivi samassa.
 *
 * Kuukausivalinta on paikallista tilaa eikä osoiteparametri, koska kaikkien 12
 * kuukauden luvut ovat jo tässä: painallus ei tarvitse käyntiä palvelimella.
 * Vuosi sen sijaan on osoitteessa, jotta linkin voi jakaa - vuoden vaihto
 * palauttaa kuukausivalinnan oletukseen, mikä on tarkoituskin.
 *
 * Pylväät ovat divejä eivätkä kaaviokirjastoa: kaksitoista suhteellista
 * korkeutta ei tarvitse kirjastoa.
 */
export function TalousKortti({
  vuosi,
  kuukaudet,
  nykyinenVuosi,
  nykyinenKuukausi,
  pieninVuosi,
}: {
  vuosi: number;
  kuukaudet: TalousKuukausi[];
  nykyinenVuosi: number;
  /** 0 = tammikuu. */
  nykyinenKuukausi: number;
  pieninVuosi: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [valittu, setValittu] = useState(() =>
    oletusKuukausi(vuosi, nykyinenVuosi, nykyinenKuukausi, kuukaudet)
  );
  // Vuosi vaihtuu osoitteesta, jolloin komponentti saa uudet propsit mutta
  // säilyttää tilansa. Kuukausivalinta palautetaan oletukseen renderin aikana
  // (Reactin oma tapa sovittaa tila propseihin), jolloin näkymävalinta säilyy -
  // avaimella remountattaessa sekin nollautuisi.
  const [tilanVuosi, setTilanVuosi] = useState(vuosi);
  if (vuosi !== tilanVuosi) {
    setTilanVuosi(vuosi);
    setValittu(oletusKuukausi(vuosi, nykyinenVuosi, nykyinenKuukausi, kuukaudet));
  }
  // Näkymän vaihto ei nollaa kuukausivalintaa: jos heinäkuu on valittuna ja
  // käyttäjä siirtyy Työt-näkymään, heinäkuu pysyy valittuna.
  const [nakyma, setNakyma] = useState<Nakyma>("euroa");

  const kuukausi = kuukaudet[valittu] ?? kuukaudet[0];
  const suunta = katteenSuunta(kuukausi);
  const { ikoni: Ikoni, pinta, teksti } = SUUNNAN_TYYLI[suunta];
  const suurin = suurinArvo(kuukaudet, nakyma);
  const kuukaudenSuurin = Math.max(kuukausi.laskutettuEur, kuukausi.maalikustannusEur);

  const vuodenOsoite = (uusiVuosi: number) => {
    const parametrit = new URLSearchParams(searchParams);
    if (uusiVuosi === nykyinenVuosi) parametrit.delete("vuosi");
    else parametrit.set("vuosi", String(uusiVuosi));
    const kysely = parametrit.toString();
    return kysely ? `${pathname}?${kysely}` : pathname;
  };

  const nuoli =
    "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Laskutus ja kulutus</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-5">
        {/* Valitun kuukauden yhteenveto: kuukausipainikkeiden paneeli. */}
        <div id="talous-kuukausi" role="tabpanel" className="flex items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", pinta)}>
            <Ikoni className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {KUUKAUDEN_NIMI[kuukausi.kuukausi]} {vuosi}
            </p>
            <p className={cn("text-2xl font-semibold tabular-nums", teksti)}>
              {muotoileKateEtumerkilla(kuukausi)}
            </p>
            <p className="text-sm text-muted-foreground">
              {tyomaaranTeksti(kuukausi.tyot)}
              {kuukausi.kulutusKg > 0 && ` · ${muotoileKilot(kuukausi.kulutusKg * 1000)} maalia`}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Summapalkki
            otsikko="Laskutettu"
            arvo={kuukausi.laskutettuEur}
            suurin={kuukaudenSuurin}
            vari="var(--talous-tulo)"
          />
          <Summapalkki
            otsikko="Maali"
            arvo={kuukausi.maalikustannusEur}
            suurin={kuukaudenSuurin}
            vari="var(--talous-meno)"
          />
        </div>

        <hr className="border-border" />

        {/* Vuosi ja näkymän valinta. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link
              href={vuodenOsoite(vuosi - 1)}
              aria-label={`Vuosi ${vuosi - 1}`}
              aria-disabled={vuosi <= pieninVuosi || undefined}
              className={cn(nuoli, vuosi <= pieninVuosi && "pointer-events-none opacity-40")}
            >
              <ChevronLeft className="size-4" />
            </Link>
            <span className="text-sm font-semibold tabular-nums">Vuosi {vuosi}</span>
            <Link
              href={vuodenOsoite(vuosi + 1)}
              aria-label={`Vuosi ${vuosi + 1}`}
              aria-disabled={vuosi >= nykyinenVuosi || undefined}
              className={cn(nuoli, vuosi >= nykyinenVuosi && "pointer-events-none opacity-40")}
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>

          <div className="flex gap-1">
            {(
              [
                ["euroa", "Laskutus"],
                ["tyot", "Työt"],
              ] as const
            ).map(([arvo, nimi]) => (
              <button
                key={arvo}
                type="button"
                onClick={() => setNakyma(arvo)}
                aria-pressed={nakyma === arvo}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  nakyma === arvo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {nimi}
              </button>
            ))}
          </div>
        </div>

        {/* Kuukausipylväät. Koko sarake otsikkoa myöten on painike: kaksitoista
            kuukautta puhelimen leveydellä on noin 29 px leveä osumapinta, joten
            korkeus on ainoa tapa saada siitä käyttökelpoinen. */}
        <div role="tablist" aria-label="Kuukausi" className="grid grid-cols-12 gap-x-0.5 sm:gap-x-1">
          {kuukaudet.map((k) => {
            const onValittu = k.kuukausi === valittu;
            const tyhja = nakyma === "euroa" ? onTyhja(k) : k.tyot === 0;
            const korkeus = (arvo: number) =>
              suurin > 0 && arvo > 0 ? `${Math.max((arvo / suurin) * 100, 4)}%` : "2px";

            return (
              <button
                key={k.kuukausi}
                type="button"
                role="tab"
                aria-selected={onValittu}
                aria-controls="talous-kuukausi"
                aria-label={`${KUUKAUDEN_NIMI[k.kuukausi]} ${vuosi}`}
                onClick={() => setValittu(k.kuukausi)}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-md py-1 transition-colors",
                  onValittu ? "bg-talous-neutraali" : "hover:bg-accent/60"
                )}
              >
                <span className="text-[0.5625rem] leading-none text-muted-foreground tabular-nums">
                  {nakyma === "tyot" && k.tyot > 0 ? k.tyot : " "}
                </span>
                <span className="flex h-20 w-full items-end justify-center gap-px sm:h-24">
                  {nakyma === "euroa" ? (
                    <>
                      <span
                        className="w-1/2 rounded-t transition-[height] duration-200 motion-reduce:transition-none"
                        style={{
                          height: korkeus(k.laskutettuEur),
                          background: tyhja ? "var(--talous-neutraali)" : "var(--talous-tulo)",
                        }}
                      />
                      <span
                        className="w-1/2 rounded-t transition-[height] duration-200 motion-reduce:transition-none"
                        style={{
                          height: korkeus(k.maalikustannusEur),
                          background: tyhja ? "var(--talous-neutraali)" : "var(--talous-meno)",
                        }}
                      />
                    </>
                  ) : (
                    <span
                      className="w-full rounded-t transition-[height] duration-200 motion-reduce:transition-none"
                      style={{
                        height: korkeus(k.tyot),
                        background: tyhja ? "var(--talous-neutraali)" : "var(--talous-tyot)",
                      }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    // Kapeimmalla puhelimella sarakkeelle jää noin 18 px, johon
                    // kolmikirjaiminen lyhenne mahtuu vasta 9 pikselin koossa.
                    "w-full text-center text-[0.5625rem] leading-tight sm:text-[0.625rem]",
                    onValittu ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {KUUKAUDEN_LYHENNE[k.kuukausi]}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
