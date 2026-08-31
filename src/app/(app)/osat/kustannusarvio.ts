import "server-only";

import type { Database, MaaliTyyppi, MyytavaMaaliTyyppi } from "@/lib/supabase/database.types";

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

// Laskee kustannusarvion (maali omalla todellisella hinnalla + työ) ja
// suositushinnan asteikkona halvimmasta kalleimpaan kategoriassa olevien
// värien mukaan - ei admin-asettamalla kiinteällä kategoriahinnalla.
// Candy ja Illusion sisältävät aina pakollisen pohjavärin/lakan kulutuksen
// ja hinnan, ja niiden asteikko kattaa kaikki väri- ja pohjaväriyhdistelmät.
export function laskeKategoriaKustannukset({
  osa,
  asetukset,
  tyokustannus,
  kategoriahinnat,
  varit,
  variKategoriat,
}: {
  osa: OsaRow;
  asetukset: AsetuksetRow;
  tyokustannus: number;
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

  const rivit: KustannusarvioRivi[] = [];

  for (const [tyyppi, otsikko] of [
    ["solid", "Perusvärit"],
    ["metallic", "Metallic"],
  ] as const) {
    const k = kategoriaHinta(tyyppi);
    if (!k) continue;
    const kustannukset = kategoriaVarit(tyyppi).map(
      (v) => (k.arvioitu_kulutus_g / 1000) * v.kokonaishinta + tyokustannus
    );
    const rivi = rakennaRivi(tyyppi, otsikko, kustannukset, osa, asetukset);
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
            tyokustannus
        );
      }
    }
    const rivi = rakennaRivi("candy", "Candy", kustannukset, osa, asetukset);
    if (rivi) rivit.push(rivi);
  }

  const illusionHinta = kategoriaHinta("illusion");
  if (illusionHinta) {
    const illusionVarit = kategoriaVarit("illusion");
    const lakkaVarit = kategoriaVarit("transparent");
    const kustannukset: number[] = [];
    for (const illuusio of illusionVarit) {
      for (const lakka of lakkaVarit) {
        kustannukset.push(
          (illusionHinta.arvioitu_kulutus_g / 1000) * illuusio.kokonaishinta +
            ((illusionHinta.toinen_arvioitu_kulutus_g ?? 0) / 1000) * lakka.kokonaishinta +
            tyokustannus
        );
      }
    }
    const rivi = rakennaRivi("illusion", "Illusion", kustannukset, osa, asetukset);
    if (rivi) rivit.push(rivi);
  }

  return rivit;
}
