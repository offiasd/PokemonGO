import type { Alkupera, Database } from "@/lib/supabase/database.types";

type AsetuksetRow = Database["public"]["Tables"]["asetukset"]["Row"];

export interface VarinHintatiedot {
  alkupera: Alkupera;
  ostohinta_per_kg: number;
  tullimaksu_prosentti: number | null;
  alv_prosentti: number | null;
  toimituskulu_per_kg: number | null;
}

/**
 * Toimituskulu alkuperän mukaan Asetukset-sivun arvoista - värin oma arvo
 * ohittaa oletuksen vain jos se on vanhoista tiedoista jäänyt tallelle.
 */
export function toimituskuluOletus(alkupera: Alkupera, asetukset: AsetuksetRow): number {
  if (alkupera === "EU") return asetukset.toimituskulu_per_kg_eu_oletus;
  if (alkupera === "USA") return asetukset.toimituskulu_per_kg_usa_oletus;
  return asetukset.toimituskulu_per_kg_muu_oletus;
}

export interface VarinHintaerittely {
  /** Ostohinta myyjältä, €/kg. */
  ostohinta: number;
  /** Toimituskulu €/kg (asetuksista alkuperän mukaan). */
  toimituskulu: number;
  /** Tullausarvo = ostohinta + rahti. EU-tuonnissa sama kuin kokonaishinta. */
  tullausarvo: number;
  tullimaksuProsentti: number;
  alvProsentti: number;
  /** Tullin osuus €/kg (0 EU-tuonnissa). */
  tulli: number;
  /** Maahantuonnin ALV €/kg (0 EU-tuonnissa). */
  alv: number;
  /** Kokonaishinta €/kg. */
  kokonaishinta: number;
}

/**
 * Värin todellinen kokonaishinta €/kg erittelyineen. Sama laskentaperuste kuin
 * SQL-funktiolla vari_kokonaishinta_per_kg, jotta luku on sama riippumatta
 * siitä lasketaanko se kannassa vai sovelluksessa.
 *
 * EU-tuonti: ostohinta + toimituskulu (ei tullia eikä maahantuonnin ALV:tä).
 * Muut: (ostohinta + toimituskulu) * tulli * ALV - tulli ja ALV lasketaan myös
 * rahdista, koska rahti kuuluu tullausarvoon.
 */
export function laskeVarinHintaerittely(
  vari: VarinHintatiedot,
  asetukset: AsetuksetRow
): VarinHintaerittely {
  const toimituskulu = vari.toimituskulu_per_kg ?? toimituskuluOletus(vari.alkupera, asetukset);
  const ostohinta = vari.ostohinta_per_kg ?? 0;
  const tullausarvo = ostohinta + toimituskulu;
  const pyorista = (arvo: number) => Math.round(arvo * 100) / 100;

  if (vari.alkupera === "EU") {
    return {
      ostohinta,
      toimituskulu,
      tullausarvo,
      tullimaksuProsentti: 0,
      alvProsentti: 0,
      tulli: 0,
      alv: 0,
      kokonaishinta: pyorista(tullausarvo),
    };
  }

  const tullimaksuProsentti = vari.tullimaksu_prosentti ?? asetukset.tullimaksu_prosentti_oletus;
  const alvProsentti = vari.alv_prosentti ?? asetukset.alv_prosentti_oletus;
  const tulli = tullausarvo * (tullimaksuProsentti / 100);
  const alv = (tullausarvo + tulli) * (alvProsentti / 100);

  return {
    ostohinta,
    toimituskulu,
    tullausarvo,
    tullimaksuProsentti,
    alvProsentti,
    tulli: pyorista(tulli),
    alv: pyorista(alv),
    kokonaishinta: pyorista(tullausarvo + tulli + alv),
  };
}

export function laskeVarinKokonaishinta(
  vari: VarinHintatiedot,
  asetukset: AsetuksetRow
): number {
  return laskeVarinHintaerittely(vari, asetukset).kokonaishinta;
}
