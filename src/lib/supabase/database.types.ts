// Käsin ylläpidetyt tyypit, jotka vastaavat supabase/migrations-hakemiston
// tietokantarakennetta. Kun projektiin on kytketty oikea Supabase-projekti, nämä
// voidaan korvata komennolla:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts

export type AjoneuvoTyyppi = "auto" | "mopo" | "moottoripyora";
export type VariTyyppi =
  | "yksivarinen"
  | "candy"
  | "illusion"
  | "metallic"
  | "muu_erikois";
export type TyoVaihe = "pesu" | "maalinpoisto" | "puhallus" | "teippaus" | "maalaus";
export type Alkupera = "EU" | "USA" | "muu";
export type KayttajaRooli = "admin" | "maalaaja";

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
          kate_prosentti_oletus: number;
          nayta_hinnat_maalaajalle: boolean;
          yleinen_tuntihinta: number;
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
          toimituskulu_per_kg: number;
          myyja_linkki: string | null;
          kuva_url: string | null;
          ohjeet: string | null;
          ohje_tiedosto_url: string | null;
          saldo_g: number;
          halytysraja_g: number | null;
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
      osat: {
        Row: {
          id: string;
          nimi: string;
          ajoneuvotyyppi: AjoneuvoTyyppi;
          merkki: string | null;
          malli: string | null;
          vari_tyyppi: VariTyyppi;
          arvioitu_kulutus_g: number;
          kuva_url: string | null;
          kate_prosentti: number | null;
          kate_kiintea: number | null;
          manuaalinen_hinta: number | null;
          aktiivinen: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["osat"]["Row"]> & {
          nimi: string;
          ajoneuvotyyppi: AjoneuvoTyyppi;
        };
        Update: Partial<Database["public"]["Tables"]["osat"]["Row"]>;
        Relationships: EiSuhteita;
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
        ];
      };
      varastotayennykset: {
        Row: {
          id: string;
          vari_id: string;
          maara_g: number;
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
    };
    Views: {
      varit_halytykset: {
        Row: Database["public"]["Tables"]["varit"]["Row"] & {
          efektiivinen_halytysraja_g: number;
        };
        Relationships: EiSuhteita;
      };
      maalaustapahtumat_raportoituna: {
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
      osa_suositushinta: {
        Args: { p_osa_id: string; p_vari_id?: string | null };
        Returns: number;
      };
    };
  };
}
