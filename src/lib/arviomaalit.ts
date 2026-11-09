/**
 * Arviolomakkeen maalilista.
 *
 * Puhdas moduuli ilman kantayhteyttä, samasta syystä kuin lisatyot.ts:
 * säännöt on voitava ajaa oikealla aineistolla ilman palvelinta.
 *
 * Arviolomake on se lomake jolla kirjataan Muu kohde (ei osaluettelossa) tai
 * luettelo-osa omalla arviolla. Siinä ei ole kategoriahintaa eikä osan
 * esitäyttöjä, joten kaikki grammat tulevat maalaajalta. Lista on yksi ja
 * sama: päämaali, käyttäjän lisäämät maalit ja niistä johdetut automaattiset
 * pohjaväri- ja lakkarivit.
 *
 * Miksi tämä on eri moduuli kuin lisatyot.ts: siellä automaattiset rivit
 * syntyvät osan kategoriakulutuksesta ja jakojen osuuksista, ja lakan laajuus
 * ratkeaa viereisen pinnan väristä. Arviolomakkeella ei ole kategoriaa,
 * osuuksia eikä jakoja - on vain lista maaleja ja grammoja. Saman moottorin
 * venyttäminen molempiin tarkoitti käytännössä sitä, että Muu kohde varasi
 * lakkaa nolla grammaa ja neuvoi täydentämään arvon osan tietoihin, jota ei
 * ole olemassa.
 */

/** Rivin rooli listassa. */
export type MaalinRooli = "paamaali" | "lisamaali" | "pohjavari" | "lakka";

/** Käyttäjän oma maalirivi: päämaali tai lisätty maali. */
export interface ArvionMaali {
  /** Päämaalilla PAAMAALIN_AVAIN, lisätyillä juokseva avain. */
  avain: string;
  variId: string;
  /** Kenttään kirjoitettu arvo sellaisenaan. Tyhjä = ei grammoja. */
  kulutus: string;
}

/**
 * Käyttäjän muokkaus yhteen automaattiseen riviin.
 *
 * Avain on automaattisen rivin oma avain (ks. lakanAvain, pohjanAvain), ei
 * lähteen: sama lähde voi synnyttää sekä pohjan että lakan.
 */
export interface AutomaatinSaato {
  avain: string;
  /** Käyttäjän valitsema väri. Tyhjä = asetusten oletus. */
  variId?: string;
  /** Käyttäjän kirjoittamat grammat. Asetettuna rivi ei enää seuraa lähdettä. */
  kulutus?: string;
  /** Rivi on poistettu ✕:llä. Varoitetaan, ei estetä. */
  poistettu?: boolean;
}

/** Värin ne tiedot joita arviolomake tarvitsee. */
export interface ArvionVari {
  id: string;
  nimi: string;
  vaatii_pohjavarin: boolean;
  vaatii_lakkauksen: boolean;
  saldo_g: number;
  varattu_g: number;
}

/** Yksi rivi maalilistassa, sellaisena kuin se näytetään ja tallennetaan. */
export interface ArvionMaaliRivi {
  avain: string;
  rooli: MaalinRooli;
  variId: string;
  variNimi: string;
  /** Kenttään näytettävä arvo. Automaattisella rivillä seuraa lähdettä. */
  kulutusSyote: string;
  kulutusG: number;
  automaattinen: boolean;
  /** Automaattisen rivin grammat on kirjoitettu käsin. */
  muokattu: boolean;
  /** Minkä maalirivin takia automaattinen rivi syntyi. */
  lahdeAvain: string | null;
  lahdeNimi: string | null;
}

export type ArvionVaroituksenLaji =
  | "lakka_puuttuu"
  | "pohja_puuttuu"
  | "kulutus_nolla"
  | "saldo";

export interface ArvionVaroitus {
  laji: ArvionVaroituksenLaji;
  viesti: string;
}

export interface ArvionTulos {
  rivit: ArvionMaaliRivi[];
  /** Kaikkien rivien grammat yhteensä. */
  kulutusYhteensaG: number;
  varoitukset: ArvionVaroitus[];
}

/** Päämaalin avain listassa. Vakio, koska rivi on aina olemassa. */
export const PAAMAALIN_AVAIN = "paamaali";

/** Lakkarivejä on yksi per kohde, joten avain on vakio. */
export const LAKAN_AVAIN = "auto-lakka";

/** Pohjaväririvin avain: yksi per maali joka pohjaa tarvitsee. */
export function pohjanAvain(lahdeAvain: string): string {
  return `auto-pohjavari-${lahdeAvain}`;
}

function pyorista(arvo: number): number {
  return Math.round(arvo * 100) / 100;
}

/** Tyhjä tai kelvoton syöte on nolla grammaa - ei arvausta, vaan varoitus. */
export function grammat(syote: string): number {
  const luku = Number((syote ?? "").replace(",", "."));
  return (syote ?? "").trim() !== "" && Number.isFinite(luku) && luku >= 0 ? pyorista(luku) : 0;
}

/**
 * Arviolomakkeen maalilista automaattisine riveineen.
 *
 * Lakkaus ja pohjaväri luetaan aina varit-taulun sarakkeista
 * (vaatii_lakkauksen, vaatii_pohjavarin), ei värin tyypistä: candy ja
 * illusion ovat molemmat erikoisvärejä, mutta vain illusion tarvitsee lakan.
 *
 * Pohjaroolissa olevaa maalia ei tarkisteta lakan osalta. Super Chrome Plus
 * candyn pohjana ei vaadi lakkaa, koska se jää candyn alle - se olisi
 * tilannut lakan itselleen, ja juuri siitä syntyi vika jossa kahden candyn
 * vannekehä sai lakkauksen jota se ei tarvitse.
 */
export function laskeArvionMaalit({
  maalit,
  saadot,
  varit,
  oletusPohjavariId,
  oletusLakkaId,
  osanLakkausKulutusG,
}: {
  /** Ensimmäinen on päämaali, loput käyttäjän lisäämiä. */
  maalit: ArvionMaali[];
  saadot: AutomaatinSaato[];
  varit: ArvionVari[];
  /** asetukset.oletus_pohjavari_id. */
  oletusPohjavariId: string | null;
  /** asetukset.oletus_lakka_id. */
  oletusLakkaId: string | null;
  /** Luettelo-osan osat.lakkaus_kulutus_g. Muu kohteella null. */
  osanLakkausKulutusG: number | null;
}): ArvionTulos {
  const vari = (id: string) => varit.find((v) => v.id === id);
  const saato = (avain: string) => saadot.find((s) => s.avain === avain);

  const rivit: ArvionMaaliRivi[] = [];
  const varoitukset: ArvionVaroitus[] = [];

  // --- Käyttäjän maalit ---
  // Päämaali on listan ensimmäinen rivi. Ilman väriä riviä ei ole: tyhjä
  // valinta on keskeneräinen lomake, ei maalirivi.
  const omat = maalit.filter((m) => m.variId && vari(m.variId));
  for (const [i, m] of maalit.entries()) {
    const v = vari(m.variId);
    if (!v) continue;
    rivit.push({
      avain: m.avain,
      rooli: i === 0 ? "paamaali" : "lisamaali",
      variId: v.id,
      variNimi: v.nimi,
      kulutusSyote: m.kulutus,
      kulutusG: grammat(m.kulutus),
      automaattinen: false,
      muokattu: false,
      lahdeAvain: null,
      lahdeNimi: null,
    });
  }

  const paamaali = rivit.find((r) => r.rooli === "paamaali") ?? null;

  // --- Automaattiset pohjaväririvit ---
  // Yksi rivi jokaista pohjaa tarvitsevaa maalia kohti, lähteensä grammoilla.
  // Rivit pysyvät erillisinä vaikka pohjaväri olisi sama: kumpaakin pitää
  // voida muokata ja poistaa itsenäisesti.
  const pohjaaTarvitsevat = rivit.filter(
    (r) => !r.automaattinen && vari(r.variId)?.vaatii_pohjavarin === true
  );
  for (const lahde of pohjaaTarvitsevat) {
    const avain = pohjanAvain(lahde.avain);
    const oma = saato(avain);
    if (oma?.poistettu) {
      varoitukset.push({
        laji: "pohja_puuttuu",
        viesti: `${lahde.variNimi} vaatii pohjavärin, mutta pohjaväririviä ei ole.`,
      });
      continue;
    }
    const pohja = vari(oma?.variId || oletusPohjavariId || "");
    if (!pohja) {
      varoitukset.push({
        laji: "pohja_puuttuu",
        viesti: `${lahde.variNimi} vaatii pohjavärin, mutta pohjaväriä ei ole valittu. Pohjan maali jää varaamatta.`,
      });
      continue;
    }
    // Koskematon rivi seuraa lähdettään, muokattu pysyy omassa arvossaan.
    const syote = oma?.kulutus ?? lahde.kulutusSyote;
    rivit.push({
      avain,
      rooli: "pohjavari",
      variId: pohja.id,
      variNimi: pohja.nimi,
      kulutusSyote: syote,
      kulutusG: grammat(syote),
      automaattinen: true,
      muokattu: oma?.kulutus !== undefined,
      lahdeAvain: lahde.avain,
      lahdeNimi: lahde.variNimi,
    });
  }

  // --- Automaattinen lakkarivi ---
  // Yksi rivi per kohde, vaikka useampi maali vaatisi lakan: osa lakataan
  // kerran. Lähteiksi kelpaavat vain käyttäjän omat maalit, eivät
  // automaattiset pohjavärit.
  const lakkaaVaativat = omat.filter((m) => vari(m.variId)?.vaatii_lakkauksen === true);
  if (lakkaaVaativat.length > 0) {
    const oma = saato(LAKAN_AVAIN);
    const nimet = lakkaaVaativat.map((m) => vari(m.variId)?.nimi ?? "Maali").join(", ");
    if (oma?.poistettu) {
      varoitukset.push({
        laji: "lakka_puuttuu",
        viesti: `${nimet} vaatii lakan, mutta lakkariviä ei ole.`,
      });
    } else {
      const lakka = vari(oma?.variId || oletusLakkaId || "");
      if (!lakka) {
        varoitukset.push({
          laji: "lakka_puuttuu",
          viesti: `${nimet} vaatii lakan, mutta lakkaa ei ole valittu. Lakan maali jää varaamatta.`,
        });
      } else {
        // Luettelo-osalla lakkauskulutus on osan oma tieto, Muu kohteella
        // sitä ei ole, jolloin lakkaa menee sen verran kuin päämaaliakin.
        const oletusSyote =
          osanLakkausKulutusG !== null && osanLakkausKulutusG > 0
            ? String(osanLakkausKulutusG)
            : (paamaali?.kulutusSyote ?? "");
        const syote = oma?.kulutus ?? oletusSyote;
        rivit.push({
          avain: LAKAN_AVAIN,
          rooli: "lakka",
          variId: lakka.id,
          variNimi: lakka.nimi,
          kulutusSyote: syote,
          kulutusG: grammat(syote),
          automaattinen: true,
          muokattu: oma?.kulutus !== undefined,
          lahdeAvain: lakkaaVaativat[0].avain,
          lahdeNimi: vari(lakkaaVaativat[0].variId)?.nimi ?? null,
        });
      }
    }
  }

  // --- Varoitukset ---
  // Nollarivi varaisi maalia nolla grammaa eikä saldo vähenisi: se on lähes
  // aina unohdus, mutta tallennusta se ei estä.
  for (const r of rivit) {
    if (r.kulutusG <= 0) {
      varoitukset.push({
        laji: "kulutus_nolla",
        viesti: `${r.variNimi}: kulutus on nolla. Maalia ei varata varastosta.`,
      });
    }
  }

  // Vapaa saldo on saldo miinus jo varattu: muualle varattua ei voi maalata.
  // Samaa väriä olevat rivit lasketaan yhteen, muuten kaksi 60 gramman riviä
  // näyttäisi mahtuvan 100 gramman saldoon.
  const kulutukset = new Map<string, number>();
  for (const r of rivit) {
    kulutukset.set(r.variId, pyorista((kulutukset.get(r.variId) ?? 0) + r.kulutusG));
  }
  for (const [id, kulutusG] of kulutukset) {
    const v = vari(id);
    if (!v || kulutusG <= 0) continue;
    const vapaa = pyorista(v.saldo_g - v.varattu_g);
    if (kulutusG > vapaa) {
      varoitukset.push({
        laji: "saldo",
        viesti: `${v.nimi}: tarvitaan ${kulutusG} g, vapaana ${vapaa} g. Tallennus onnistuu silti.`,
      });
    }
  }

  return {
    rivit,
    kulutusYhteensaG: pyorista([...kulutukset.values()].reduce((s, g) => s + g, 0)),
    varoitukset,
  };
}
