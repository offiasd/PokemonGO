import type { Database } from "@/lib/supabase/database.types";

/**
 * Työrivin sarakkeet ilman lukittua maalikustannusta.
 *
 * Rivin hintasarakkeet (vari_hinta_per_kg, toinen_vari_hinta_per_kg,
 * maalikustannus_eur, hinta_lukittu_at) ovat taloustietoa samaan tapaan kuin
 * varit.ostohinta_per_kg: maalaajalla ei ole niihin SELECT-oikeutta. Postgres
 * vaatii `select *` -kyselyyn oikeudet koko tauluun, joten sarakkeet on
 * lueteltava nimeltä - muuten kysely kaatuisi maalaajalla oikeusvirheeseen.
 *
 * Työkohtainen maalikustannus ja kate luetaan tyojen_talous-näkymästä, joka
 * tarkistaa roolin itse.
 *
 * Luettelo on yhtenä merkkijonona, koska supabase-js päättelee rivin tyypin
 * juuri tästä literaalista - yhteenlaskettu merkkijono menettäisi tyypin.
 */
export const TYON_RIVI_SARAKKEET =
  "id, tyo_id, osa_id, oma_kuvaus, vari_id, toinen_vari_id, toinen_vari_rooli, kappalemaara, arvioitu_kulutus_g, toinen_arvioitu_kulutus_g, toteutunut_kulutus_g, toinen_toteutunut_kulutus_g, varaus_purettu, yksikkohinta_eur, kommentti, custom" as const;

/** Sama arkistoidulle riville; arkistossa ei ole varaus_purettu-saraketta. */
export const ARKISTOIDUN_RIVIN_SARAKKEET =
  "id, tyo_id, osa_id, oma_kuvaus, vari_id, toinen_vari_id, toinen_vari_rooli, kappalemaara, arvioitu_kulutus_g, toinen_arvioitu_kulutus_g, toteutunut_kulutus_g, toinen_toteutunut_kulutus_g, yksikkohinta_eur, kommentti, custom" as const;

/** Hintasarakkeet, jotka jäävät pois kummastakin sarakeluettelosta. */
type Hintasarakkeet =
  | "vari_hinta_per_kg"
  | "toinen_vari_hinta_per_kg"
  | "maalikustannus_eur"
  | "hinta_lukittu_at";

export type TyonRivi = Omit<Database["public"]["Tables"]["tyon_rivit"]["Row"], Hintasarakkeet>;

export type ArkistoituTyonRivi = Omit<
  Database["public"]["Tables"]["arkistoidut_tyon_rivit"]["Row"],
  Hintasarakkeet
>;
