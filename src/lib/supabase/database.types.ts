// Käsin ylläpidetyt tyypit, jotka vastaavat supabase/migrations-hakemiston
// tietokantarakennetta. Kun projektiin on kytketty oikea Supabase-projekti, nämä
// voidaan korvata komennolla:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts

/**
 * Ajoneuvotyypin avain. Tyypit ovat adminin hallinnoimaa dataa
 * (ajoneuvotyypit-taulu), joten sallittuja arvoja ei voi luetella tyypissä.
 */
export type AjoneuvoTyyppi = string;
export type VariTyyppi =
  | "yksivarinen"
  | "candy"
  | "illusion"
  | "metallic"
  | "muu_erikois";
export type TyoVaihe = "pesu" | "maalinpoisto" | "puhallus" | "teippaus" | "maalaus";
export type Alkupera = "EU" | "USA" | "muu";

/** Varastosaldon muutoksen laji: lisätty erä vai manuaalinen oikaisu. */
export type VarastomuutosTyyppi = "taydennys" | "korjaus";
export type KayttajaRooli = "admin" | "maalaaja";
export type MaaliTyyppi =
  | "solid"
  | "transparent"
  | "candy"
  | "illusion"
  | "metallic"
  | "tekstuuri"
  | "kuumankesto"
  | "pohjavari"
  | "muu";
export type ToinenVariRooli = "pohjavari" | "lakka";
// Silmämääräinen värisävy suodatusta varten - ei koske lakkoja (transparent),
// koska ne ovat kirkkaita eikä niillä ole omaa sävyä.
export type Varisavy =
  | "punainen"
  | "oranssi"
  | "keltainen"
  | "vihrea"
  | "sininen"
  | "liila"
  | "pinkki"
  | "musta"
  | "harmaa"
  | "valkoinen"
  | "hopea"
  | "kultainen"
  | "bronssi"
  | "ruskea";
// Kategoriahinnoiteltavat tyypit: myydään aina omana työnä (ei topcoat-lisänä).
export type MyytavaMaaliTyyppi = "solid" | "metallic" | "candy" | "illusion";
/**
 * Työn kulku: vastaanotettu (osat tuotu, maali varattu) -> vaiheessa
 * (maalaus käynnissä) -> valmis (maali kulutettu).
 */
export type TyonTila = "vastaanotettu" | "vaiheessa" | "valmis";

/** Peruutuksen syy: valmiit vaihtoehdot ja vapaa teksti ("muu"). */
export type PeruutuksenSyy = "asiakas" | "virhe" | "muu";

type EiSuhteita = [];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: KayttajaRooli;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: KayttajaRooli;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: KayttajaRooli;
          created_at?: string;
        };
        Relationships: EiSuhteita;
      };
      asetukset: {
        Row: {
          id: boolean;
          oletus_halytysraja_g: number;
          tullimaksu_prosentti_oletus: number;
          alv_prosentti_oletus: number;
          /** Kate-% EU-väreille (ja oletus kun alkuperää ei tiedetä). */
          kate_prosentti_oletus: number;
          /** Kate-% EU:n ulkopuolelta tilatuille väreille. */
          kate_prosentti_ei_eu_oletus: number;
          /** Monenko päivän jälkeen vastaanotettu työ on kiireellinen. */
          vastaanotto_varoitus_paivat: number;
          /** Monenko päivän jälkeen vastaanotettu työ on myöhässä. */
          vastaanotto_kriittinen_paivat: number;
          nayta_hinnat_maalaajalle: boolean;
          yleinen_tuntihinta: number;
          yrityksen_osoite: string | null;
          toimituskulu_per_kg_eu_oletus: number;
          toimituskulu_per_kg_usa_oletus: number;
          toimituskulu_per_kg_muu_oletus: number;
          /** Lähetetäänkö sähköposti kun väri menee hälytysrajan alle. */
          halytys_ilmoitukset_kaytossa: boolean;
          /** Vastaanottajat pilkulla eroteltuna. */
          halytys_ilmoitus_sahkoposti: string | null;
          /** Lähettäjä muodossa "Nimi <osoite>". */
          halytys_ilmoitus_lahettaja: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["asetukset"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["asetukset"]["Row"]>;
        Relationships: EiSuhteita;
      };
      varit: {
        Row: {
          id: string;
          nimi: string;
          valmistaja: string | null;
          alkupera: Alkupera;
          ostohinta_per_kg: number;
          tullimaksu_prosentti: number | null;
          alv_prosentti: number | null;
          toimituskulu_per_kg: number | null;
          myyja_linkki: string | null;
          kuva_url: string | null;
          ohjeet: string | null;
          ohje_tiedosto_url: string | null;
          kiiltoaste: string | null;
          tyyppi: MaaliTyyppi;
          vaatii_pohjavarin: boolean;
          /** Tarvitseeko väri erillisen lakkauksen (esim. UV-suoja ulkokäyttöön). */
          vaatii_lakkauksen: boolean;
          pohjavari_kuvaus: string | null;
          alkuperainen_hinta: number | null;
          alkuperainen_valuutta: string | null;
          alkuperainen_yksikko: string | null;
          hintalisa_prosentti: number;
          varattu_g: number;
          saldo_g: number;
          halytysraja_g: number | null;
          varisavy: Varisavy | null;
          aktiivinen: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["varit"]["Row"]> & {
          nimi: string;
          ostohinta_per_kg: number;
        };
        Update: Partial<Database["public"]["Tables"]["varit"]["Row"]>;
        Relationships: EiSuhteita;
      };
      ajoneuvotyypit: {
        Row: {
          avain: string;
          nimi: string;
          jarjestys: number;
        };
        Insert: Partial<Database["public"]["Tables"]["ajoneuvotyypit"]["Row"]> & {
          avain: string;
          nimi: string;
        };
        Update: Partial<Database["public"]["Tables"]["ajoneuvotyypit"]["Row"]>;
        Relationships: EiSuhteita;
      };
      osat: {
        Row: {
          id: string;
          nimi: string;
          ajoneuvotyyppi: AjoneuvoTyyppi;
          lisatiedot: string | null;
          /** Vapaat hakusanat osahakua varten. Ei näytetä listassa. */
          hakusanat: string | null;
          vari_tyyppi: VariTyyppi;
          arvioitu_kulutus_g: number | null;
          kuva_url: string | null;
          kate_prosentti: number | null;
          kate_kiintea: number | null;
          manuaalinen_hinta: number | null;
          lakkaus_lisahinta: number | null;
          lakkaus_kulutus_g: number | null;
          aktiivinen: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["osat"]["Row"]> & {
          nimi: string;
          ajoneuvotyyppi: AjoneuvoTyyppi;
        };
        Update: Partial<Database["public"]["Tables"]["osat"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "osat_ajoneuvotyyppi_fkey";
            columns: ["ajoneuvotyyppi"];
            isOneToOne: false;
            referencedRelation: "ajoneuvotyypit";
            referencedColumns: ["avain"];
          },
        ];
      };
      osa_tyovaiheet: {
        Row: {
          id: string;
          osa_id: string;
          vaihe: TyoVaihe;
          tarvitaan: boolean;
          arvioitu_kesto_min: number;
        };
        Insert: Partial<Database["public"]["Tables"]["osa_tyovaiheet"]["Row"]> & {
          osa_id: string;
          vaihe: TyoVaihe;
        };
        Update: Partial<Database["public"]["Tables"]["osa_tyovaiheet"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "osa_tyovaiheet_osa_id_fkey";
            columns: ["osa_id"];
            isOneToOne: false;
            referencedRelation: "osat";
            referencedColumns: ["id"];
          },
        ];
      };
      tuntiveloitukset: {
        Row: {
          id: string;
          vaihe: TyoVaihe | null;
          tuntihinta: number;
        };
        Insert: Partial<Database["public"]["Tables"]["tuntiveloitukset"]["Row"]> & {
          tuntihinta: number;
        };
        Update: Partial<Database["public"]["Tables"]["tuntiveloitukset"]["Row"]>;
        Relationships: EiSuhteita;
      };
      maalaustapahtumat: {
        Row: {
          id: string;
          osa_id: string;
          vari_id: string;
          kappalemaara: number;
          arvioitu_kulutus_g: number;
          toteutunut_kulutus_g: number;
          kayttaja_id: string | null;
          luotu: string;
          toinen_vari_id: string | null;
          toinen_vari_rooli: ToinenVariRooli | null;
          toinen_arvioitu_kulutus_g: number | null;
          toinen_toteutunut_kulutus_g: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["maalaustapahtumat"]["Row"]> & {
          osa_id: string;
          vari_id: string;
          kappalemaara: number;
        };
        Update: Partial<Database["public"]["Tables"]["maalaustapahtumat"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "maalaustapahtumat_osa_id_fkey";
            columns: ["osa_id"];
            isOneToOne: false;
            referencedRelation: "osat";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maalaustapahtumat_vari_id_fkey";
            columns: ["vari_id"];
            isOneToOne: false;
            referencedRelation: "varit";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maalaustapahtumat_toinen_vari_id_fkey";
            columns: ["toinen_vari_id"];
            isOneToOne: false;
            referencedRelation: "varit";
            referencedColumns: ["id"];
          },
        ];
      };
      varastotayennykset: {
        Row: {
          id: string;
          vari_id: string;
          /** Muutos grammoina. Korjaus voi olla negatiivinen, täydennys ei. */
          maara_g: number;
          tyyppi: VarastomuutosTyyppi;
          kayttaja_id: string | null;
          luotu: string;
        };
        Insert: Partial<Database["public"]["Tables"]["varastotayennykset"]["Row"]> & {
          vari_id: string;
          maara_g: number;
        };
        Update: Partial<Database["public"]["Tables"]["varastotayennykset"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "varastotayennykset_vari_id_fkey";
            columns: ["vari_id"];
            isOneToOne: false;
            referencedRelation: "varit";
            referencedColumns: ["id"];
          },
        ];
      };
      vari_kategoriat: {
        Row: {
          id: string;
          vari_id: string;
          maali_tyyppi: MaaliTyyppi;
        };
        Insert: Partial<Database["public"]["Tables"]["vari_kategoriat"]["Row"]> & {
          vari_id: string;
          maali_tyyppi: MaaliTyyppi;
        };
        Update: Partial<Database["public"]["Tables"]["vari_kategoriat"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "vari_kategoriat_vari_id_fkey";
            columns: ["vari_id"];
            isOneToOne: false;
            referencedRelation: "varit";
            referencedColumns: ["id"];
          },
        ];
      };
      osa_kategoriahinnat: {
        Row: {
          id: string;
          osa_id: string;
          maali_tyyppi: MyytavaMaaliTyyppi;
          /** Kiinteä asiakashinta lakkaamattomalle työlle. Null = hinta lasketaan. */
          hinta: number | null;
          /** Kiinteä asiakashinta kun työhön kuuluu lakkaus. Null = käytä hinta-saraketta. */
          hinta_lakattu: number | null;
          arvioitu_kulutus_g: number;
          toinen_arvioitu_kulutus_g: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["osa_kategoriahinnat"]["Row"]> & {
          osa_id: string;
          maali_tyyppi: MyytavaMaaliTyyppi;
          arvioitu_kulutus_g: number;
        };
        Update: Partial<Database["public"]["Tables"]["osa_kategoriahinnat"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "osa_kategoriahinnat_osa_id_fkey";
            columns: ["osa_id"];
            isOneToOne: false;
            referencedRelation: "osat";
            referencedColumns: ["id"];
          },
        ];
      };
      arkistoidut_tyot: {
        Row: {
          id: string;
          asiakas: string | null;
          aloitti_id: string | null;
          aloitettu: string;
          valmistui_id: string | null;
          valmistunut: string | null;
          alennus_prosentti: number;
          arkistoitu: string;
          /** Kuka arkistoi. Null = automaattinen arkistointi. */
          arkistoi_id: string | null;
          automaattinen: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["arkistoidut_tyot"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["arkistoidut_tyot"]["Row"]>;
        Relationships: EiSuhteita;
      };
      arkistoidut_tyon_rivit: {
        Row: {
          id: string;
          tyo_id: string;
          osa_id: string;
          vari_id: string;
          kappalemaara: number;
          arvioitu_kulutus_g: number;
          yksikkohinta_eur: number;
          toteutunut_kulutus_g: number | null;
          toinen_vari_id: string | null;
          toinen_vari_rooli: ToinenVariRooli | null;
          toinen_arvioitu_kulutus_g: number | null;
          toinen_toteutunut_kulutus_g: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["arkistoidut_tyon_rivit"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["arkistoidut_tyon_rivit"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "arkistoidut_tyon_rivit_tyo_id_fkey";
            columns: ["tyo_id"];
            isOneToOne: false;
            referencedRelation: "arkistoidut_tyot";
            referencedColumns: ["id"];
          },
        ];
      };
      tyot: {
        Row: {
          id: string;
          asiakas: string | null;
          tila: TyonTila;
          aloitti_id: string | null;
          /** Työn kirjausaika; vastaanotetulla työllä vastaanottohetki. */
          aloitettu: string;
          /** Milloin maalaus aloitettiin. */
          tyo_aloitettu: string | null;
          vastaanotti_id: string | null;
          valmistui_id: string | null;
          valmistunut: string | null;
          alennus_prosentti: number;
        };
        Insert: Partial<Database["public"]["Tables"]["tyot"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["tyot"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "tyot_aloitti_id_fkey";
            columns: ["aloitti_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tyot_valmistui_id_fkey";
            columns: ["valmistui_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tyon_peruutukset: {
        Row: {
          id: string;
          tyo_id: string;
          asiakas: string | null;
          aloitettu: string | null;
          syy: PeruutuksenSyy;
          tarkennus: string | null;
          perui_id: string | null;
          peruttu: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tyon_peruutukset"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["tyon_peruutukset"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "tyon_peruutukset_perui_id_fkey";
            columns: ["perui_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tyon_rivit: {
        Row: {
          id: string;
          tyo_id: string;
          osa_id: string;
          vari_id: string;
          toinen_vari_id: string | null;
          toinen_vari_rooli: ToinenVariRooli | null;
          kappalemaara: number;
          arvioitu_kulutus_g: number;
          toinen_arvioitu_kulutus_g: number | null;
          toteutunut_kulutus_g: number | null;
          toinen_toteutunut_kulutus_g: number | null;
          /** Onko rivin varaus jo purettu (työ valmistunut). */
          varaus_purettu: boolean;
          yksikkohinta_eur: number;
        };
        Insert: Partial<Database["public"]["Tables"]["tyon_rivit"]["Row"]> & {
          tyo_id: string;
          osa_id: string;
          vari_id: string;
          arvioitu_kulutus_g: number;
          yksikkohinta_eur: number;
        };
        Update: Partial<Database["public"]["Tables"]["tyon_rivit"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "tyon_rivit_tyo_id_fkey";
            columns: ["tyo_id"];
            isOneToOne: false;
            referencedRelation: "tyot";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tyon_rivit_osa_id_fkey";
            columns: ["osa_id"];
            isOneToOne: false;
            referencedRelation: "osat";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tyon_rivit_vari_id_fkey";
            columns: ["vari_id"];
            isOneToOne: false;
            referencedRelation: "varit";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tyon_rivit_toinen_vari_id_fkey";
            columns: ["toinen_vari_id"];
            isOneToOne: false;
            referencedRelation: "varit";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      varien_suosio: {
        Row: {
          vari_id: string;
          kayttokerrat: number;
        };
        Relationships: EiSuhteita;
      };
      varit_halytykset: {
        Row: Database["public"]["Tables"]["varit"]["Row"] & {
          efektiivinen_halytysraja_g: number;
        };
        Relationships: EiSuhteita;
      };
      maalinkulutus_raportoituna: {
        Row: {
          id: string;
          luotu: string;
          paiva: string;
          viikko: string;
          kuukausi: string;
          vuosi: string;
          osa_id: string;
          osa_nimi: string;
          vari_id: string;
          vari_nimi: string;
          /** Missä roolissa väri käytettiin: pääväri, pohjaväri vai lakka. */
          rooli: "paavari" | ToinenVariRooli | "toinen";
          kappalemaara: number;
          toteutunut_kulutus_g: number;
          toteutunut_kulutus_kg: number;
          maalikustannus_eur: number;
          kayttaja_id: string | null;
        };
        Relationships: EiSuhteita;
      };
    };
    Functions: {
      haku: {
        Args: { p_kysely: string; p_raja?: number };
        Returns: {
          tyyppi: "vari" | "osa";
          id: string;
          otsikko: string;
          alaotsikko: string;
          osuvuus: number;
        }[];
      };
      korvaa_tyon_rivit: {
        Args: { p_tyo_id: string; p_rivit: unknown };
        Returns: undefined;
      };
      peru_tyo: {
        Args: { p_tyo_id: string; p_syy: PeruutuksenSyy; p_tarkennus?: string | null };
        Returns: undefined;
      };
      palauta_tyo_keskeneraiseksi: {
        Args: { p_tyo_id: string };
        Returns: undefined;
      };
      poista_valmis_tyo: {
        Args: { p_tyo_id: string; p_syy: PeruutuksenSyy; p_tarkennus?: string | null };
        Returns: undefined;
      };
      arkistoi_tyo: {
        Args: { p_tyo_id: string; p_automaattinen?: boolean };
        Returns: undefined;
      };
      kuukauden_kaytetyin_vari: {
        Args: { p_kuukausi?: string };
        Returns: {
          vari_id: string;
          vari_nimi: string;
          yhteensa_g: number;
          yhteensa_kg: number;
          tapahtumia: number;
        }[];
      };
      vari_kokonaishinta: {
        Args: { p_vari_id: string };
        Returns: number;
      };
      vari_halytysraja: {
        Args: { p_vari_id: string };
        Returns: number;
      };
      osa_tyoaika_min: {
        Args: { p_osa_id: string };
        Returns: number;
      };
      osa_tyokustannus: {
        Args: { p_osa_id: string };
        Returns: number;
      };
      osa_maalikustannus: {
        Args: { p_osa_id: string; p_vari_id: string | null };
        Returns: number;
      };
      osa_kustannusarvio: {
        Args: { p_osa_id: string; p_vari_id?: string | null };
        Returns: number;
      };
      osan_kate: {
        Args: { p_osa_id: string; p_vari_id?: string | null; p_toinen_vari_id?: string | null };
        Returns: number;
      };
      osa_suositushinta: {
        Args: { p_osa_id: string; p_vari_id?: string | null };
        Returns: number;
      };
      aloita_vastaanotettu_tyo: {
        Args: { p_tyo_id: string };
        Returns: undefined;
      };
      aseta_resend_avain: {
        Args: { p_avain: string };
        Returns: undefined;
      };
      resend_avain_asetettu: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      laheta_halytys_testiviesti: {
        Args: Record<string, never>;
        Returns: string;
      };
      halytys_ilmoitusten_loki: {
        Args: Record<string, never>;
        Returns: {
          luotu: string;
          tyyppi: string;
          vastaanottaja: string;
          varien_maara: number;
          tila: string;
        }[];
      };
    };
  };
}
