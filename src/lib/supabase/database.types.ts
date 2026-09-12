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

/**
 * Kuitin rivin määrän yksikkö.
 *
 * Prismatic ilmoittaa määrät paunoina. Ilman yksikköä paljas luku "3.000" ei
 * kerro onko kyse kolmesta kilosta vai kolmesta paunasta, eikä sitä voi
 * käyttää varastotäydennykseen.
 */
export type Yksikko = "lb" | "kg" | "g" | "l" | "ml" | "kpl" | "pkt";

/** Yksi rivi maalierää kirjattaessa: väri, määrä ja laskun tavarahinta. */
export interface MaalieranRiviSyote {
  vari_id: string;
  maara_g: number;
  tavara_eur: number;
}

/** Erän omat tiedot. Tulli ja ALV jätetään pois kun tullauspäätös puuttuu. */
export interface MaalieranSyote {
  toimittaja: string | null;
  paivays: string;
  rahti_eur: number;
  tulli_eur?: number | null;
  tuonti_alv_eur?: number | null;
  kuitti_id?: string | null;
  muistiinpano?: string | null;
}

/** Esikatselun rivi: mitä kilohinnaksi tulee ja miten keskihinta muuttuu. */
export interface MaalieranEsikatselunRivi {
  vari_id: string;
  nimi: string;
  valmistaja: string | null;
  maara_g: number;
  tavara_eur: number;
  kulut_eur: number;
  hankintahinta_per_kg: number | null;
  saldo_ennen_g: number;
  keskihinta_ennen_per_kg: number;
  keskihinta_jalkeen_per_kg: number;
}

export interface MaalieranEsikatselu {
  rivit: MaalieranEsikatselunRivi[];
  tulli_eur: number;
  tuonti_alv_eur: number;
  /** Tullit on arvattu prosenteilla, ei luettu tullauspäätökseltä. */
  tullit_arvioitu: boolean;
}

/** Varastosaldon muutoksen laji: lisätty erä vai manuaalinen oikaisu. */
export type VarastomuutosTyyppi = "taydennys" | "korjaus";
export type KayttajaRooli = "admin" | "maalaaja";

/**
 * Yksi rivi kuitin ALV-erittelytaulukosta, luettuna kuitista sellaisenaan.
 * Tallennetaan vaikka yritys ei olisi ALV-rekisterissä: täsmäytys nojaa
 * siihen, ja rekisteröitymisen tullessa ajankohtaiseksi historia on valmiina.
 */
export interface AlvErittelynRivi {
  verokanta: number;
  veroton_eur: number;
  vero_eur: number;
  verollinen_eur: number;
}
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
/**
 * Normalisoitu kiiltotaso. Kiiltoaste on vapaata valmistajatekstiä ("90 GU",
 * "High Gloss (85+ GU)", "Seidenglanz"), joten haku ja suodatus tarvitsevat
 * rinnalle kolme kiinteää tasoa. Kanta päättelee arvon kiiltoasteesta, mutta
 * admin voi ylikirjoittaa sen.
 */
export type Kiiltotaso = "kiiltava" | "satiini" | "matta";

/**
 * Kuittirivin käyttötarkoitus: mihin ostos meni, ei mikä on sen verokohtelu.
 * Kirjanpitäjä ratkaisee kohtelun.
 */
export type Kayttotarkoitus =
  | "yrityksen_tarvike"
  | "edustus"
  | "yksityisotto"
  | "henkilokunnan_tarjoilu";

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
      kululuokat: {
        Row: {
          id: string;
          nimi: string;
          jarjestys: number;
          aktiivinen: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["kululuokat"]["Row"]> & { nimi: string };
        Update: Partial<Database["public"]["Tables"]["kululuokat"]["Row"]>;
        Relationships: EiSuhteita;
      };
      kuitit: {
        Row: {
          id: string;
          toimittaja: string | null;
          paivays: string;
          /** Vain jos eri kuin laskupäivä. */
          maksupaiva: string | null;
          loppusumma_eur: number;
          lahde: "kamera" | "tiedosto" | "sahkoposti";
          /** Storage-polku, ei julkinen osoite: kuitit luetaan allekirjoitetulla linkillä. */
          tiedosto_polku: string | null;
          tiedosto_tyyppi: string | null;
          tila: "luonnos" | "tarkistettava" | "valmis";
          muistiinpano: string | null;
          /** Poiminnan lukema ALV-erittely kannoittain. */
          alv_erittely: AlvErittelynRivi[] | null;
          /** Laskun valuutta ISO-koodina. EUR-kuiteilla muunnosta ei tehdä. */
          valuutta: string;
          /** Loppusumma alkuperäisessä valuutassa, kuitilta luettuna. */
          loppusumma_valuutassa: number | null;
          /** Euroa per yksikkö laskun valuuttaa. Käytetään vain jos todellinen_eur puuttuu. */
          valuuttakurssi: number | null;
          /** Tililtä luettu todellinen euroveloitus pankkilisineen. Ensisijainen. */
          todellinen_eur: number | null;
          /** Mistä euromäärä tulee: pankki, kurssi vai sama (EUR-kuitti). */
          kurssin_lahde: "pankki" | "kurssi" | "sama" | null;
          /** Kuitti- tai laskunumero sellaisenaan. Ensisijainen kaksoiskappaletunniste. */
          tositenumero: string | null;
          /** Normalisoitu tositenumero vertailua varten. Kanta täyttää triggerillä. */
          tositenumero_norm: string | null;
          tositetyyppi: "kuitti" | "lasku" | null;
          /** Kirjanpitolain mukainen säilytysajan päättymispäivä. Kanta laskee. */
          sailytettava_asti: string;
          /** Milloin kuitti lähti kirjanpitäjälle. Sen jälkeen sitä ei voi poistaa. */
          luovutettu_at: string | null;
          /** Milloin kuitti mitätöitiin. Mitätöity ei ole summissa mukana. */
          mitatoity_at: string | null;
          /** Miksi kuitti mitätöitiin. Kulkee aina mitatoity_at:n kanssa. */
          mitatointi_syy: string | null;
          /** Latauserä, jos kuitti tuli monen kuitin lisäyksessä. */
          era_id: string | null;
          /** Lukujonon tila. */
          poiminnan_tila: "ei_luettu" | "jonossa" | "luetaan" | "luettu" | "virhe";
          poiminnan_virhe: string | null;
          poiminnan_yritykset: number;
          poiminta_alkoi_at: string | null;
          luoja_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["kuitit"]["Row"]> & { paivays: string };
        Update: Partial<Database["public"]["Tables"]["kuitit"]["Row"]>;
        Relationships: EiSuhteita;
      };
      /**
       * Kuitin kuvat ja PDF:t järjestyksessä.
       *
       * Pitkä kassakuitti ei mahdu yhteen kuvaan, joten samaan kuittiin
       * kuuluu 2-3 kuvaa. Ensimmäinen liite peilautuu triggerillä kuitin
       * tiedosto_polku-sarakkeeseen, joten vanhat kyselyt toimivat entiseen
       * tapaan.
       */
      kuitin_liitteet: {
        Row: {
          id: string;
          kuitti_id: string;
          polku: string;
          tyyppi: string;
          jarjestys: number;
          /** Tiedoston SHA-256 heksana kaksoiskappaleiden tunnistukseen. */
          tiiviste: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["kuitin_liitteet"]["Row"]> & {
          kuitti_id: string;
          polku: string;
          tyyppi: string;
        };
        Update: Partial<Database["public"]["Tables"]["kuitin_liitteet"]["Row"]>;
        Relationships: EiSuhteita;
      };
      /** Yksi latauskerta: ilman erää ei tiedä mitä 20 kuitin latauksesta onnistui. */
      kuittierat: {
        Row: {
          id: string;
          luoja_id: string | null;
          tiedostoja: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["kuittierat"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["kuittierat"]["Row"]>;
        Relationships: EiSuhteita;
      };
      kuitin_rivit: {
        Row: {
          id: string;
          kuitti_id: string;
          /** Rivin teksti sellaisenaan, lyhenteineen. */
          teksti: string;
          maara: number | null;
          brutto_eur: number;
          /** Luetaan kuitista, ei päätellä tuoteryhmästä. */
          verokanta: number | null;
          /** Rivin summa alkuperäisessä valuutassa. brutto_eur johdetaan tästä. */
          brutto_valuutassa: number | null;
          /** Määrän yksikkö. Paljas luku ei kelpaa varastotäydennykseen. */
          yksikko: Yksikko | null;
          kayttotarkoitus: Kayttotarkoitus | null;
          kululuokka_id: string | null;
          muistiinpano: string | null;
          jarjestys: number;
        };
        Insert: Partial<Database["public"]["Tables"]["kuitin_rivit"]["Row"]> & {
          kuitti_id: string;
          teksti: string;
        };
        Update: Partial<Database["public"]["Tables"]["kuitin_rivit"]["Row"]>;
        Relationships: EiSuhteita;
      };
      kuittirivin_oppi: {
        Row: {
          teksti: string;
          kayttotarkoitus: Kayttotarkoitus;
          kululuokka_id: string | null;
          paivitetty: string;
        };
        Insert: Partial<Database["public"]["Tables"]["kuittirivin_oppi"]["Row"]> & {
          teksti: string;
          kayttotarkoitus: Kayttotarkoitus;
        };
        Update: Partial<Database["public"]["Tables"]["kuittirivin_oppi"]["Row"]>;
        Relationships: EiSuhteita;
      };
      luovutukset: {
        Row: {
          id: string;
          /** Kuukauden ensimmäinen päivä. */
          kausi: string;
          tila: "koottu" | "lahetetty";
          tarkistukset: unknown | null;
          asetukset: unknown | null;
          kuitteja: number;
          kuluina_eur: number;
          yhteensa_eur: number;
          koottu_at: string;
          lahetetty_at: string | null;
          lahettaja_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["luovutukset"]["Row"]> & { kausi: string };
        Update: Partial<Database["public"]["Tables"]["luovutukset"]["Row"]>;
        Relationships: EiSuhteita;
      };
      luovutuksen_loki: {
        Row: {
          id: string;
          luovutus_id: string;
          tapahtuma: "lahetetty" | "avattu";
          asetukset: unknown | null;
          kuitti_idt: string[];
          kuitteja: number;
          kuluina_eur: number;
          kayttaja_id: string | null;
          aika: string;
        };
        Insert: Partial<Database["public"]["Tables"]["luovutuksen_loki"]["Row"]> & {
          luovutus_id: string;
          tapahtuma: "lahetetty" | "avattu";
        };
        Update: Partial<Database["public"]["Tables"]["luovutuksen_loki"]["Row"]>;
        Relationships: EiSuhteita;
      };
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
          /** Taso jolla väri katsotaan täydeksi: saldopalkin asteikon yläpää. */
          oletus_taysiraja_g: number;
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
          /** Toiminimi vai osakeyhtiö. Ohjaa kuittirivin käyttötarkoituksia. */
          yritysmuoto: "toiminimi" | "oy";
          /** Vasta työntekijöiden kanssa henkilökunnan tarjoilu on mahdollinen. */
          tyontekijoita: boolean;
          /** Vaikuttaa vain ALV-tietojen näyttämiseen - tiedot tallennetaan aina. */
          alv_rekisterissa: boolean;
          toimituskulu_per_kg_eu_oletus: number;
          toimituskulu_per_kg_usa_oletus: number;
          toimituskulu_per_kg_muu_oletus: number;
          /** Lähetetäänkö sähköposti kun väri menee hälytysrajan alle. */
          halytys_ilmoitukset_kaytossa: boolean;
          /** Vastaanottajat pilkulla eroteltuna. */
          halytys_ilmoitus_sahkoposti: string | null;
          /** Lähettäjä muodossa "Nimi <osoite>". */
          halytys_ilmoitus_lahettaja: string | null;
          /** Esitäytetty pohjaväri candy-töille. Null = ei esitäyttöä. */
          oletus_pohjavari_id: string | null;
          /** Esitäytetty lakka illusionille ja lakattavalle metallicille. */
          oletus_lakka_id: string | null;
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
          /** Normalisoitu kiiltotaso hakua ja suodatusta varten. */
          kiiltotaso: Kiiltotaso | null;
          /** Vapaat hakusanat ja synonyymit. Mukana haussa, ei näy listassa. */
          hakusanat: string | null;
          pohjavari_kuvaus: string | null;
          alkuperainen_hinta: number | null;
          alkuperainen_valuutta: string | null;
          alkuperainen_yksikko: string | null;
          varattu_g: number;
          saldo_g: number;
          halytysraja_g: number | null;
          /** Värin oma täysiraja saldopalkkiin. Null = asetusten oletus. */
          taysiraja_g: number | null;
          varisavy: Varisavy | null;
          /**
           * Värillä on vähintään yksi hinnoiteltu erä, joten ostohinta_per_kg
           * on varaston liukuva keskihinta ja sisältää rahdin ja tullit.
           * Silloin niitä ei lisätä prosenteilla uudelleen.
           */
          hinta_erista: boolean;
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
          /** Kuvan rajaus kortissa: object-position-% ja suurennus. */
          kuva_x: number;
          kuva_y: number;
          kuva_zoom: number;
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
          /** Erä johon täydennys kuuluu. Null = käsin kirjattu tai korjaus. */
          era_id: string | null;
          /** Rivin tavarahinta laskulta, ilman rahtia ja tulleja. */
          tavara_eur: number | null;
          /** Tämän erän kilohinta kaikkine kuluineen. Ei muutu jälkikäteen. */
          hankintahinta_per_kg: number | null;
          /** Värin saldo ennen tätä täydennystä; keskihinnan painotus. */
          saldo_ennen_g: number | null;
          keskihinta_ennen_per_kg: number | null;
          keskihinta_jalkeen_per_kg: number | null;
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
      /**
       * Maalin ostoerä kuluineen. Rivit ovat varastotayennykset-taulussa:
       * täydennys on samalla erän rivi, joten saldo ja hankintahinta pysyvät
       * samassa tapahtumassa.
       */
      maalierat: {
        Row: {
          id: string;
          /** Valinnainen: erän voi syöttää käsin ilman kuittia. */
          kuitti_id: string | null;
          toimittaja: string | null;
          paivays: string;
          /** Rivien tavarahintojen summa. Kanta laskee. */
          tavara_eur: number;
          /** Jaetaan riveille painon mukaan. */
          rahti_eur: number;
          /** Jaetaan arvon mukaan. Kesken olevassa erässä arvio. */
          tulli_eur: number;
          /** Jaetaan arvon mukaan. Kesken olevassa erässä arvio. */
          tuonti_alv_eur: number;
          /** kesken = tullauspäätös puuttuu ja hinta on arvio. */
          tila: "kesken" | "valmis";
          muistiinpano: string | null;
          luotu: string;
          luoja_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["maalierat"]["Row"]> & {
          paivays: string;
        };
        Update: Partial<Database["public"]["Tables"]["maalierat"]["Row"]>;
        Relationships: EiSuhteita;
      };
      /**
       * Varaston arvo tilikauden päättyessä. Yksi tilannekuva per tilikausi.
       * Luvut ovat kopioita: saldon voisi laskea historiasta, mutta hintaa ei
       * saisi mistään - ostohinta_per_kg on liukuva keskihinta.
       */
      varastotilannekuvat: {
        Row: {
          id: string;
          tilikausi_paattyi: string;
          otettu: string;
          ottaja_id: string | null;
          /** Rivien summa. Nollasaldoiset eivät kasvata tätä. */
          yhteensa_eur: number | null;
          /** Kopioitujen värien määrä, myös nollasaldoiset. */
          vareja: number | null;
          muistiinpano: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["varastotilannekuvat"]["Row"]> & {
          tilikausi_paattyi: string;
        };
        Update: Partial<Database["public"]["Tables"]["varastotilannekuvat"]["Row"]>;
        Relationships: EiSuhteita;
      };
      varastotilannekuvan_rivit: {
        Row: {
          id: string;
          tilannekuva_id: string;
          /** Kulkuyhteys värin sivulle. Raportti ei nojaa tähän. */
          vari_id: string | null;
          vari_nimi: string;
          valmistaja: string | null;
          saldo_g: number;
          hinta_per_kg: number;
          arvo_eur: number;
        };
        Insert: Partial<Database["public"]["Tables"]["varastotilannekuvan_rivit"]["Row"]> & {
          tilannekuva_id: string;
          vari_nimi: string;
          saldo_g: number;
          hinta_per_kg: number;
          arvo_eur: number;
        };
        Update: Partial<Database["public"]["Tables"]["varastotilannekuvan_rivit"]["Row"]>;
        Relationships: EiSuhteita;
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
          /** Null kun rivi on osaluettelon ulkopuolinen kohde (ks. oma_kuvaus). */
          osa_id: string | null;
          /** Osaluettelon ulkopuolisen kohteen kuvaus. Null kun osa_id on asetettu. */
          oma_kuvaus: string | null;
          vari_id: string;
          kappalemaara: number;
          arvioitu_kulutus_g: number;
          yksikkohinta_eur: number;
          toteutunut_kulutus_g: number | null;
          toinen_vari_id: string | null;
          toinen_vari_rooli: ToinenVariRooli | null;
          toinen_arvioitu_kulutus_g: number | null;
          toinen_toteutunut_kulutus_g: number | null;
          kommentti: string | null;
          custom: boolean;
          /** Päävärin €/kg lukitushetkellä. Taloustietoa: maalaaja ei saa lukea. */
          vari_hinta_per_kg: number | null;
          /** Pohjavärin tai lakan €/kg lukitushetkellä. Taloustietoa. */
          toinen_vari_hinta_per_kg: number | null;
          /** Rivin maalikustannus lukituilla hinnoilla. Taloustietoa. */
          maalikustannus_eur: number | null;
          /** Milloin hinta lukittiin. Taloustietoa. */
          hinta_lukittu_at: string | null;
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
      tyon_rivin_lisavarit: {
        Row: {
          id: string;
          rivi_id: string;
          vari_id: string;
          arvioitu_kulutus_g: number;
          toteutunut_kulutus_g: number | null;
          /** Onko varaus jo purettu (työ valmistunut). */
          varaus_purettu: boolean;
          jarjestys: number;
          /** Lisävärin €/kg lukitushetkellä. Taloustietoa: maalaaja ei saa lukea. */
          vari_hinta_per_kg: number | null;
          /** Lisävärin maalikustannus lukitulla hinnalla. Taloustietoa. */
          maalikustannus_eur: number | null;
          /** Milloin hinta lukittiin; null = yhä auki. Taloustietoa. */
          hinta_lukittu_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["tyon_rivin_lisavarit"]["Row"]> & {
          rivi_id: string;
          vari_id: string;
          arvioitu_kulutus_g: number;
        };
        Update: Partial<Database["public"]["Tables"]["tyon_rivin_lisavarit"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "tyon_rivin_lisavarit_rivi_id_fkey";
            columns: ["rivi_id"];
            isOneToOne: false;
            referencedRelation: "tyon_rivit";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tyon_rivin_lisavarit_vari_id_fkey";
            columns: ["vari_id"];
            isOneToOne: false;
            referencedRelation: "varit";
            referencedColumns: ["id"];
          },
        ];
      };
      arkistoidut_rivin_lisavarit: {
        Row: {
          id: string;
          rivi_id: string;
          vari_id: string;
          arvioitu_kulutus_g: number;
          toteutunut_kulutus_g: number | null;
          jarjestys: number;
          /** Lisävärin €/kg lukitushetkellä. Taloustietoa: maalaaja ei saa lukea. */
          vari_hinta_per_kg: number | null;
          /** Lisävärin maalikustannus lukitulla hinnalla. Taloustietoa. */
          maalikustannus_eur: number | null;
          /** Milloin hinta lukittiin. Taloustietoa. */
          hinta_lukittu_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["arkistoidut_rivin_lisavarit"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["arkistoidut_rivin_lisavarit"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "arkistoidut_rivin_lisavarit_rivi_id_fkey";
            columns: ["rivi_id"];
            isOneToOne: false;
            referencedRelation: "arkistoidut_tyon_rivit";
            referencedColumns: ["id"];
          },
        ];
      };
      tyon_rivit: {
        Row: {
          id: string;
          tyo_id: string;
          /** Null kun rivi on osaluettelon ulkopuolinen kohde (ks. oma_kuvaus). */
          osa_id: string | null;
          /** Osaluettelon ulkopuolisen kohteen kuvaus, esim. "oma venekoppa". */
          oma_kuvaus: string | null;
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
          /** Custom-työn selite, esim. "50/50 vanteet". */
          kommentti: string | null;
          /** Kulutus ja hinta säädetty käsin, eivät seuraa kategorian oletuksia. */
          custom: boolean;
          /** Päävärin €/kg lukitushetkellä. Taloustietoa: maalaaja ei saa lukea. */
          vari_hinta_per_kg: number | null;
          /** Pohjavärin tai lakan €/kg lukitushetkellä. Taloustietoa. */
          toinen_vari_hinta_per_kg: number | null;
          /** Rivin maalikustannus lukituilla hinnoilla. Taloustietoa. */
          maalikustannus_eur: number | null;
          /** Milloin hinta lukittiin; null = rivi on yhä auki. Taloustietoa. */
          hinta_lukittu_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["tyon_rivit"]["Row"]> & {
          tyo_id: string;
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
      kulut_kuukausittain: {
        Row: {
          kuukausi: string;
          /** Yrityksen kuluna: yksityisotot ja luokittelemattomat pois. */
          kuluina_eur: number | null;
          /** Kuittien koko summa, täsmäytystä varten. */
          yhteensa_eur: number;
          kuitteja: number;
          luokittelemattomia: number;
        };
        Relationships: EiSuhteita;
      };
      varien_suosio: {
        Row: {
          vari_id: string;
          kayttokerrat: number;
        };
        Relationships: EiSuhteita;
      };
      /**
       * Värin erätäydennykset hintoineen: milloin, paljonko, millä
       * kilohinnalla ja mikä keskihinta siitä seurasi. Vain adminille -
       * hintasarakkeet on peruttu itse taulusta, joten tämä on niiden ainoa
       * lukutie sovelluksessa.
       */
      varin_erahistoria: {
        Row: {
          id: string;
          vari_id: string;
          era_id: string;
          maara_g: number;
          tavara_eur: number | null;
          hankintahinta_per_kg: number | null;
          saldo_ennen_g: number | null;
          keskihinta_ennen_per_kg: number | null;
          keskihinta_jalkeen_per_kg: number | null;
          luotu: string;
          toimittaja: string | null;
          paivays: string;
          tila: "kesken" | "valmis";
          rahti_eur: number;
          tulli_eur: number;
          tuonti_alv_eur: number;
        };
        Relationships: EiSuhteita;
      };
      /**
       * Värit sovellukselle. Hintasarakkeet ovat NULL muulle kuin adminille,
       * joten sama kysely kelpaa molemmille rooleille - näytettävä hinta
       * ratkaistaan roolista, ei tästä.
       */
      varit_nakyma: {
        Row: Omit<
          Database["public"]["Tables"]["varit"]["Row"],
          | "ostohinta_per_kg"
          | "tullimaksu_prosentti"
          | "alv_prosentti"
          | "toimituskulu_per_kg"
          | "alkuperainen_hinta"
          | "alkuperainen_valuutta"
          | "alkuperainen_yksikko"
        > & {
          ostohinta_per_kg: number | null;
          tullimaksu_prosentti: number | null;
          alv_prosentti: number | null;
          toimituskulu_per_kg: number | null;
          alkuperainen_hinta: number | null;
          alkuperainen_valuutta: string | null;
          alkuperainen_yksikko: string | null;
        };
        Relationships: EiSuhteita;
      };
      /** Hälytyslista on maalaajan työkalu, joten siinä ei ole hintasarakkeita. */
      varit_halytykset: {
        Row: Omit<
          Database["public"]["Tables"]["varit"]["Row"],
          | "ostohinta_per_kg"
          | "tullimaksu_prosentti"
          | "alv_prosentti"
          | "toimituskulu_per_kg"
          | "alkuperainen_hinta"
          | "alkuperainen_valuutta"
          | "alkuperainen_yksikko"
        > & {
          efektiivinen_halytysraja_g: number;
        };
        Relationships: EiSuhteita;
      };
      tyojen_talous: {
        Row: {
          tyo_id: string;
          asiakas: string | null;
          aloitettu: string;
          valmistunut: string | null;
          /** Valmistumishetki, tai aloitus jos valmistumista ei ole kirjattu. */
          ajankohta: string;
          kuukausi: string;
          vuosi: string;
          aloitti_id: string | null;
          valmistui_id: string | null;
          arkistoitu: boolean;
          riveja: number;
          alennus_prosentti: number;
          valisumma_eur: number;
          alennus_eur: number;
          loppusumma_eur: number;
          maalikustannus_eur: number;
          kate_eur: number;
          kulutus_g: number;
          kulutus_kg: number;
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
          /** Vain adminille; maalaajalle NULL. */
          maalikustannus_eur: number | null;
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
      luovutuksen_tarkistukset: {
        Args: { p_kausi: string };
        /** LuovutuksenTarkistukset-muotoinen jsonb (ks. src/lib/luovutus.ts). */
        Returns: unknown;
      };
      kokoa_luovutus: {
        Args: { p_kausi: string };
        Returns: unknown;
      };
      laheta_luovutus: {
        Args: { p_kausi: string; p_asetukset: unknown };
        Returns: unknown;
      };
      avaa_luovutus: {
        Args: { p_kausi: string };
        Returns: undefined;
      };
      kuitin_kaksoiskappaleet: {
        Args: { p_kuitti_id: string };
        Returns: {
          id: string;
          toimittaja: string | null;
          paivays: string;
          loppusumma_eur: number;
          tositenumero: string | null;
          /** Epäilyn varmuustaso, ks. lib/kulut.ts. */
          varmuus: "sama_numero" | "samankaltainen" | "numerot_eroavat";
        }[];
      };
      paivita_kuitin_eurot: {
        Args: { p_kuitti_id: string };
        Returns: undefined;
      };
      /**
       * Kopioi aktiivisten värien saldot ja kilohinnat tilikauden
       * tilannekuvaksi. Uudelleenotto korvaa saman tilikauden vanhan kuvan.
       */
      ota_varastotilannekuva: {
        Args: { p_tilikausi_paattyi: string; p_muistiinpano?: string | null };
        /** Uuden tilannekuvan tunniste. */
        Returns: string;
      };
      /** Kirjaa maalierän riveineen ja päivittää värien keskihinnan. */
      luo_maaliera: {
        Args: { p_era: MaalieranSyote; p_rivit: MaalieranRiviSyote[] };
        /** Uuden erän tunniste. */
        Returns: string;
      };
      /** Tullauspäätöksen luvut kesken olleelle erälle. */
      viimeistele_maaliera: {
        Args: { p_era_id: string; p_tulli_eur: number; p_tuonti_alv_eur: number };
        Returns: undefined;
      };
      /** Erän kilohinnat ja niistä seuraavat keskihinnat tallentamatta mitään. */
      esikatsele_maaliera: {
        Args: {
          p_rivit: MaalieranRiviSyote[];
          p_rahti_eur?: number;
          p_tulli_eur?: number | null;
          p_tuonti_alv_eur?: number | null;
        };
        Returns: MaalieranEsikatselu;
      };
      luo_kuittiera: {
        Args: { p_tiedostoja: number };
        /** Uuden erän tunniste. */
        Returns: string;
      };
      mitatoi_kuitti: {
        Args: { p_kuitti_id: string; p_syy: string };
        Returns: undefined;
      };
      poista_kuittiera: {
        Args: { p_era_id: string };
        /** Poistettujen tiedostojen polut Storagen siivousta varten. */
        Returns: string[];
      };
      poista_kuitti_pysyvasti: {
        Args: { p_kuitti_id: string };
        /** Poistetun kuitin tiedostopolut Storagen siivousta varten. */
        Returns: string[];
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
      /** Käyttäjät joilla on vahvistettu kaksivaiheinen tunnistus. Vain adminille. */
      kaksivaiheiset_kayttajat: {
        Args: Record<string, never>;
        Returns: string[];
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
