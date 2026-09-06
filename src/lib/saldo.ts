/**
 * Varastosaldon tila ja saldopalkin väri.
 *
 * Asteikko on hälytysrajasta täysirajaan, ei nollasta täysirajaan: kiinnostava
 * kysymys on "kuinka kaukana tilaustarpeesta ollaan", ja hälytysrajan
 * alapuolella palkki on joka tapauksessa punainen.
 *
 * Aiemmin asteikon yläpää oli 4 x hälytysraja, mikä teki palkista lähes
 * hyödyttömän: 200 g:n rajalla valtaosa väreistä on yli 800 g:ssa, jolloin
 * palkki oli aina täysi eikä erottanut 900 g:n väriä 2500 g:n väristä.
 */

/** Palkin liukuvärin päätepisteet RGB-komponentteina.
 *
 *  Nämä ovat lukuja eivätkä teemamuuttujia, koska väri lasketaan sekoittamalla:
 *  CSS-muuttujasta ei saa komponentteja laskettavaksi ilman että arvo luetaan
 *  selaimesta. */
const VIHREA = [46, 125, 79];
const KELTAINEN = [200, 164, 21];
const PUNAINEN = [176, 50, 44];

function sekoita(a: number[], b: number[], t: number): number[] {
  const k = Math.max(0, Math.min(1, t));
  return a.map((v, i) => Math.round(v + (b[i] - v) * k));
}

export type SaldoTila = "loppu" | "vahissa" | "tilaa-pian" | "riittaa";

const TILAN_TEKSTI: Record<SaldoTila, string> = {
  loppu: "Loppu",
  vahissa: "Vähissä",
  "tilaa-pian": "Tilaa pian",
  riittaa: "Riittää",
};

export interface SaldoRajat {
  saldoG: number;
  varattuG?: number;
  /** Värin oma hälytysraja. Null = asetusten oletus. */
  halytysrajaG?: number | null;
  /** Värin oma täysiraja. Null = asetusten oletus. */
  taysirajaG?: number | null;
  oletusHalytysG: number;
  oletusTaysiG: number;
}

export interface SaldoArvio {
  tila: SaldoTila;
  teksti: string;
  /** Palkin väri: punainen -> keltainen -> vihreä hälytysrajan ja täysirajan välissä. */
  vari: string;
  /** Vapaana oleva saldo: varatut grammat on jo luvattu töihin. */
  vapaaG: number;
  halytysG: number;
  taysiG: number;
  /** Täysiraja hälytysrajan alapuolella tekisi asteikosta mahdottoman. */
  rajatKelvolliset: boolean;
}

/**
 * Saldon tila ja palkin väri.
 *
 * Sekä palkki että tilamerkintä lukevat tämän saman funktion, jottei kortissa
 * voi näkyä keltainen palkki vihreällä merkinnällä.
 */
export function laskeSaldoTila({
  saldoG,
  varattuG = 0,
  halytysrajaG,
  taysirajaG,
  oletusHalytysG,
  oletusTaysiG,
}: SaldoRajat): SaldoArvio {
  const halytysG = halytysrajaG ?? oletusHalytysG;
  const taysiG = taysirajaG ?? oletusTaysiG;
  const vapaaG = Math.max(0, saldoG - varattuG);
  const rajatKelvolliset = taysiG > halytysG;

  const t = rajatKelvolliset
    ? Math.max(0, Math.min(1, (vapaaG - halytysG) / (taysiG - halytysG)))
    : 0;

  const rgb =
    vapaaG <= halytysG
      ? PUNAINEN
      : t < 0.5
        ? sekoita(PUNAINEN, KELTAINEN, t * 2)
        : sekoita(KELTAINEN, VIHREA, (t - 0.5) * 2);

  const tila: SaldoTila =
    vapaaG <= 0 ? "loppu" : vapaaG <= halytysG ? "vahissa" : t < 0.45 ? "tilaa-pian" : "riittaa";

  return {
    tila,
    teksti: TILAN_TEKSTI[tila],
    vari: `rgb(${rgb.join(" ")})`,
    vapaaG,
    halytysG,
    taysiG,
    rajatKelvolliset,
  };
}
