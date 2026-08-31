import "server-only";

import type {
  Database,
  MaaliTyyppi,
  MyytavaMaaliTyyppi,
  TyoVaihe,
} from "@/lib/supabase/database.types";
import {
  kategorianVarienMaara,
  VARIKERROKSITTAIN_KERTAUTUVAT_VAIHEET,
} from "@/lib/vakiot";

type OsaRow = Database["public"]["Tables"]["osat"]["Row"];
type AsetuksetRow = Database["public"]["Tables"]["asetukset"]["Row"];
type KategoriahintaRow = Database["public"]["Tables"]["osa_kategoriahinnat"]["Row"];

export interface VariHinta {
  id: string;
  nimi: string;
  kokonaishinta: number;
}

export interface KustannusarvioRivi {
  avain: string;
  nimi: string;
  kustannusMin: number;
  kustannusMax: number;
  suositusMin: number;
  suositusMax: number;
}

function pyoristaSentteihin(arvo: number): number {
  return Math.round(arvo * 100) / 100;
}

// Vaihekohtainen tuntihinta jos asetettu, muuten yleinen tuntihinta.
// Lasketaan JS:ssä eikä RPC:llä, jotta listasivu ei tee erillistä kutsua
// jokaiselle osalle.
//
// Monikerrosmaalauksessa (candy, illusion, metallic, solid + lakkaus) maalaus
// ja suojaus tehdään jokaiselle värikerrokselle erikseen, joten niiden kesto
// kerrotaan värien lukumäärällä. Pesu, maalinpoisto ja puhallus tehdään kerran.
export function laskeTyokustannus(
  vaiheet: { vaihe: TyoVaihe; arvioitu_kesto_min: number }[],
  tuntiveloitukset: Map<TyoVaihe, number>,
  yleinenTuntihinta: number,
  varienMaara = 1
): number {
  return vaiheet.reduce((summa, v) => {
    const kerroin = VARIKERROKSITTAIN_KERTAUTUVAT_VAIHEET.includes(v.vaihe) ? varienMaara : 1;
    const tuntihinta = tuntiveloitukset.get(v.vaihe) ?? yleinenTuntihinta;
    return summa + ((v.arvioitu_kesto_min * kerroin) / 60) * tuntihinta;
  }, 0);
}

/** Työkustannus värien lukumäärän mukaan: [1 väri, 2 väriä]. */
export function laskeTyokustannusKerroksittain(
  vaiheet: { vaihe: TyoVaihe; arvioitu_kesto_min: number }[],
  tuntiveloitukset: Map<TyoVaihe, number>,
  yleinenTuntihinta: number
): number[] {
  return [1, 2].map((maara) =>
    laskeTyokustannus(vaiheet, tuntiveloitukset, yleinenTuntihinta, maara)
  );
}

// Sama laskentaperuste kuin SQL-funktiolla osa_suositushinta: manuaalinen_hinta
// ohittaa kaiken, muuten kustannusarvio + kate-% + kiinteä lisä.
function suositushinta(kustannus: number, osa: OsaRow, asetukset: AsetuksetRow): number {
  if (osa.manuaalinen_hinta !== null && osa.manuaalinen_hinta !== undefined) {
    return osa.manuaalinen_hinta;
  }
  const kate = osa.kate_prosentti ?? asetukset.kate_prosentti_oletus;
  const kiintea = osa.kate_kiintea ?? 0;
  return pyoristaSentteihin(kustannus * (1 + kate / 100) + kiintea);
}

function rakennaRivi(
  avain: string,
  nimi: string,
  kustannukset: number[],
  osa: OsaRow,
  asetukset: AsetuksetRow
): KustannusarvioRivi | null {
  if (kustannukset.length === 0) return null;
  const kustannusMin = pyoristaSentteihin(Math.min(...kustannukset));
  const kustannusMax = pyoristaSentteihin(Math.max(...kustannukset));
  return {
    avain,
    nimi,
    kustannusMin,
    kustannusMax,
    suositusMin: suositushinta(kustannusMin, osa, asetukset),
    suositusMax: suositushinta(kustannusMax, osa, asetukset),
  };
}

// Kategoria, jolla on pakollinen lakkaus (Metallic, Illusion) - kustannusasteikko
// kattaa kaikki pääväri- ja lakkayhdistelmät.
function laskeLakatunKategorianRivi(
  avain: string,
  nimi: string,
  hinta: KategoriahintaRow,
  paavarit: VariHinta[],
  lakkaVarit: VariHinta[],
  tyokustannus: number,
  osa: OsaRow,
  asetukset: AsetuksetRow
): KustannusarvioRivi | null {
  const kustannukset: number[] = [];
  for (const paavari of paavarit) {
    for (const lakka of lakkaVarit) {
      kustannukset.push(
        (hinta.arvioitu_kulutus_g / 1000) * paavari.kokonaishinta +
          ((hinta.toinen_arvioitu_kulutus_g ?? 0) / 1000) * lakka.kokonaishinta +
          tyokustannus
      );
    }
  }
  return rakennaRivi(avain, nimi, kustannukset, osa, asetukset);
}

// Laskee kustannusarvion (maali omalla todellisella hinnalla + työ) ja
// suositushinnan asteikkona halvimmasta kalleimpaan kategoriassa olevien
// värien mukaan - ei admin-asettamalla kiinteällä kategoriahinnalla.
// Candy, Metallic ja Illusion sisältävät aina pakollisen pohjavärin/lakan
// kulutuksen ja hinnan, ja niiden asteikko kattaa kaikki väri- ja
// pohjaväri-/lakkayhdistelmät. Metallic vaatii lakkauksen aina kun sitä
// käytetään omana värinään - ei kuitenkaan kun sitä käytetään candyn
// pohjavärinä, koska silloin candy-työn oma lakkaus riittää.
export function laskeKategoriaKustannukset({
  osa,
  asetukset,
  tyokustannusKerroksittain,
  kategoriahinnat,
  varit,
  variKategoriat,
}: {
  osa: OsaRow;
  asetukset: AsetuksetRow;
  /** Työkustannus värien lukumäärän mukaan: [1 väri, 2 väriä]. */
  tyokustannusKerroksittain: number[];
  kategoriahinnat: KategoriahintaRow[];
  varit: VariHinta[];
  variKategoriat: { vari_id: string; maali_tyyppi: MaaliTyyppi }[];
}): KustannusarvioRivi[] {
  const kartta = new Map<string, Set<MaaliTyyppi>>();
  for (const { vari_id, maali_tyyppi } of variKategoriat) {
    const joukko = kartta.get(vari_id) ?? new Set<MaaliTyyppi>();
    joukko.add(maali_tyyppi);
    kartta.set(vari_id, joukko);
  }
  const kategoriaVarit = (tyyppi: MaaliTyyppi) =>
    varit.filter((v) => kartta.get(v.id)?.has(tyyppi));
  const kategoriaHinta = (tyyppi: MyytavaMaaliTyyppi) =>
    kategoriahinnat.find((k) => k.maali_tyyppi === tyyppi) ?? null;

  // Maalaus ja suojaus kertautuvat värikerroksittain: candy/illusion/metallic
  // ovat aina kahden värin töitä, perusväri yhden.
  const tyokustannus = (kategoria: MyytavaMaaliTyyppi) => {
    const maara = kategorianVarienMaara(kategoria);
    return tyokustannusKerroksittain[maara - 1] ?? tyokustannusKerroksittain[0] ?? 0;
  };

  const rivit: KustannusarvioRivi[] = [];

  const solidHinta = kategoriaHinta("solid");
  if (solidHinta) {
    const kustannukset = kategoriaVarit("solid").map(
      (v) => (solidHinta.arvioitu_kulutus_g / 1000) * v.kokonaishinta + tyokustannus("solid")
    );
    const rivi = rakennaRivi("solid", "Perusvärit", kustannukset, osa, asetukset);
    if (rivi) rivit.push(rivi);
  }

  const metallicHinta = kategoriaHinta("metallic");
  if (metallicHinta) {
    const rivi = laskeLakatunKategorianRivi(
      "metallic",
      "Metallic",
      metallicHinta,
      kategoriaVarit("metallic"),
      kategoriaVarit("transparent"),
      tyokustannus("metallic"),
      osa,
      asetukset
    );
    if (rivi) rivit.push(rivi);
  }

  const candyHinta = kategoriaHinta("candy");
  if (candyHinta) {
    const candyVarit = kategoriaVarit("candy");
    const pohjaVarit = kategoriaVarit("pohjavari");
    const kustannukset: number[] = [];
    for (const c of candyVarit) {
      for (const pohja of pohjaVarit) {
        kustannukset.push(
          (candyHinta.arvioitu_kulutus_g / 1000) * c.kokonaishinta +
            ((candyHinta.toinen_arvioitu_kulutus_g ?? 0) / 1000) * pohja.kokonaishinta +
            tyokustannus("candy")
        );
      }
    }
    const rivi = rakennaRivi("candy", "Candy", kustannukset, osa, asetukset);
    if (rivi) rivit.push(rivi);
  }

  const illusionHinta = kategoriaHinta("illusion");
  if (illusionHinta) {
    const rivi = laskeLakatunKategorianRivi(
      "illusion",
      "Illusion",
      illusionHinta,
      kategoriaVarit("illusion"),
      kategoriaVarit("transparent"),
      tyokustannus("illusion"),
      osa,
      asetukset
    );
    if (rivi) rivit.push(rivi);
  }

  return rivit;
}
