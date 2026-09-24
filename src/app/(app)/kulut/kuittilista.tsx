"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";

import { ToimittajanKuvake } from "@/components/toimittajan-kuvake";
import { toimittajanAvain } from "@/lib/kulut";
import type { Yksikko } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import {
  euromaaraPuuttuu,
  muotoileEuro,
  muotoileKuitinSumma,
  muotoileMaara,
  muotoilePaivaLyhyt,
  muotoileValuutta,
} from "@/lib/vakiot";

import { useViimeisinKuitti } from "./viimeisin-kuitti";

/** Kuitin rivi ostoslistana: mitä ostettiin, kuinka paljon ja mihin hintaan. */
export interface KuitinRiviListalla {
  id: string;
  teksti: string;
  maara: number | null;
  yksikko: Yksikko | null;
  bruttoEur: number;
  /** Rivin summa laskun omassa valuutassa, kun se ei ole euro. */
  bruttoValuutassa: number | null;
}

export interface KuittiListalla {
  id: string;
  toimittaja: string | null;
  paivays: string;
  loppusummaEur: number;
  /** Laskun valuutta. Kuukausisummat ovat euroja, tämä on tunnistetieto. */
  valuutta: string;
  /** Loppusumma laskun omassa valuutassa. Näytetään kun euromäärä puuttuu. */
  loppusummaValuutassa: number;
  /** Mistä euromäärä tulee. Null = vahvistamatta, jolloin kuitti ei ole summissa. */
  kurssinLahde: string | null;
  kuluinaEur: number;
  onPdf: boolean;
  /** Puutteen syy suomeksi, tai null kun kuitti on kunnossa. */
  puute: string | null;
  /** Mitätöity kuitti ei ole summissa mukana mutta pysyy listalla. */
  mitatoity: boolean;
  mitatointiSyy: string | null;
  rivit: KuitinRiviListalla[];
}

interface ToimittajanRyhma {
  avain: string;
  /** Näytettävä nimi: yleisin kirjoitusasu ryhmän kuiteilla. */
  nimi: string;
  kuitit: KuittiListalla[];
  /** Kuittien loppusummat euroina, tai null kun yksikään ei ole summissa. */
  summaEur: number | null;
  kuluinaEur: number;
  puutteellisia: number;
  mitatoityja: number;
}

/**
 * Kuitit toimittajan mukaan ryhmiin.
 *
 * Summissa noudatetaan samaa sääntöä kuin kuukauden otsikossa: mitätöity
 * kuitti ja vieraan valuutan kuitti jonka euromäärää ei ole vahvistettu eivät
 * ole luvussa mukana. Molemmat kerrotaan ryhmän alaotsikossa, jottei puuttuva
 * kuitti katoa summaan.
 */
function ryhmitteleToimittajittain(kuitit: KuittiListalla[]): ToimittajanRyhma[] {
  const ryhmat = new Map<string, KuittiListalla[]>();
  for (const kuitti of kuitit) {
    const avain = toimittajanAvain(kuitti.toimittaja);
    ryhmat.set(avain, [...(ryhmat.get(avain) ?? []), kuitti]);
  }

  return [...ryhmat.entries()]
    .map(([avain, ryhmanKuitit]) => {
      const summissa = ryhmanKuitit.filter(
        (k) => !k.mitatoity && !euromaaraPuuttuu(k.valuutta, k.kurssinLahde)
      );
      return {
        avain,
        nimi: yleisinNimi(ryhmanKuitit),
        kuitit: ryhmanKuitit,
        // Null kun ryhmässä ei ole yhtään summiin laskettavaa kuittia: "0,00 €"
        // väittäisi että toimittajalta ostettiin nollalla eurolla, vaikka kyse
        // on mitätöinnistä tai vahvistamattomasta euromäärästä.
        summaEur: summissa.length
          ? summissa.reduce((summa, k) => summa + k.loppusummaEur, 0)
          : null,
        kuluinaEur: summissa.reduce((summa, k) => summa + k.kuluinaEur, 0),
        puutteellisia: ryhmanKuitit.filter((k) => k.puute !== null).length,
        mitatoityja: ryhmanKuitit.filter((k) => k.mitatoity).length,
      };
    })
    // Suurin toimittaja ensin: kuukausinäkymässä kysymys on mihin raha meni,
    // ja siihen vastaa summa eikä aakkosjärjestys. Yhtä suuret nimen mukaan,
    // jotta järjestys ei heittelehdi kuukaudesta toiseen.
    .sort((a, b) => (b.summaEur ?? 0) - (a.summaEur ?? 0) || a.nimi.localeCompare(b.nimi, "fi"));
}

/**
 * Ryhmän näytettävä nimi.
 *
 * Kirjoitusasuja on yhtä monta kuin poimintoja, joten näytetään se joka
 * toistuu useimmin. Tasatilanteessa voittaa uusin: lista on päiväjärjestyksessä
 * uusin ensin, ja tuorein poiminta on lähimpänä sitä miltä kuitti nyt näyttää.
 */
function yleisinNimi(kuitit: KuittiListalla[]): string {
  const laskurit = new Map<string, number>();
  for (const kuitti of kuitit) {
    const nimi = kuitti.toimittaja?.trim();
    if (nimi) laskurit.set(nimi, (laskurit.get(nimi) ?? 0) + 1);
  }
  const paras = [...laskurit.entries()].sort((a, b) => b[1] - a[1])[0];
  return paras?.[0] ?? "Toimittaja puuttuu";
}

/** Rivin hinta: euro kun se on tiedossa, muuten kuitin oma valuutta. */
function rivinHinta(kuitti: KuittiListalla, rivi: KuitinRiviListalla): string {
  if (euromaaraPuuttuu(kuitti.valuutta, kuitti.kurssinLahde)) {
    return muotoileValuutta(rivi.bruttoValuutassa ?? 0, kuitti.valuutta);
  }
  return muotoileEuro(rivi.bruttoEur);
}

/**
 * Kuukauden kuitit toimittajittain.
 *
 * Yhteenveto vastaa ensin kysymykseen mihin kuukauden raha meni: yksi rivi
 * toimittajaa kohti ja sen summa. Toimittajaa painamalla aukeaa erittely
 * kuiteittain ja kuittia painamalla sen ostokset - kolme tasoa, joista
 * jokainen on oma päätöksensä katsoa tarkemmin.
 *
 * Puutteellisia ei eroteta omaan laatikkoonsa vaan ne nostetaan esiin
 * paikallaan: lämmin kuvake toimittajan kohdalla ja puutteen syy kuitin
 * päiväyksen perässä. Näin sama kuitti ei näy kahdessa paikassa.
 *
 * Nuoli merkitsee sen kuitin, joka on auki Kuitti-välilehdellä, ja sen
 * toimittaja on valmiiksi auki.
 *
 * Mitätöity kuitti pysyy listalla läpiviivattuna ja syineen: kirjanpidossa
 * vientejä ei poisteta vaan oikaistaan, ja lukijan pitää nähdä että jotain
 * korjattiin.
 */
export function Kuittilista({ kuitit }: { kuitit: KuittiListalla[] }) {
  const avoin = useViimeisinKuitti();
  const [avatutRyhmat, setAvatutRyhmat] = useState<Record<string, boolean>>({});
  const [avatutKuitit, setAvatutKuitit] = useState<Record<string, boolean>>({});

  if (kuitit.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Ei kuitteja tälle kuukaudelle. Kuvaa ensimmäinen alareunan painikkeesta.
      </p>
    );
  }

  const ryhmat = ryhmitteleToimittajittain(kuitit);

  return (
    <div className="grid">
      {ryhmat.map((ryhma, jarjestys) => {
        // Viimeksi avattu kuitti on todennäköisin syy tulla takaisin listalle,
        // joten sen toimittaja on auki ilman painallusta. Käyttäjän oma valinta
        // menee tämän edelle.
        const auki = avatutRyhmat[ryhma.avain] ?? ryhma.kuitit.some((k) => k.id === avoin);
        const tiedot = [`${ryhma.kuitit.length} ${ryhma.kuitit.length === 1 ? "kuitti" : "kuittia"}`];
        if (ryhma.mitatoityja > 0) tiedot.push(`${ryhma.mitatoityja} mitätöity`);
        if (ryhma.puutteellisia > 0) {
          tiedot.push(`${ryhma.puutteellisia} vaatii huomiota`);
        } else if (ryhma.summaEur !== null && ryhma.kuluinaEur !== ryhma.summaEur) {
          // Ero tulee yksityisotoista: ne ovat kuitilla mutta eivät kuluja.
          tiedot.push(`kuluina ${muotoileEuro(ryhma.kuluinaEur)}`);
        }

        return (
          <div key={ryhma.avain} className={cn("grid", jarjestys > 0 && "border-t")}>
            {/* Alaotsikko ("2 kuittia · kuluina 18,49 €") kulkee koko rivin
                leveydeltä eikä nimen sarakkeessa: 320 pikselin ruudulla nimen
                sarakkeeksi jää summan jälkeen satakunta pikseliä, jossa
                alaotsikosta näkyisi kolme sanaa ja kolme pistettä. */}
            <button
              type="button"
              aria-expanded={auki}
              onClick={() => setAvatutRyhmat((edellinen) => ({ ...edellinen, [ryhma.avain]: !auki }))}
              className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-0.5 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/50"
            >
              <ToimittajanKuvake
                toimittaja={ryhma.nimi}
                puutteellinen={ryhma.puutteellisia > 0}
                className="row-span-2"
              />
              <span className="truncate font-medium">{ryhma.nimi}</span>
              <span
                className={cn(
                  "text-lg font-medium tabular-nums",
                  ryhma.summaEur === null && "text-muted-foreground"
                )}
              >
                {muotoileEuro(ryhma.summaEur)}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  auki && "rotate-180"
                )}
              />
              <span
                className={cn(
                  "col-span-3 truncate text-sm",
                  ryhma.puutteellisia > 0 ? "text-warning" : "text-muted-foreground"
                )}
              >
                {tiedot.join(" · ")}
              </span>
            </button>

            {/* Erittely on sisennetty, muttei toimittajan kuvakkeen verran:
                kapealla ruudulla 36 pikselin sisennys on pois numeroilta. */}
            {auki && (
              <div className="grid gap-0 pb-2 pl-3">
                {ryhma.kuitit.map((kuitti, kuitinJarjestys) => (
                  <KuitinRivi
                    key={kuitti.id}
                    kuitti={kuitti}
                    ryhmanNimi={ryhma.nimi}
                    avoin={kuitti.id === avoin}
                    ensimmainen={kuitinJarjestys === 0}
                    ostoksetAuki={avatutKuitit[kuitti.id] ?? false}
                    vaihdaOstokset={() =>
                      setAvatutKuitit((edellinen) => ({
                        ...edellinen,
                        [kuitti.id]: !edellinen[kuitti.id],
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Yksi kuitti toimittajan erittelyssä.
 *
 * Rivi itse vie kuitille - se on yhä se mitä listalta useimmin haetaan.
 * Vieressä oleva nuoli avaa ostokset paikallaan, kun kysymys on vain siitä
 * mitä kuitilla oli.
 */
function KuitinRivi({
  kuitti,
  ryhmanNimi,
  avoin,
  ensimmainen,
  ostoksetAuki,
  vaihdaOstokset,
}: {
  kuitti: KuittiListalla;
  ryhmanNimi: string;
  avoin: boolean;
  ensimmainen: boolean;
  ostoksetAuki: boolean;
  vaihdaOstokset: () => void;
}) {
  const puuttuu = euromaaraPuuttuu(kuitti.valuutta, kuitti.kurssinLahde);
  // Kuitilla lukeva kirjoitusasu näytetään vain kun se poikkeaa ryhmän
  // nimestä: muuten se toistaisi juuri luetun otsikon.
  const omaNimi = kuitti.toimittaja?.trim();
  const poikkeavaNimi = omaNimi && omaNimi !== ryhmanNimi ? omaNimi : null;

  return (
    <div className={cn("grid", !ensimmainen && "border-t")}>
      <div className="flex min-w-0 items-center gap-1">
        {/* Päiväys ja summa vastakkain, selite koko rivin leveydeltä alla:
            sama syy kuin toimittajan otsikossa - kapealla ruudulla selite on
            pisin teksti eikä se mahdu summan viereen. */}
        <Link
          href={`/kulut/${kuitti.id}`}
          className={cn(
            "-ml-2 grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/50",
            kuitti.mitatoity && "opacity-60"
          )}
        >
          <span className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                "truncate text-sm font-medium tabular-nums",
                kuitti.mitatoity && "line-through"
              )}
            >
              {muotoilePaivaLyhyt(kuitti.paivays)}
            </span>
            {avoin && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
            {kuitti.onPdf && <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
            {/* Valuuttamerkintä tekee dollarikuitin näkyväksi listassa,
                jossa kaikki muut luvut ovat euroja. */}
            {kuitti.valuutta !== "EUR" && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground">
                {kuitti.valuutta}
              </span>
            )}
          </span>
          {/* Vahvistamattoman kuitin euroluku on nolla, joten näytetään sen
              sijaan kuitilla lukeva summa omassa valuutassaan: 0,00 € olisi
              väärä luku joka näyttää oikealta. */}
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              (kuitti.mitatoity || puuttuu) && "text-muted-foreground",
              kuitti.mitatoity && "line-through"
            )}
          >
            {muotoileKuitinSumma(kuitti)}
          </span>
          <span
            className={cn(
              "col-span-2 truncate text-xs",
              kuitti.puute ? "text-warning" : "text-muted-foreground"
            )}
          >
            {poikkeavaNimi && `${poikkeavaNimi} · `}
            {kuitti.mitatoity
              ? `Mitätöity: ${kuitti.mitatointiSyy ?? "syytä ei kirjattu"}`
              : (kuitti.puute ?? `kuluina ${muotoileEuro(kuitti.kuluinaEur)}`)}
          </span>
        </Link>
        <button
          type="button"
          aria-expanded={ostoksetAuki}
          aria-label={ostoksetAuki ? "Piilota ostokset" : "Näytä ostokset"}
          onClick={vaihdaOstokset}
          className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", ostoksetAuki && "rotate-180")}
          />
        </button>
      </div>

      {/* Ostokset ilman kuitin kuvaa: mitä ostettiin, kuinka paljon ja millä
          hinnalla. Määrä on oman rivinsä alla eikä omassa sarakkeessaan -
          kolmas sarake ei mahdu puhelimeen. */}
      {ostoksetAuki && (
        <div className="grid gap-2 pb-3 pl-1">
          {kuitti.rivit.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ei rivejä. Avaa kuitti ja lue ostokset kuvasta.
            </p>
          ) : (
            kuitti.rivit.map((rivi) => {
              const maara = muotoileMaara(rivi.maara, rivi.yksikko);
              return (
                <div
                  key={rivi.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3"
                >
                  <span className="truncate text-xs">{rivi.teksti}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {rivinHinta(kuitti, rivi)}
                  </span>
                  {maara && (
                    <span className="col-start-1 truncate text-[0.6875rem] text-muted-foreground tabular-nums">
                      {maara}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
