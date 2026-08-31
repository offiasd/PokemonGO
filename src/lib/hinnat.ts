import type { Alkupera, Database } from "@/lib/supabase/database.types";

type AsetuksetRow = Database["public"]["Tables"]["asetukset"]["Row"];

interface VarinHintatiedot {
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

/**
 * Värin todellinen kokonaishinta €/kg: ostohinta + tulli + ALV + toimituskulu.
 * Sama laskentaperuste kuin SQL-funktiolla vari_kokonaishinta, jotta luku on
 * sama riippumatta siitä lasketaanko se kannassa vai sovelluksessa. EU-tuonnille
 * ei lisätä tullia eikä maahantuonnin ALV:tä.
 */
export function laskeVarinKokonaishinta(
  vari: VarinHintatiedot,
  asetukset: AsetuksetRow
): number {
  const toimituskulu = vari.toimituskulu_per_kg ?? toimituskuluOletus(vari.alkupera, asetukset);
  const ostohinta = vari.ostohinta_per_kg ?? 0;

  if (vari.alkupera === "EU") {
    return Math.round((ostohinta + toimituskulu) * 100) / 100;
  }

  const tulli = vari.tullimaksu_prosentti ?? asetukset.tullimaksu_prosentti_oletus;
  const alv = vari.alv_prosentti ?? asetukset.alv_prosentti_oletus;
  return (
    Math.round((ostohinta * (1 + tulli / 100) * (1 + alv / 100) + toimituskulu) * 100) / 100
  );
}
