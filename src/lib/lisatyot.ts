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
 */

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

/** Osan ne tiedot jotka lakkauksen laskenta tarvitsee. */
export interface OsanLakkaustiedot {
  lakkaus_kulutus_g: number | null;
  lakkaus_lisahinta: number | null;
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
  automaattinen: "pohjavari" | "lakka" | null;
}

export type VaroituksenLaji =
  | "mattalakka"
  | "saldo"
  | "lakkausarvot_puuttuvat"
  | "perusvari_nollaan"
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
  /** Kulutus väreittäin, myös automaattiset. Yhteenvetoa varten. */
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
 * candylla. Sääntö on sama kuin kannan lisatyon_varikategoria-funktiossa.
 */
export function lisatyonHinta(perusta: LisatyonPerusta, vari: VarinTiedot): number {
  return vari.tyyppi === "solid" ? perusta.hinta_perusvari_eur : perusta.hinta_erikoisvari_eur;
}

/**
 * Lakkauslisä.
 *
 * Kategoriahinnassa on jo lakattu variantti (hinta_lakattu), joten lisä
 * johdetaan ensisijaisesti sen erotuksena. Jos lisä otettaisiin
 * osat.lakkaus_lisahinta-kentästä silloinkin kun kategorialla on lakattu
 * hinta, lakkaus veloitettaisiin kahdesti.
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

/**
 * Lisätöiden kulutus, hinta ja varoitukset.
 *
 * Kaksi eri käyttäytymistä:
 *
 * Tavallinen lisätyö lisää kulutusta päälle: kolme pientä tekstiä samalla
 * värillä on yksi rivi määrällä kolme.
 *
 * Jaettu pinta jakaa osan kokonaiskulutuksen: 70/30 ei lisää grammoja vaan
 * siirtää niitä. Työaika ei jakaudu osuuksien mukaan - yksi raja on yksi
 * raja, ja teippaus vie saman ajan olipa jako 70/30 tai 50/50.
 */
export function laskeLisatyot(
  valinnat: LisatyoValinta[],
  perustat: LisatyonPerusta[],
  varit: VarinTiedot[],
  perusvariId: string,
  osanKulutusG: number,
  osa: OsanLakkaustiedot,
  automaattiset: {
    pohjavariId: string | null;
    lakkaId: string | null;
    /**
     * Rivillä on jo lakkaus: kategoria vaatii sen (candy, illusion) tai se on
     * valittu erikseen. Silloin lakkausriviä ei lisätä eikä lakkauslisää
     * veloiteta uudelleen - osa lakataan kerran ja se on jo hinnassa.
     */
    perusrivinLakkaus: boolean;
  }
): LisatoidenTulos {
  const vari = (id: string) => varit.find((v) => v.id === id);
  const perusta = (id: string) => perustat.find((p) => p.lisatyo_id === id);

  const rivit: LaskettuLisatyo[] = [];
  const varoitukset: Varoitus[] = [];
  let hinnat = 0;

  // --- Käyttäjän valitsemat lisätyöt ---
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
      });
      hinnat += hinta;
    } else {
      const maara = Math.max(1, Math.round(valinta.maara));
      rivit.push({
        avain: valinta.avain,
        lisatyoId: p.lisatyo_id,
        nimi: p.nimi,
        variId: v.id,
        variNimi: v.nimi,
        maara,
        osuusProsentti: null,
        kulutusG: pyorista(p.lisakulutus_g * maara),
        hintaEur: pyorista(hinta * maara),
        automaattinen: null,
      });
      hinnat += hinta * maara;
    }
  }

  const perusvarinOsuus = pyorista(Math.max(0, 100 - jakojenOsuus));
  const perusvarinKulutusG = pyorista((osanKulutusG * perusvarinOsuus) / 100);

  if (jakojenOsuus > 0 && perusvarinOsuus === 0) {
    varoitukset.push({
      laji: "perusvari_nollaan",
      viesti:
        "Perusvärin osuus on nolla: jaot vievät koko pinnan. Tallennus onnistuu silti.",
    });
  }

  // --- Automaattinen pohjaväri ---
  // Pohja tulee vain sen lisätyön verran: candy-logo kopassa on kolme grammaa
  // pohjaa, ei kolmeakymmentä.
  const pohjaaTarvitsevat = rivit.filter((r) => vari(r.variId)?.vaatii_pohjavarin === true);
  if (pohjaaTarvitsevat.length > 0 && !vari(automaattiset.pohjavariId ?? "")) {
    // Ilman pohjaväriä riviä ei synny, jolloin pohjan grammat eivät varaudu
    // varastosta. Varoitus, ei este: työ on silti tehtävä.
    varoitukset.push({
      laji: "automaattivari_puuttuu",
      viesti:
        "Lisätyön väri vaatii pohjavärin, mutta pohjaväriä ei ole valittu. Pohjan maali jää varaamatta.",
    });
  }
  if (automaattiset.pohjavariId) {
    const pohja = vari(automaattiset.pohjavariId);
    const tarvitsevat = pohjaaTarvitsevat;
    const kulutus = pyorista(tarvitsevat.reduce((s, r) => s + r.kulutusG, 0));
    if (pohja && kulutus > 0) {
      rivit.push({
        avain: "auto-pohjavari",
        lisatyoId: null,
        nimi: "Pohjaväri",
        variId: pohja.id,
        variNimi: pohja.nimi,
        maara: 1,
        osuusProsentti: null,
        kulutusG: kulutus,
        hintaEur: 0,
        automaattinen: "pohjavari",
      });
    }
  }

  // --- Automaattinen lakkaus ---
  // Lakkaa ei voi vetää vain logon päälle: jos yksikin väri vaatii lakkauksen,
  // lakataan koko osa. Rivi lisätään kerran vaikka illusion-elementtejä olisi
  // useita.
  const lakattavat = rivit.filter((r) => vari(r.variId)?.vaatii_lakkauksen === true);
  let lakkauslisaEur = 0;

  if (lakattavat.length > 0 && !automaattiset.perusrivinLakkaus && !vari(automaattiset.lakkaId ?? "")) {
    varoitukset.push({
      laji: "automaattivari_puuttuu",
      viesti:
        "Lisätyön väri vaatii lakkauksen, mutta lakkaa ei ole valittu. Lakan maali jää varaamatta.",
    });
  }

  if (lakattavat.length > 0 && !automaattiset.perusrivinLakkaus && automaattiset.lakkaId) {
    const lakka = vari(automaattiset.lakkaId);
    const lisa = lakkauslisa(osa);

    if (osa.lakkaus_kulutus_g === null || lisa === null) {
      varoitukset.push({
        laji: "lakkausarvot_puuttuvat",
        viesti: `Osalle ei ole asetettu ${
          osa.lakkaus_kulutus_g === null && lisa === null
            ? "lakkauskulutusta eikä lakkauslisää"
            : osa.lakkaus_kulutus_g === null
              ? "lakkauskulutusta"
              : "lakkauslisää"
        }. Lakkaus tarvitaan silti - täydennä arvot osan tietoihin.`,
      });
    }

    if (lakka) {
      lakkauslisaEur = lisa ?? 0;
      rivit.push({
        avain: "auto-lakka",
        lisatyoId: null,
        nimi: "Lakkaus (koko osa)",
        variId: lakka.id,
        variNimi: lakka.nimi,
        maara: 1,
        osuusProsentti: null,
        kulutusG: pyorista(osa.lakkaus_kulutus_g ?? 0),
        hintaEur: lakkauslisaEur,
        automaattinen: "lakka",
      });
      hinnat += lakkauslisaEur;

      // Mattalakka vaimentaa illusionin syväefektin.
      if (lakka.kiiltotaso === "matta" && lakattavat.length > 0) {
        varoitukset.push({
          laji: "mattalakka",
          viesti: `Lakaksi on valittu ${lakka.nimi}, joka on matta. Se vaimentaa syväefektin.`,
        });
      }
    }
  }

  // --- Kulutus väreittäin ---
  const kulutukset = new Map<string, { variNimi: string; kulutusG: number; automaattinen: boolean }>();
  const lisaaKulutus = (id: string, nimi: string, g: number, auto: boolean) => {
    const nyt = kulutukset.get(id);
    kulutukset.set(id, {
      variNimi: nimi,
      kulutusG: pyorista((nyt?.kulutusG ?? 0) + g),
      automaattinen: (nyt?.automaattinen ?? true) && auto,
    });
  };

  const perusvari = vari(perusvariId);
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
