/**
 * Lisätöiden laskenta.
 *
 * Puhdas moduuli ilman kantayhteyttä, samasta syystä kuin luovutus.ts ja
 * tilikausi.ts: sääntöjen on oltava ajettavissa oikealla aineistolla ilman
 * palvelinta. Käyttöliittymä ja tallennus lukevat samat luvut täältä.
 *
 * Hintaa ei lasketa täällä uudelleen: lisätyön kiinteä hinta tulee kannasta
 * osan_lisatyot-kutsun mukana, ja tämä moduuli kertoo vain kumpi kahdesta
 * hinnasta valitaan, montako kertaa se otetaan ja miten kulutus jakautuu.
 *
 * Automaattiset rivit syntyvät LÄHTEISTÄ. Lähde on joko työn pääväri tai
 * yksittäinen lisätyörivi, ja jokainen lähde voi synnyttää oman pohjaväri- ja
 * lakkarivinsä. Automaattinen rivi ei ole koskaan itse lähde: pohjavärit ovat
 * metallicia joilla vaatii_lakkauksen on tosi, joten pohja tilaisi lakan
 * itselleen vaikka candy on sen päällä pintana. Juuri tästä syntyi vika, jossa
 * kahden candy-sävyn vannekehä sai lakkauksen jota se ei tarvitse.
 */

/** Lakkarivin laajuus. Pohjaväririveillä ei ole laajuutta. */
export type LakkauksenLaajuus = "koko_osa" | "lahteen_osuus";

/** Automaattisen rivin laji. */
export type AutomaattinenLaji = "pohjavari" | "lakka";

/** Osan lisätyö voimassa olevine arvoineen, kannan osan_lisatyot-muodossa. */
export interface LisatyonPerusta {
  lisatyo_id: string;
  nimi: string;
  on_jako: boolean;
  lisakulutus_g: number;
  /** Kiinteä hinta kun lisätyön väri on solid. */
  hinta_perusvari_eur: number;
  /** Kiinteä hinta kun lisätyön väri on mikä tahansa muu. */
  hinta_erikoisvari_eur: number;
}

/** Käyttäjän valinta työn rivillä. */
export interface LisatyoValinta {
  avain: string;
  lisatyoId: string;
  variId: string;
  /** Vain ei-jaoille. Jaossa määrää ei ole. */
  maara: number;
  /** Vain jaoille. Oletus 50. */
  osuusProsentti: number;
}

/**
 * Käyttäjän muokkaus yhteen automaattiseen riviin.
 *
 * Avaimena lähde ja laji, koska sama väri voi tulla useasta lähteestä ja
 * kutakin riviä pitää voida muokata itsenäisesti.
 */
export interface AutomaattisenMuokkaus {
  /** Lähteen avain. null = työn pääväri. */
  lahdeAvain: string | null;
  laji: AutomaattinenLaji;
  /** Käyttäjän valitsema väri. Tyhjä = oletus asetuksista. */
  variId?: string;
  /** Vain lakalle. Tyhjä = lähteen mukainen oletus. */
  laajuus?: LakkauksenLaajuus;
}

/** Värin ne tiedot jotka lisätöiden laskenta tarvitsee. */
export interface VarinTiedot {
  id: string;
  nimi: string;
  /** Maalityyppi. Ratkaisee lisätyön hintakategorian: solid vai muu. */
  tyyppi: string;
  vaatii_pohjavarin: boolean;
  vaatii_lakkauksen: boolean;
  kiiltotaso: string | null;
  saldo_g: number;
  varattu_g: number;
}

/** Osan ne tiedot joita automaattiset rivit tarvitsevat. */
export interface OsanLakkaustiedot {
  lakkaus_kulutus_g: number | null;
  lakkaus_lisahinta: number | null;
  /** Pohjavärin kulutus koko osalle: osa_kategoriahinnat.toinen_arvioitu_kulutus_g. */
  pohjaKulutusG: number | null;
  /** Kategoriahinta perusvärin maalityypille, lakkauslisän johtamista varten. */
  kategoriaHinta: number | null;
  kategoriaHintaLakattu: number | null;
}

/** Yksi laskettu lisätyörivi, sellaisena kuin se tallennetaan ja näytetään. */
export interface LaskettuLisatyo {
  avain: string;
  lisatyoId: string | null;
  nimi: string;
  variId: string;
  variNimi: string;
  maara: number;
  osuusProsentti: number | null;
  kulutusG: number;
  hintaEur: number;
  /** pohjavari tai lakka kun sovellus lisäsi rivin itse. */
  automaattinen: AutomaattinenLaji | null;
  /** Automaattisella rivillä: minkä lähteen väri sen synnytti. null = pääväri. */
  lahdeAvain: string | null;
  /** Ihmisluettava lähde, esim. "Blue Morpho (jako 50 %)". */
  lahdeKuvaus: string | null;
  /** Vain lakkariveillä. */
  lakkausLaajuus: LakkauksenLaajuus | null;
  /** Onko laajuus lähteen oletus vai käyttäjän vaihtama. */
  laajuusOletus: boolean;
  /** Onko väri asetusten oletus vai käyttäjän vaihtama. */
  variOletus: boolean;
}

export type VaroituksenLaji =
  | "mattalakka"
  | "saldo"
  | "lakkausarvot_puuttuvat"
  | "perusvari_nollaan"
  | "osuudet_yli_sadan"
  | "automaattivari_puuttuu";

export interface Varoitus {
  laji: VaroituksenLaji;
  viesti: string;
}

export interface LisatoidenTulos {
  rivit: LaskettuLisatyo[];
  /** Perusvärin kulutus jakojen jälkeen. Voi olla nolla. */
  perusvarinKulutusG: number;
  /** Perusvärin osuus prosentteina, jäännöksenä laskettuna. */
  perusvarinOsuus: number;
  /** Lisätöiden hinnat yhteensä, lakkauslisä mukaan lukien. */
  hinnatYhteensaEur: number;
  /** Lakkauslisä omana lukunaan, jotta se voidaan näyttää omana rivinään. */
  lakkauslisaEur: number;
  varoitukset: Varoitus[];
  /** Kulutus väreittäin, samanväriset rivit yhdistettyinä. */
  varienKulutus: { variId: string; variNimi: string; kulutusG: number; automaattinen: boolean }[];
}

function pyorista(arvo: number): number {
  return Math.round(arvo * 100) / 100;
}

/**
 * Lisätyön kiinteä hinta valitulle värille.
 *
 * Kategoria ratkeaa lisätyön omasta väristä eikä osan kategoriasta: sama
 * logo maksaa eri verran sen mukaan maalataanko se RAL-sävyllä vai
 * candylla. Sama sääntö kuin kannan lisatyon_varikategoria-funktiossa.
 *
 * Tämä on hinnoittelua. Lakkaus- ja pohjaväritarvetta EI saa päätellä
 * tyypistä: ne luetaan aina vaatii_lakkauksen- ja vaatii_pohjavarin-
 * sarakkeista, koska candy ja illusion ovat molemmat "erikoisvärejä" mutta
 * vain illusion tarvitsee lakan.
 */
export function lisatyonHinta(perusta: LisatyonPerusta, vari: VarinTiedot): number {
  return vari.tyyppi === "solid" ? perusta.hinta_perusvari_eur : perusta.hinta_erikoisvari_eur;
}

/**
 * Lakkauslisä.
 *
 * Koskee vain lisätyön värin vaatimaa lakkausta. Päävärin lakkaus sisältyy
 * osan kategoriahintaan - candyllä ja illusionilla aina, solidilla ja
 * metallicilla hinta_lakattu-kentän kautta - joten sitä ei veloiteta erikseen.
 *
 * Kategoriahinnassa voi olla lakattu variantti (hinta_lakattu), jolloin lisä
 * johdetaan sen erotuksena. Jos lisä otettaisiin osat.lakkaus_lisahinta-
 * kentästä silloinkin, lakkaus veloitettaisiin kahdesti.
 *
 * Palauttaa null kun kumpaakaan arvoa ei ole - se on varoitus, ei nolla.
 */
export function lakkauslisa(osa: OsanLakkaustiedot): number | null {
  if (osa.kategoriaHintaLakattu !== null && osa.kategoriaHinta !== null) {
    return pyorista(Math.max(0, osa.kategoriaHintaLakattu - osa.kategoriaHinta));
  }
  if (osa.lakkaus_lisahinta !== null) return pyorista(osa.lakkaus_lisahinta);
  return null;
}

/** Lähde jolle automaattinen rivi voi syntyä. */
interface Lahde {
  /** null = työn pääväri. */
  avain: string | null;
  variId: string;
  /** Osuus osan pinnasta prosentteina. Logolla ja tekstillä null. */
  osuus: number | null;
  /** Logon ja tekstin oma kulutus. Jaolla ja päävärillä null. */
  omaKulutusG: number | null;
  /** Ihmisluettava kuvaus riville, esim. "Blue Morpho (jako 50 %)". */
  kuvaus: string;
}

/** Automaattisen rivin oletuslaajuus lähteen mukaan. */
function oletuslaajuus(lahde: Lahde): LakkauksenLaajuus {
  // Jaon reuna on jo teipattu värinvaihdon takia, joten lakan voi vetää vain
  // omalle osuudelleen. Logon reunaa ei voi teipata, joten se lakataan koko
  // osalta. Pääväri kattaa osan muutenkin.
  return lahde.osuus !== null && lahde.avain !== null ? "lahteen_osuus" : "koko_osa";
}

/**
 * Automaattisen rivin kulutus.
 *
 * Yksi sääntö molemmille rivityypeille: osan vastaava kulutus kerrottuna
 * lähteen osuudella. Logolla ja tekstillä ei ole osuutta, joten ne käyttävät
 * lisätyön omaa kulutusta - candy-logo kopassa tarvitsee kolme grammaa
 * pohjaa, ei kolmeakymmentä.
 */
function automaattinenKulutus(osanKulutusG: number | null, lahde: Lahde): number {
  if (lahde.omaKulutusG !== null) return pyorista(lahde.omaKulutusG);
  return pyorista(((osanKulutusG ?? 0) * (lahde.osuus ?? 0)) / 100);
}

/**
 * Lisätöiden kulutus, hinta ja varoitukset.
 *
 * Tavallinen lisätyö lisää kulutusta päälle: kolme pientä tekstiä samalla
 * värillä on yksi rivi määrällä kolme.
 *
 * Jaettu pinta jakaa osan kokonaiskulutuksen: 70/30 ei lisää grammoja vaan
 * siirtää niitä. Työaika ei jakaudu osuuksien mukaan - yksi raja on yksi
 * raja, ja suojaus vie saman ajan olipa jako 70/30 tai 50/50.
 */
export function laskeLisatyot(
  valinnat: LisatyoValinta[],
  perustat: LisatyonPerusta[],
  varit: VarinTiedot[],
  perusvariId: string,
  osanKulutusG: number,
  osa: OsanLakkaustiedot,
  automaattiset: {
    /** Asetusten oletuspohjaväri. */
    pohjavariId: string | null;
    /** Asetusten oletuslakka. */
    lakkaId: string | null;
    /** Käyttäjän muokkaukset automaattisiin riveihin. */
    muokkaukset?: AutomaattisenMuokkaus[];
    /**
     * Pääväri lakataan vaikka sen oma väri ei lakkausta vaadi.
     *
     * Solid ja metallic eivät vaadi lakkaa, mutta asiakas voi tilata sen
     * lisänä. Valinta on käyttäjän eikä värin ominaisuus, joten se tulee
     * erillisenä tietona eikä vaatii_lakkauksen-sarakkeesta.
     */
    lakkausPaavarille?: boolean;
  }
): LisatoidenTulos {
  const vari = (id: string) => varit.find((v) => v.id === id);
  const perusta = (id: string) => perustat.find((p) => p.lisatyo_id === id);
  const muokkaukset = automaattiset.muokkaukset ?? [];
  const muokkaus = (lahdeAvain: string | null, laji: AutomaattinenLaji) =>
    muokkaukset.find((m) => m.lahdeAvain === lahdeAvain && m.laji === laji);

  const rivit: LaskettuLisatyo[] = [];
  const varoitukset: Varoitus[] = [];
  let hinnat = 0;

  // --- Käyttäjän valitsemat lisätyöt ---
  const lahteet: Lahde[] = [];
  let jakojenOsuus = 0;

  for (const valinta of valinnat) {
    const p = perusta(valinta.lisatyoId);
    const v = vari(valinta.variId);
    if (!p || !v) continue;

    const hinta = lisatyonHinta(p, v);

    if (p.on_jako) {
      const osuus = Math.min(Math.max(valinta.osuusProsentti, 0), 100);
      jakojenOsuus += osuus;
      rivit.push({
        avain: valinta.avain,
        lisatyoId: p.lisatyo_id,
        nimi: p.nimi,
        variId: v.id,
        variNimi: v.nimi,
        maara: 1,
        osuusProsentti: osuus,
        kulutusG: pyorista((osanKulutusG * osuus) / 100),
        hintaEur: pyorista(hinta),
        automaattinen: null,
        lahdeAvain: null,
        lahdeKuvaus: null,
        lakkausLaajuus: null,
        laajuusOletus: true,
        variOletus: true,
      });
      hinnat += hinta;
      lahteet.push({
        avain: valinta.avain,
        variId: v.id,
        osuus,
        omaKulutusG: null,
        kuvaus: `${v.nimi} (jako ${osuus} %)`,
      });
    } else {
      const maara = Math.max(1, Math.round(valinta.maara));
      const kulutus = pyorista(p.lisakulutus_g * maara);
      rivit.push({
        avain: valinta.avain,
        lisatyoId: p.lisatyo_id,
        nimi: p.nimi,
        variId: v.id,
        variNimi: v.nimi,
        maara,
        osuusProsentti: null,
        kulutusG: kulutus,
        hintaEur: pyorista(hinta * maara),
        automaattinen: null,
        lahdeAvain: null,
        lahdeKuvaus: null,
        lakkausLaajuus: null,
        laajuusOletus: true,
        variOletus: true,
      });
      hinnat += hinta * maara;
      lahteet.push({
        avain: valinta.avain,
        variId: v.id,
        osuus: null,
        omaKulutusG: kulutus,
        kuvaus: `${v.nimi} (${p.nimi.toLowerCase()})`,
      });
    }
  }

  const perusvarinOsuus = pyorista(Math.max(0, 100 - jakojenOsuus));
  const perusvarinKulutusG = pyorista((osanKulutusG * perusvarinOsuus) / 100);

  if (jakojenOsuus > 100) {
    varoitukset.push({
      laji: "osuudet_yli_sadan",
      viesti: `Jakojen osuudet ovat yhteensä ${pyorista(jakojenOsuus)} %, eli yli sadan. Tallennus onnistuu silti.`,
    });
  } else if (jakojenOsuus > 0 && perusvarinOsuus === 0) {
    varoitukset.push({
      laji: "perusvari_nollaan",
      viesti:
        "Perusvärin osuus on nolla: jaot vievät koko pinnan. Tallennus onnistuu silti.",
    });
  }

  // Pääväri on lähde siinä missä lisätyöt: sen pohjaväri ja lakka syntyvät
  // samalla säännöllä ja skaalautuvat samalla osuudella.
  const perusvari = vari(perusvariId);
  if (perusvari && perusvarinOsuus > 0) {
    lahteet.unshift({
      avain: null,
      variId: perusvari.id,
      osuus: perusvarinOsuus,
      omaKulutusG: null,
      kuvaus: `${perusvari.nimi} (pääväri ${perusvarinOsuus} %)`,
    });
  }

  // --- Automaattiset pohjaväririvit ---
  // Yksi rivi jokaista pohjaa tarvitsevaa lähdettä kohti. Rivit pysyvät
  // erillisinä vaikka väri olisi sama: kumpaakin pitää voida muokata
  // itsenäisesti. Yhteenveto yhdistää ne (varienKulutus).
  const pohjaaTarvitsevat = lahteet.filter((l) => vari(l.variId)?.vaatii_pohjavarin === true);

  for (const lahde of pohjaaTarvitsevat) {
    const oma = muokkaus(lahde.avain, "pohjavari");
    const variIdRivilla = oma?.variId || automaattiset.pohjavariId;
    const pohja = variIdRivilla ? vari(variIdRivilla) : undefined;
    if (!pohja) continue;

    const kulutus = automaattinenKulutus(osa.pohjaKulutusG, lahde);
    if (kulutus <= 0) continue;

    rivit.push({
      avain: `auto-pohjavari-${lahde.avain ?? "paavari"}`,
      lisatyoId: null,
      nimi: "Pohjaväri",
      variId: pohja.id,
      variNimi: pohja.nimi,
      maara: 1,
      osuusProsentti: lahde.osuus,
      kulutusG: kulutus,
      hintaEur: 0,
      automaattinen: "pohjavari",
      lahdeAvain: lahde.avain,
      lahdeKuvaus: lahde.kuvaus,
      lakkausLaajuus: null,
      laajuusOletus: true,
      variOletus: !oma?.variId,
    });
  }

  if (pohjaaTarvitsevat.length > 0 && !vari(automaattiset.pohjavariId ?? "")) {
    const kaikillaOma = pohjaaTarvitsevat.every((l) => muokkaus(l.avain, "pohjavari")?.variId);
    if (!kaikillaOma) {
      varoitukset.push({
        laji: "automaattivari_puuttuu",
        viesti:
          "Väri vaatii pohjavärin, mutta pohjaväriä ei ole valittu. Pohjan maali jää varaamatta.",
      });
    }
  }

  if (pohjaaTarvitsevat.length > 0 && (osa.pohjaKulutusG ?? 0) <= 0) {
    varoitukset.push({
      laji: "lakkausarvot_puuttuvat",
      viesti:
        "Osan kategorialle ei ole asetettu pohjavärin kulutusta. Pohjan määrä jää arvaamatta.",
    });
  }

  // --- Automaattiset lakkarivit ---
  // Lakkaa ei päätellä värin tyypistä vaan vaatii_lakkauksen-sarakkeesta, ja
  // lähteinä ovat vain käyttäjän valitsemat värit. Automaattinen pohjaväri ei
  // ole lähde, vaikka se itse olisi lakkausta vaativa metallic: candy sen
  // päällä on pinta.
  const lakkaaTarvitsevat = lahteet.filter(
    (l) =>
      vari(l.variId)?.vaatii_lakkauksen === true ||
      // Valinnainen lakkaus koskee vain päävärin pintaa: lisätyön lakkaus
      // tulee aina sen oman värin vaatimuksesta.
      (l.avain === null && automaattiset.lakkausPaavarille === true)
  );
  let lakkauslisaEur = 0;

  if (lakkaaTarvitsevat.length > 0) {
    // Kun pääväri lakataan, lakkaus sisältyy osan kategoriahintaan eikä sitä
    // veloiteta erikseen: osa lakataan kerran, vaikka lisätyön värikin sitä
    // vaatisi. Lisä jää vain tapaukseen jossa lakkaus tulee pelkästään
    // lisätyön väristä - silloin kiinteä hinta on lakkaamattoman työn hinta.
    const paavariLakataan = lakkaaTarvitsevat.some((l) => l.avain === null);
    const lisa = paavariLakataan ? null : lakkauslisa(osa);
    const puuttuvat = [
      osa.lakkaus_kulutus_g === null ? "lakkauskulutusta" : null,
      !paavariLakataan && lisa === null ? "lakkauslisää" : null,
    ].filter((teksti): teksti is string => teksti !== null);
    if (puuttuvat.length > 0) {
      varoitukset.push({
        laji: "lakkausarvot_puuttuvat",
        viesti: `Osalle ei ole asetettu ${puuttuvat.join(
          " eikä "
        )}. Lakkaus tarvitaan silti - täydennä arvot osan tietoihin.`,
      });
    }

    let lakkaLuotu = false;
    for (const lahde of lakkaaTarvitsevat) {
      const oma = muokkaus(lahde.avain, "lakka");
      const variIdRivilla = oma?.variId || automaattiset.lakkaId;
      const lakka = variIdRivilla ? vari(variIdRivilla) : undefined;
      if (!lakka) continue;

      const laajuus = oma?.laajuus ?? oletuslaajuus(lahde);
      const kulutus =
        laajuus === "koko_osa"
          ? pyorista(osa.lakkaus_kulutus_g ?? 0)
          : automaattinenKulutus(osa.lakkaus_kulutus_g, lahde);

      rivit.push({
        avain: `auto-lakka-${lahde.avain ?? "paavari"}`,
        lisatyoId: null,
        nimi: "Lakkaus",
        variId: lakka.id,
        variNimi: lakka.nimi,
        maara: 1,
        osuusProsentti: laajuus === "lahteen_osuus" ? lahde.osuus : null,
        kulutusG: kulutus,
        // Lakkauslisä veloitetaan kerran vaikka lähteitä olisi useita, eikä
        // sitä puoliteta laajuuden mukaan: maalin osuus työn hinnasta on pieni
        // marginaali ja teippaustyö tehdään joka tapauksessa. Null tarkoittaa
        // ettei lisää veloiteta lainkaan - lakkaus on jo osan hinnassa.
        hintaEur: lakkaLuotu ? 0 : (lisa ?? 0),
        automaattinen: "lakka",
        lahdeAvain: lahde.avain,
        lahdeKuvaus: lahde.kuvaus,
        lakkausLaajuus: laajuus,
        laajuusOletus: !oma?.laajuus,
        variOletus: !oma?.variId,
      });

      if (!lakkaLuotu) {
        lakkauslisaEur = lisa ?? 0;
        hinnat += lakkauslisaEur;
        lakkaLuotu = true;
      }

      // Mattalakka vaimentaa illusionin syväefektin.
      if (lakka.kiiltotaso === "matta") {
        varoitukset.push({
          laji: "mattalakka",
          viesti: `Lakaksi on valittu ${lakka.nimi}, joka on matta. Se vaimentaa syväefektin.`,
        });
      }
    }

    if (!lakkaLuotu) {
      varoitukset.push({
        laji: "automaattivari_puuttuu",
        viesti:
          "Väri vaatii lakkauksen, mutta lakkaa ei ole valittu. Lakan maali jää varaamatta.",
      });
    }
  }

  // --- Kulutus väreittäin ---
  // Yhteenvedossa samaa väriä olevat rivit yhdistetään: kaksi 40 gramman
  // pohjaväririviä näkyy yhtenä 80 gramman eränä.
  const kulutukset = new Map<string, { variNimi: string; kulutusG: number; automaattinen: boolean }>();
  const lisaaKulutus = (id: string, nimi: string, g: number, auto: boolean) => {
    const nyt = kulutukset.get(id);
    kulutukset.set(id, {
      variNimi: nimi,
      kulutusG: pyorista((nyt?.kulutusG ?? 0) + g),
      automaattinen: (nyt?.automaattinen ?? true) && auto,
    });
  };

  if (perusvari && perusvarinKulutusG > 0) {
    lisaaKulutus(perusvari.id, perusvari.nimi, perusvarinKulutusG, false);
  }
  for (const rivi of rivit) {
    lisaaKulutus(rivi.variId, rivi.variNimi, rivi.kulutusG, rivi.automaattinen !== null);
  }

  // --- Saldovaroitukset ---
  // Vapaa saldo on saldo miinus jo varattu: muualle varattua ei voi maalata.
  for (const [id, tiedot] of kulutukset) {
    const v = vari(id);
    if (!v) continue;
    const vapaa = v.saldo_g - v.varattu_g;
    if (tiedot.kulutusG > vapaa) {
      varoitukset.push({
        laji: "saldo",
        viesti: `${v.nimi}: tarvitaan ${tiedot.kulutusG} g, vapaana ${pyorista(vapaa)} g. Tallennus onnistuu silti.`,
      });
    }
  }

  return {
    rivit,
    perusvarinKulutusG,
    perusvarinOsuus,
    hinnatYhteensaEur: pyorista(hinnat),
    lakkauslisaEur,
    varoitukset,
    varienKulutus: [...kulutukset.entries()].map(([variId, t]) => ({
      variId,
      variNimi: t.variNimi,
      kulutusG: t.kulutusG,
      automaattinen: t.automaattinen,
    })),
  };
}
