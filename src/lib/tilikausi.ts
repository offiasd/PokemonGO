import type { Pienhankinta } from "@/lib/kulut";
import { csvKentta, csvLuku, TAVUJARJESTYSMERKKI } from "@/lib/luovutus";
import { KUUKAUDEN_NIMI } from "@/lib/vakiot";

/**
 * Tilikauden aineiston muoto ja taulukot.
 *
 * Puhdas moduuli ilman kantayhteyttä, samasta syystä kuin luovutus.ts:
 * koosteen on oltava ajettavissa oikealla aineistolla ilman palvelinta.
 * Haku on tilikausi-haku.ts:ssä. Tilikausi on kalenterivuosi.
 */

export interface TilannekuvanRivi {
  vari_nimi: string;
  valmistaja: string | null;
  saldo_g: number;
  hinta_per_kg: number;
  arvo_eur: number;
}

export interface Tilannekuva {
  otettu: string;
  ottaja: string | null;
  yhteensaEur: number;
  vareja: number;
  muistiinpano: string | null;
  rivit: TilannekuvanRivi[];
}

export interface KululuokanSumma {
  nimi: string;
  eur: number;
}

export interface MyyntiKuukausi {
  /** 0-11, jotta KUUKAUDEN_NIMI kelpaa suoraan. */
  kuukausi: number;
  toita: number;
  myyntiEur: number;
  keskihintaEur: number;
}

export interface Yksityisotto {
  paivays: string;
  toimittaja: string | null;
  teksti: string;
  bruttoEur: number;
}

export interface KalustoRivi {
  nimi: string;
  hankittu: string;
  /** Hankintameno ALV 0 %. */
  hankintamenoEur: number;
  luovutettu: string | null;
  luovutushintaEur: number | null;
}

/**
 * Tilikauden poistolaskelma.
 *
 * Kaikki luvut tulevat kannasta valmiina. Sovellus ei laske poistoa
 * uudelleen missään: enimmäismäärä on kannan laskema, ja kirjanpitäjän
 * ilmoittama todellinen poisto kirjataan erikseen.
 */
export interface Poistolaskelma {
  tilikausiPaattyi: string;
  menojaannosAlussaEur: number;
  hankinnatEur: number;
  luovutushinnatEur: number;
  poistopohjaEur: number;
  /** Enimmäismäärä, ei poisto: EVL 54 § sitoo poiston kirjanpitoon. */
  poistoEnintaanEur: number;
  /** Kirjanpitäjän ilmoittama todellinen poisto. Null = enimmäismäärä käytössä. */
  poistoToteutunutEur: number | null;
  kertapoisto: boolean;
  menojaannosLopussaEur: number;
  muistiinpano: string | null;
}

export interface TilikaudenAineisto {
  vuosi: number;
  /** Null kun tilannekuvaa ei ole otettu. Elävää saldoa ei näytetä tilalla. */
  tilannekuva: Tilannekuva | null;
  pienhankinnat: Pienhankinta;
  kululuokittain: KululuokanSumma[];
  kulutYhteensaEur: number;
  myyntiKuukausittain: MyyntiKuukausi[];
  myyntiYhteensaEur: number;
  yksityisotot: Yksityisotto[];
  yksityisototYhteensaEur: number;
  kuitteja: number;
  /** Kalusto tilikauden päättyessä: hankittu viimeistään 31.12. */
  kalusto: KalustoRivi[];
  /** Null kun tilikaudelle ei ole laskettu poistolaskelmaa. */
  poistolaskelma: Poistolaskelma | null;
}

/** Tilikauden vientimuodot. Kuittikuvat ovat kuukausipaketeissa, eivät täällä. */
export type TilikaudenMuoto = "pdf" | "csv";

export function tilikaudenNimi(vuosi: number, muoto: TilikaudenMuoto | "paketti"): string {
  if (muoto === "pdf") return `tilikausi_${vuosi}_kooste.pdf`;
  if (muoto === "csv") return `tilikausi_${vuosi}_taulukot.zip`;
  return `tilikausi_${vuosi}_paketti.zip`;
}

/**
 * Tilikauden taulukot CSV:nä, osio kerrallaan.
 *
 * Osiot ovat eri muotoisia - varastorivi ja myyntikuukausi eivät mahdu samaan
 * sarakkeistoon - joten jokainen on oma tiedostonsa. Yhteen puristettuna
 * taulukkolaskenta ei osaisi lukea niistä yhtäkään.
 */
export function tilikaudenTaulukot(aineisto: TilikaudenAineisto): Map<string, string> {
  const taulukot = new Map<string, string>();
  const v = aineisto.vuosi;

  if (aineisto.tilannekuva) {
    const rivit = [["Väri", "Valmistaja", "Saldo g", "Kilohinta", "Arvo"].join(";")];
    for (const r of aineisto.tilannekuva.rivit) {
      rivit.push(
        [
          csvKentta(r.vari_nimi),
          csvKentta(r.valmistaja),
          csvLuku(r.saldo_g),
          csvLuku(r.hinta_per_kg),
          csvLuku(r.arvo_eur),
        ].join(";")
      );
    }
    rivit.push(["Yhteensä", "", "", "", csvLuku(aineisto.tilannekuva.yhteensaEur)].join(";"));
    taulukot.set(`tilikausi_${v}_varasto.csv`, TAVUJARJESTYSMERKKI + rivit.join("\r\n"));
  }

  const pienhankinnat = [["Päiväys", "Toimittaja", "Kuvaus", "Nettosumma"].join(";")];
  for (const y of aineisto.pienhankinnat.ylisuuret) {
    pienhankinnat.push(
      [csvKentta(y.paivays), csvKentta(y.toimittaja), csvKentta(y.teksti), csvLuku(y.nettoEur)].join(
        ";"
      )
    );
  }
  taulukot.set(
    `tilikausi_${v}_yli_1200.csv`,
    TAVUJARJESTYSMERKKI + pienhankinnat.join("\r\n")
  );

  const luokat = [["Kululuokka", "Summa"].join(";")];
  for (const l of aineisto.kululuokittain) {
    luokat.push([csvKentta(l.nimi), csvLuku(l.eur)].join(";"));
  }
  luokat.push(["Yhteensä", csvLuku(aineisto.kulutYhteensaEur)].join(";"));
  taulukot.set(`tilikausi_${v}_kululuokat.csv`, TAVUJARJESTYSMERKKI + luokat.join("\r\n"));

  const myynti = [["Kuukausi", "Töitä", "Myynti", "Keskihinta"].join(";")];
  for (const k of aineisto.myyntiKuukausittain) {
    myynti.push(
      [
        csvKentta(KUUKAUDEN_NIMI[k.kuukausi]),
        String(k.toita),
        csvLuku(k.myyntiEur),
        csvLuku(k.keskihintaEur),
      ].join(";")
    );
  }
  myynti.push(["Yhteensä", "", csvLuku(aineisto.myyntiYhteensaEur), ""].join(";"));
  taulukot.set(`tilikausi_${v}_myynti.csv`, TAVUJARJESTYSMERKKI + myynti.join("\r\n"));

  const kalusto = [
    ["Nimi", "Hankittu", "Hankintameno (ALV 0 %)", "Luovutettu", "Luovutushinta"].join(";"),
  ];
  for (const k of aineisto.kalusto) {
    kalusto.push(
      [
        csvKentta(k.nimi),
        csvKentta(k.hankittu),
        csvLuku(k.hankintamenoEur),
        csvKentta(k.luovutettu),
        k.luovutushintaEur === null ? "" : csvLuku(k.luovutushintaEur),
      ].join(";")
    );
  }
  taulukot.set(`tilikausi_${v}_kalusto.csv`, TAVUJARJESTYSMERKKI + kalusto.join("\r\n"));

  // Poistolaskelma rivi riviltä, jotta kirjanpitäjä näkee mistä luku tulee.
  if (aineisto.poistolaskelma) {
    const p = aineisto.poistolaskelma;
    const poisto = [["Erä", "Summa"].join(";")];
    poisto.push(["Menojäännös tilikauden alussa", csvLuku(p.menojaannosAlussaEur)].join(";"));
    poisto.push(["Tilikauden hankinnat", csvLuku(p.hankinnatEur)].join(";"));
    poisto.push(["Tilikauden luovutushinnat", csvLuku(-p.luovutushinnatEur)].join(";"));
    poisto.push(["Poistopohja", csvLuku(p.poistopohjaEur)].join(";"));
    poisto.push(
      [
        p.kertapoisto
          ? "Poiston enimmäismäärä (kertapoisto, jäännös enintään 1 200 €)"
          : "Poiston enimmäismäärä (25 %)",
        csvLuku(p.poistoEnintaanEur),
      ].join(";")
    );
    poisto.push([
      "Toteutunut poisto (kirjanpitäjältä)",
      p.poistoToteutunutEur === null ? "" : csvLuku(p.poistoToteutunutEur),
    ].join(";"));
    poisto.push(["Menojäännös tilikauden lopussa", csvLuku(p.menojaannosLopussaEur)].join(";"));
    taulukot.set(`tilikausi_${v}_poistolaskelma.csv`, TAVUJARJESTYSMERKKI + poisto.join("\r\n"));
  }

  const otot = [["Päiväys", "Toimittaja", "Kuvaus", "Summa"].join(";")];
  for (const y of aineisto.yksityisotot) {
    otot.push(
      [csvKentta(y.paivays), csvKentta(y.toimittaja), csvKentta(y.teksti), csvLuku(y.bruttoEur)].join(
        ";"
      )
    );
  }
  otot.push(["Yhteensä", "", "", csvLuku(aineisto.yksityisototYhteensaEur)].join(";"));
  taulukot.set(`tilikausi_${v}_yksityisotot.csv`, TAVUJARJESTYSMERKKI + otot.join("\r\n"));

  return taulukot;
}
