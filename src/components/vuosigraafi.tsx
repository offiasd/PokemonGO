import { cn } from "@/lib/utils";

export type GraafinMittari = "tyot" | "euroa";

export interface GraafinKuukausi {
  /** 0 = tammikuu. */
  kuukausi: number;
  tyot: number;
  euroa: number;
}

const KUUKAUDEN_LYHENNE = [
  "Tam",
  "Hel",
  "Maa",
  "Huh",
  "Tou",
  "Kes",
  "Hei",
  "Elo",
  "Syy",
  "Lok",
  "Mar",
  "Jou",
];

export const KUUKAUDEN_NIMI = [
  "Tammikuu",
  "Helmikuu",
  "Maaliskuu",
  "Huhtikuu",
  "Toukokuu",
  "Kesäkuu",
  "Heinäkuu",
  "Elokuu",
  "Syyskuu",
  "Lokakuu",
  "Marraskuu",
  "Joulukuu",
];

/**
 * Pylvään päälle mahtuu puhelimella noin kolme merkkiä, joten tuhannet
 * lyhennetään: 3 240 EUR -> "3,2k". Työmäärät ovat kaksinumeroisia eivätkä
 * tarvitse lyhennystä.
 */
function lyhytLuku(arvo: number): string {
  if (arvo === 0) return "";
  if (arvo < 1000)
    return arvo.toLocaleString("fi-FI", { maximumFractionDigits: 0 });
  return `${(arvo / 1000).toLocaleString("fi-FI", { maximumFractionDigits: 1 })}k`;
}

/** Asteikon huippu luetaan kokonaisena: siitä päättelee muidenkin pylväiden arvot. */
function taysiLuku(arvo: number, mittari: GraafinMittari): string {
  if (mittari === "tyot") return `${arvo} työtä`;
  return arvo.toLocaleString("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  });
}

function taydellinenLuku(kuukausi: GraafinKuukausi): string {
  const euroa = kuukausi.euroa.toLocaleString("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  return `${kuukausi.tyot} työtä, ${euroa}`;
}

/**
 * Vuoden kaikki 12 kuukautta pylväinä, jotta kiireisin aika erottuu yhdellä
 * silmäyksellä. Pylväät piirretään gridillä eikä kirjastolla: kaksitoista
 * suhteellista korkeutta ei tarvitse kaaviokirjastoa, ja näin graafi latautuu
 * palvelimelta valmiina eikä vie selaimessa yhtään JavaScriptiä.
 *
 * Tyhjä kuukausi näkyy matalana viivana eikä katoa kokonaan - muuten vuoden
 * hiljaisia kuukausia ei erota siitä, ettei dataa ole.
 */
export function Vuosigraafi({
  kuukaudet,
  mittari,
  korostaKuukausi,
}: {
  kuukaudet: GraafinKuukausi[];
  mittari: GraafinMittari;
  /** Kuluva kuukausi kehystetään, jos katsotaan kuluvaa vuotta. */
  korostaKuukausi?: number;
}) {
  const arvo = (k: GraafinKuukausi) => (mittari === "tyot" ? k.tyot : k.euroa);
  const suurin = Math.max(...kuukaudet.map(arvo), 0);

  if (suurin === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Tälle vuodelle ei ole vielä yhtään valmistunutta työtä.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        Korkein pylväs {taysiLuku(suurin, mittari)}
      </p>
      <ul className="grid grid-cols-12 gap-x-0.5 sm:gap-x-1.5">
        {kuukaudet.map((k) => {
          const osuus = suurin === 0 ? 0 : (arvo(k) / suurin) * 100;
          const korostettu = k.kuukausi === korostaKuukausi;
          const huippu = arvo(k) === suurin;

          return (
            <li
              key={k.kuukausi}
              className="flex min-w-0 flex-col items-center gap-1"
            >
              <span className="text-[0.5625rem] leading-none text-muted-foreground tabular-nums">
                {/* Tyhjä kuukausi tarvitsee silti rivin, muuten sen pylväs nousee muita
                    ylemmäs eikä pylväiden alareuna ole enää samalla viivalla. */}
                {lyhytLuku(arvo(k)) || "\u00a0"}
              </span>
              <div
                className="flex h-24 w-full items-end sm:h-32"
                title={`${KUUKAUDEN_NIMI[k.kuukausi]}: ${taydellinenLuku(k)}`}
              >
                <div
                  className={cn(
                    "w-full rounded-t transition-[height]",
                    arvo(k) === 0
                      ? "bg-muted"
                      : huippu
                        ? "bg-primary"
                        : "bg-primary/55"
                  )}
                  // Nollakuukausi jätetään ohuena viivana näkyviin.
                  style={{
                    height: arvo(k) === 0 ? "2px" : `${Math.max(osuus, 4)}%`,
                  }}
                />
              </div>
              <span
                className={cn(
                  // Kapeimmalla puhelimella sarakkeelle jää noin 18 px, johon
                  // kolmikirjaiminen lyhenne mahtuu vasta 9 pikselin koossa.
                  "w-full text-center text-[0.5625rem] leading-tight sm:text-[0.625rem]",
                  korostettu
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {KUUKAUDEN_LYHENNE[k.kuukausi]}
              </span>
              <span className="sr-only">
                {KUUKAUDEN_NIMI[k.kuukausi]}: {taydellinenLuku(k)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
