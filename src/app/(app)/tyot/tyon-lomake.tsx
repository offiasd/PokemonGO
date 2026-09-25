"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Palette, Plus, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  kategorianVarienMaara,
  muotoileEuro,
  muotoileProsentti,
  myytavaMaaliTyypinNimi,
  MYYTAVAT_MAALI_TYYPIT,
  PAKOLLINEN_TOINEN_VARI_ROOLI,
  VALINNAINEN_TOINEN_VARI_ROOLI,
} from "@/lib/vakiot";
import type {
  AjoneuvoTyyppi,
  Alkupera,
  MaaliTyyppi,
  MyytavaMaaliTyyppi,
  ToinenVariRooli,
} from "@/lib/supabase/database.types";
import {
  kategorianKiinteaHinta,
  muunKohteenHinta,
  valitseKate,
  type Kateprosentit,
} from "@/lib/hinnat";
import {
  laskeLisatyot,
  type AutomaattinenLaji,
  type AutomaattisenMuokkaus,
  type LisatyonPerusta,
  type LisatyoValinta,
} from "@/lib/lisatyot";
import type { OsienLisatyo } from "@/lib/supabase/database.types";

import { aloitaTyo, paivitaTyo } from "./actions";
import { LisatyotRivilla, PaavarinKerrokset, RivinYhteenveto } from "./lisatyot-rivilla";
import { MUU_AJONEUVO, OsanValinta, VarinValinta } from "./osan-valinta";

interface Osa {
  id: string;
  nimi: string;
  lisatiedot: string | null;
  /** Ajoneuvotyyppi ratkaisee missä ryhmässä osa selataan. */
  ajoneuvotyyppi: AjoneuvoTyyppi;
  kuva_url: string | null;
  kuva_x: number;
  kuva_y: number;
  kuva_zoom: number;
  lakkaus_kulutus_g: number | null;
  tyokustannusKerroksittain: number[];
  /** Kate-% erikseen EU- ja ei-EU-väreille. */
  kateprosentit: Kateprosentit;
}

interface Vari {
  id: string;
  nimi: string;
  alkupera: Alkupera;
  tyyppi: MaaliTyyppi;
  saldo_g: number;
  varattu_g: number;
  vaatii_lakkauksen: boolean;
  vaatii_pohjavarin: boolean;
  kiiltotaso: string | null;
  kuva_url: string | null;
  kokonaishinta: number;
}

interface Kategoriahinta {
  osa_id: string;
  maali_tyyppi: MyytavaMaaliTyyppi;
  /** Adminin asettama kiinteä asiakashinta. Null = hinta lasketaan. */
  hinta: number | null;
  /** Kiinteä hinta kun työhön kuuluu lakkaus. Null = käytä hinta-kenttää. */
  hinta_lakattu: number | null;
  arvioitu_kulutus_g: number;
  toinen_arvioitu_kulutus_g: number | null;
}

interface VariKategoria {
  vari_id: string;
  maali_tyyppi: MaaliTyyppi;
}

/** Rivin kolmas ja sitä seuraava väri: oma kulutus, ei omaa hintaa. */
export interface KoriLisavari {
  variId: string;
  variNimi: string;
  arvioituKulutusG: number;
}

export interface KoriRivi {
  avain: string;
  osaNimi: string;
  variNimi: string;
  yksikkohintaEur: number;
  toinenVariNimi: string | null;
  /** Null kun kohde ei ole osaluettelossa; silloin omaKuvaus kertoo mikä se on. */
  osaId: string | null;
  omaKuvaus: string | null;
  variId: string;
  arvioituKulutusG: number;
  toinenVariId: string | null;
  toinenVariRooli: ToinenVariRooli | null;
  toinenArvioituKulutusG: number | null;
  /** Kulutus ja hinta on säädetty käsin. */
  custom: boolean;
  /** Custom-työn selite, esim. "50/50 vanteet". */
  kommentti: string | null;
  lisavarit: KoriLisavari[];
  /** Rivin lisätyöt lukittuine kulutuksineen ja hintoineen. */
  lisatyot: KoriLisatyo[];
}

/**
 * Lisätyö korissa.
 *
 * Kulutus ja hinta ovat valmiiksi laskettuja: ne lukitaan riville
 * kulutushetkellä eikä niitä lasketa uudelleen tallennuksessa.
 */
export interface KoriLisatyo {
  /** Selaimen avain. Kanta ratkaisee sillä automaattirivin lähteen. */
  avain: string;
  /** Lähteen avain. Null = lähde on työn pääväri. */
  lahdeAvain: string | null;
  lisatyoId: string | null;
  nimi: string;
  variId: string;
  variNimi: string;
  maara: number;
  osuusProsentti: number | null;
  kulutusG: number;
  hintaEur: number;
  automaattinen: "pohjavari" | "lakka" | null;
  lakkausLaajuus: "koko_osa" | "lahteen_osuus" | null;
  /** Ihmisluettava lähde korissa, esim. "Blue Morpho (jako 50 %)". */
  lahdeKuvaus: string | null;
}

/** Lisäväririvi lomakkeella: väri valitaan ja kulutus kirjoitetaan itse. */
interface LisavariSyote {
  avain: string;
  variId: string;
  kulutus: string;
}

/**
 * Osavalikon "Muu": kertaluontoinen kohde, jota ei ole osaluettelossa.
 *
 * Arvo ei ole uuid, joten se ei voi osua osan id:hen. Rivi tallentuu ilman
 * osaa, pelkän kuvauksen varassa, eikä osaluetteloon synny mitään.
 */
const MUU_OSA = MUU_AJONEUVO;

/** Tyhjä tai kelvoton syöte tarkoittaa "käytä oletusta". */
function numeroTaiOletus(syote: string, oletus: number) {
  const luku = Number(syote.replace(",", "."));
  return syote.trim() !== "" && Number.isFinite(luku) && luku >= 0 ? luku : oletus;
}

export function TyonLomake({
  osat,
  varit,
  kategoriahinnat,
  variKategoriat,
  ajoneuvotyypit,
  osienLisatyot,
  oletusPohjavariId,
  oletusLakkaId,
  oletusKateprosentit,
  muokattavaTyo,
  laskettuHinnoittelu = true,
}: {
  osat: Osa[];
  varit: Vari[];
  kategoriahinnat: Kategoriahinta[];
  variKategoriat: VariKategoria[];
  /** Ajoneuvotyyppien näyttönimet: tyypit ovat adminin hallinnoimaa dataa. */
  ajoneuvotyypit: { avain: string; nimi: string }[];
  /** Kaikkien osien rastitut lisätyöt. Vain nämä tarjotaan rivillä. */
  osienLisatyot: OsienLisatyo[];
  /** Asetuksissa valittu esitäyttö candyn pohjavärille. */
  oletusPohjavariId: string | null;
  /** Asetuksissa valittu esitäyttö illusionin ja metallicin lakalle. */
  oletusLakkaId: string | null;
  /** Asetusten katteet, joilla "Muu"-rivin hinta lasketaan maalin hinnasta. */
  oletusKateprosentit: Kateprosentit;
  /**
   * Saako hinnan laskea värin ostohinnasta ja työkustannuksesta. Maalaajalla
   * ei ole pääsyä kumpaankaan, joten hänelle tarjotaan adminin asettama
   * kiinteä kategoriahinta ja muuten käsin kirjoitettava hinta.
   */
  laskettuHinnoittelu?: boolean;
  /** Annettuna lomake muokkaa olemassa olevaa keskeneräistä työtä. */
  muokattavaTyo?: {
    id: string;
    asiakas: string | null;
    alennusProsentti: number;
    rivit: KoriRivi[];
  };
}) {
  const router = useRouter();
  const [kaynnissa, aloita] = useTransition();
  // Muokkauksessa avaimet jatkuvat valmiiden rivien perästä, jottei uusi rivi
  // saa samaa avainta kuin jo korissa oleva.
  const seuraavaAvain = useRef(muokattavaTyo?.rivit.length ?? 0);

  const variKategoriaKartta = useMemo(() => {
    const kartta = new Map<string, Set<MaaliTyyppi>>();
    for (const { vari_id, maali_tyyppi } of variKategoriat) {
      const joukko = kartta.get(vari_id) ?? new Set<MaaliTyyppi>();
      joukko.add(maali_tyyppi);
      kartta.set(vari_id, joukko);
    }
    return kartta;
  }, [variKategoriat]);

  const [asiakas, setAsiakas] = useState(muokattavaTyo?.asiakas ?? "");
  const [alennus, setAlennus] = useState(
    muokattavaTyo && muokattavaTyo.alennusProsentti > 0
      ? String(muokattavaTyo.alennusProsentti)
      : ""
  );
  const [kori, setKori] = useState<KoriRivi[]>(muokattavaTyo?.rivit ?? []);

  const [osaId, setOsaId] = useState("");
  // "Muu"-rivin kohde omin sanoin, esim. "oma venekoppa".
  const [omaKuvaus, setOmaKuvaus] = useState("");
  const [kategoria, setKategoria] = useState<MyytavaMaaliTyyppi | "">("");
  const [variId, setVariId] = useState("");
  const [lakkausValittu, setLakkausValittu] = useState(false);
  // Kun käyttäjä on itse valinnut päävärin jaon rinnalle, sovellus ei enää
  // vaihda sitä automaattisesti vaan tyytyy varoittamaan. Muuten valinta
  // kumoutuisi heti kun jaon väriä koskee.
  const [paavariKasin, setPaavariKasin] = useState(false);
  // Käyttäjän muokkaukset automaattisiin pohjaväri- ja lakkariveihin. Jokainen
  // lähde voi saada oman värinsä ja lakkarivi oman laajuutensa; koskematon
  // rivi seuraa asetusten oletusta ja lähteen oletuslaajuutta.
  const [automaattiMuokkaukset, setAutomaattiMuokkaukset] = useState<AutomaattisenMuokkaus[]>([]);

  // Custom-työssä osa maalataan useammalla värillä kuin rivin omat kaksi, ja
  // maalaaja päättää itse miten kulutus jakautuu ja mitä työstä veloitetaan.
  const [custom, setCustom] = useState(false);
  const [kommentti, setKommentti] = useState("");
  // null = kenttää ei ole koskettu, jolloin siinä näkyy kategorian esitäyttö ja
  // se seuraa värin vaihtoa. Merkkijono on maalaajan oma arvo.
  const [kulutusSyote, setKulutusSyote] = useState<string | null>(null);
  const [hintaSyote, setHintaSyote] = useState<string | null>(null);
  const [lisavarit, setLisavarit] = useState<LisavariSyote[]>([]);
  const seuraavaLisavariAvain = useRef(0);

  // Lisätyöt: monivärisyys, tekstit ja logot omana rakenteenaan. null
  // automaattisessa värissä tarkoittaa "asetusten oletus", merkkijono
  // käyttäjän omaa valintaa - sama kuvio kuin toinenVariSyote-kentässä.
  const [lisatyot, setLisatyot] = useState<LisatyoValinta[]>([]);
  const seuraavaLisatyoAvain = useRef(0);

  const onMuu = osaId === MUU_OSA;
  const valittuOsa = useMemo(() => osat.find((o) => o.id === osaId), [osat, osaId]);
  const valittuVari = useMemo(() => varit.find((v) => v.id === variId), [varit, variId]);

  // Osalla kategoriat tulevat sen hinnastosta. "Muu" ei ole hinnastossa, joten
  // sille tarjotaan kaikki myytävät kategoriat: ne ratkaisevat pohjavärin ja
  // lakan pakollisuuden aivan kuten osallakin.
  const osanKategoriat = useMemo(
    () => kategoriahinnat.filter((k) => k.osa_id === osaId),
    [kategoriahinnat, osaId]
  );
  const valittavatKategoriat = useMemo(
    () =>
      onMuu
        ? MYYTAVAT_MAALI_TYYPIT.map((t) => t.arvo)
        : osanKategoriat.map((k) => k.maali_tyyppi),
    [onMuu, osanKategoriat]
  );
  const valittuKategoriahinta = useMemo(
    () => osanKategoriat.find((k) => k.maali_tyyppi === kategoria) ?? null,
    [osanKategoriat, kategoria]
  );
  const kategorianVarit = useMemo(
    () => (kategoria ? varit.filter((v) => variKategoriaKartta.get(v.id)?.has(kategoria)) : []),
    [varit, kategoria, variKategoriaKartta]
  );

  const pakollinenRooli = kategoria ? PAKOLLINEN_TOINEN_VARI_ROOLI[kategoria] : undefined;
  const valinnainenRooli = kategoria ? VALINNAINEN_TOINEN_VARI_ROOLI[kategoria] : undefined;

  // Toisen maalikerroksen kulutus tulee ensisijaisesti kategorialta (metallicin
  // ja illusionin lakka, candyn pohjaväri) ja vasta sen puuttuessa osan omasta
  // lakkauskulutuksesta, joka koskee perusväriä. Aiemmin valinnainen lakkaus
  // luki aina osan kenttää, jolloin metallicin lakalle varattiin vääriä
  // grammoja - tai ei mitään, jos kenttä oli tyhjä.
  const toisenKulutusG =
    valittuKategoriahinta?.toinen_arvioitu_kulutus_g ?? valittuOsa?.lakkaus_kulutus_g ?? 0;
  // Ilman kulutustietoa lakkausta ei tarjota lainkaan: muuten työhön
  // varattaisiin lakkaa nolla grammaa eikä varasto vähenisi oikein. "Muu"-
  // rivillä esitäyttöä ei ole vaan kulutus kirjoitetaan käsin, joten siellä
  // lakkaus tarjotaan aina ja kulutus tarkistetaan koriin lisättäessä.
  const lakkausMahdollinen =
    Boolean(valinnainenRooli) && !pakollinenRooli && (onMuu || toisenKulutusG > 0);
  const lakattu = lakkausMahdollinen && lakkausValittu;

  // Toinen maalikerros ei ole enää työrivin oma kenttä vaan automaattinen
  // lisätyörivi, joka syntyy lähteestä. Kategorian rooli jää silti kertomaan
  // sisältyykö kerros jo kiinteään hintaan.

  // Kategorian kulutus on esitäyttö. Custom-työssä sen voi jakaa väreille
  // toisin, mutta oletus jää näkyviin arvion tueksi.
  const oletusKulutusG = valittuKategoriahinta?.arvioitu_kulutus_g ?? 0;
  const oletusToinenKulutusG = toisenKulutusG;
  // "Muu"-rivillä kulutus on aina käsin kirjoitettu, koska esitäyttöä ei ole.
  const kulutusKasin = custom || onMuu;
  const arvioituKulutusG = kulutusKasin
    ? numeroTaiOletus(kulutusSyote ?? "", oletusKulutusG)
    : oletusKulutusG;

  // ---- Lisätyöt ----
  // Valikossa ovat vain tälle osalle rastitut lisätyöt. "Muu"-rivillä niitä ei
  // ole lainkaan: kertakohdetta ei ole osaluettelossa eikä sille siten voi
  // olla määriteltyjä lisätöitä.
  const osanLisatyot = useMemo<LisatyonPerusta[]>(
    () =>
      onMuu || !osaId
        ? []
        : osienLisatyot
            .filter((l) => l.osa_id === osaId)
            .map((l) => ({
              lisatyo_id: l.lisatyo_id,
              nimi: l.nimi,
              on_jako: l.on_jako,
              lisakulutus_g: l.lisakulutus_g,
              hinta_perusvari_eur: l.hinta_perusvari_eur,
              hinta_erikoisvari_eur: l.hinta_erikoisvari_eur,
            })),
    [osienLisatyot, osaId, onMuu]
  );

  // Värilista kelpaa sellaisenaan sekä laskentaan että näyttämiseen: Vari
  // sisältää kaikki VarinTiedot-kentät ja lisäksi kuvan. Erillinen
  // välimuunnos olisi pudottanut kuvan pois juuri siltä valinnalta joka sitä
  // tarvitsee.
  // Ilman suodatusta tarjottaisiin kaikkia värejä, joista suurin osa on
  // pohjaksi tai lakaksi väärin. Sama kategoriarajaus kuin rivin omalla
  // pohjavärillä ja lakalla.
  const lisatyonPohjaVaihtoehdot = useMemo(
    () => varit.filter((v) => variKategoriaKartta.get(v.id)?.has("pohjavari")),
    [varit, variKategoriaKartta]
  );
  const lisatyonLakkaVaihtoehdot = useMemo(
    () => varit.filter((v) => variKategoriaKartta.get(v.id)?.has("transparent")),
    [varit, variKategoriaKartta]
  );

  // Esitäyttö kelpaa vain jos väri on yhä suodatetussa valikossa: poistettu tai
  // toiseen kategoriaan siirretty oletus jättää valinnan tyhjäksi.
  const lisatyonPohjavariId =
    oletusPohjavariId && lisatyonPohjaVaihtoehdot.some((v) => v.id === oletusPohjavariId)
      ? oletusPohjavariId
      : null;
  const lisatyonLakkaId =
    oletusLakkaId && lisatyonLakkaVaihtoehdot.some((v) => v.id === oletusLakkaId)
      ? oletusLakkaId
      : null;

  const lisatoidenTulos = useMemo(
    () =>
      laskeLisatyot(
        lisatyot,
        osanLisatyot,
        varit,
        variId,
        arvioituKulutusG,
        {
          lakkaus_kulutus_g: valittuOsa?.lakkaus_kulutus_g ?? null,
          pohjaKulutusG: valittuKategoriahinta?.toinen_arvioitu_kulutus_g ?? null,
        },
        {
          pohjavariId: lisatyonPohjavariId,
          lakkaId: lisatyonLakkaId,
          // Solid ja metallic eivät vaadi lakkaa, mutta asiakas voi tilata
          // sen lisänä. Valinta on käyttäjän eikä värin ominaisuus.
          lakkausPaavarille: lakattu,
          muokkaukset: automaattiMuokkaukset,
        }
      ),
    [
      lisatyot,
      osanLisatyot,
      varit,
      variId,
      arvioituKulutusG,
      valittuOsa,
      valittuKategoriahinta,
      lisatyonPohjavariId,
      lisatyonLakkaId,
      lakattu,
      automaattiMuokkaukset,
    ]
  );

  // Päävärin oma pohjaväri ja lakka ovat nyt automaattisia lisätyörivejä,
  // joiden lähde on pääväri (lahdeAvain null). Hinnoittelu tarvitsee niistä
  // värin katteen ja maalikustannuksen valintaan.
  const paavarinAutomaatit = lisatoidenTulos.rivit.filter(
    (r) => r.automaattinen !== null && r.lahdeAvain === null
  );
  const paavarinToinenVari = paavarinAutomaatit[0]
    ? varit.find((v) => v.id === paavarinAutomaatit[0].variId)
    : undefined;

  // ---- Pääväri on aina kalliimpi väri ----
  // Perushinta tulee päävärin kategoriasta ja lisätyö hinnoitellaan erikseen
  // sen mukaan onko sen väri solid vai erikoisväri. Siksi sama jako saa kaksi
  // eri hintaa sen mukaan kumpi väri on syötetty pääväriksi - ja oikea on se
  // jossa kalliimpi väri on pääväri.

  /** Osan kallein kategoria jolle väri kelpaa. Null kun kiinteää hintaa ei ole. */
  const varinKategoriaOsalle = useCallback(
    (id: string) => {
      const varinKategoriat = variKategoriaKartta.get(id);
      if (!varinKategoriat) return null;
      let paras: { kategoria: MyytavaMaaliTyyppi; hinta: number } | null = null;
      for (const k of osanKategoriat) {
        if (!varinKategoriat.has(k.maali_tyyppi) || k.hinta === null) continue;
        if (!paras || k.hinta > paras.hinta) paras = { kategoria: k.maali_tyyppi, hinta: k.hinta };
      }
      return paras;
    },
    [osanKategoriat, variKategoriaKartta]
  );

  const varinNimi = (id: string) => varit.find((v) => v.id === id)?.nimi ?? "Tuntematon väri";

  const onJako = useCallback(
    (lisatyoId: string) => osanLisatyot.find((p) => p.lisatyo_id === lisatyoId)?.on_jako === true,
    [osanLisatyot]
  );

  /**
   * Jaon väri joka on osalle päävärii kalliimpi.
   *
   * Vertailu tehdään vain kiinteillä kategoriahinnoilla: lasketussa
   * hinnoittelussa hinta tulee maalin kulutuksesta eikä kategoriasta, jolloin
   * päävärin vaihto ei siirrä hintaa mihinkään.
   */
  const kalliimpiEhdokas = useMemo(() => {
    if (onMuu || !kategoria || !variId) return null;
    const nykyinenHinta = valittuKategoriahinta?.hinta;
    if (nykyinenHinta === null || nykyinenHinta === undefined) return null;

    let paras: { avain: string; variId: string; kategoria: MyytavaMaaliTyyppi; hinta: number } | null =
      null;
    for (const l of lisatyot) {
      if (!l.variId || !onJako(l.lisatyoId)) continue;
      const k = varinKategoriaOsalle(l.variId);
      if (!k || k.hinta <= nykyinenHinta) continue;
      if (!paras || k.hinta > paras.hinta) paras = { avain: l.avain, variId: l.variId, ...k };
    }
    return paras;
  }, [
    onMuu,
    kategoria,
    variId,
    valittuKategoriahinta,
    lisatyot,
    onJako,
    varinKategoriaOsalle,
  ]);

  /**
   * Rivin hinta jos pääväri ja ehdokkaan jako vaihtaisivat paikkaa.
   *
   * Lasketaan samalla moduulilla kuin nykyinenkin hinta, jottei lisätöiden
   * hinnoittelusääntö ole kahdessa paikassa.
   */
  const ehdokkaanHintaEur = useMemo(() => {
    if (!kalliimpiEhdokas) return null;
    const kategoriahinta = osanKategoriat.find(
      (k) => k.maali_tyyppi === kalliimpiEhdokas.kategoria
    );
    if (!kategoriahinta) return null;

    const vaihdetutValinnat = lisatyot.map((l) =>
      l.avain === kalliimpiEhdokas.avain ? { ...l, variId } : l
    );
    const tulos = laskeLisatyot(
      vaihdetutValinnat,
      osanLisatyot,
      varit,
      kalliimpiEhdokas.variId,
      kategoriahinta.arvioitu_kulutus_g,
      {
        lakkaus_kulutus_g: valittuOsa?.lakkaus_kulutus_g ?? null,
        pohjaKulutusG: kategoriahinta.toinen_arvioitu_kulutus_g ?? null,
      },
      { pohjavariId: lisatyonPohjavariId, lakkaId: lisatyonLakkaId }
    );
    const perus = kategorianKiinteaHinta(kategoriahinta, false);
    if (perus === null) return null;
    return Math.round((perus + tulos.hinnatYhteensaEur) * 100) / 100;
  }, [
    kalliimpiEhdokas,
    osanKategoriat,
    lisatyot,
    variId,
    osanLisatyot,
    varit,
    valittuOsa,
    lisatyonPohjavariId,
    lisatyonLakkaId,
  ]);

  // Jaot siirtävät grammoja perusväriltä, eivät lisää niitä: riville
  // tallennetaan jäännös, jolloin osan kokonaiskulutus pysyy samana.
  const perusvarinKulutusG =
    lisatoidenTulos.perusvarinOsuus < 100
      ? lisatoidenTulos.perusvarinKulutusG
      : arvioituKulutusG;

  // Hinnoittelujärjestys on sama kuin osan omalla sivulla: adminin kategorialle
  // asettama kiinteä hinta ensin, sitten osan manuaalinen hinta, ja vasta jos
  // kumpaakaan ei ole asetettu, värin ostohinnasta + katteesta laskettu
  // suositushinta. Kiinteä hinta korvaa koko kustannuslaskennan, joten sitä ei
  // koroteta työkustannuksella eikä maalin hinnalla - vain värikohtaisella
  // hintalisällä, kuten laskettuakin hintaa.
  const osanLaskettuHintaEur = useMemo(() => {
    if (!valittuKategoriahinta || !valittuVari || !valittuOsa) return null;
    if (!laskettuHinnoittelu) {
      return kategorianKiinteaHinta(valittuKategoriahinta, !pakollinenRooli && lakattu);
    }
    // Maalaus ja suojaus tehdään jokaiselle värikerrokselle erikseen.
    const varienMaara = kategoria ? kategorianVarienMaara(kategoria, lakattu) : 1;
    const tyokustannus =
      valittuOsa.tyokustannusKerroksittain[varienMaara - 1] ??
      valittuOsa.tyokustannusKerroksittain[0] ??
      0;
    let kustannus = (oletusKulutusG / 1000) * valittuVari.kokonaishinta + tyokustannus;
    // Myös valinnainen lakkaus kuluttaa maalia: sen grammat varataan varastosta
    // (toinenArvioituKulutusG tallennetaan työriville), joten ne kuuluvat myös
    // kustannukseen. Aiemmin tämä laskettiin vain pakollisille pohjaväreille ja
    // lakoille, jolloin Työt-sivu antoi solid + lakkaus -työlle eri hinnan kuin
    // osan oma kustannusarvio.
    // Toinen maalikerros hinnoitellaan kategorian täydellä kulutuksella, ei
    // jaon osuudella: osa maalataan kokonaan, jako vain vaihtaa sävyä ja sen
    // oma hinta tulee lisätyöstä.
    if (paavarinToinenVari) {
      kustannus += (oletusToinenKulutusG / 1000) * paavarinToinenVari.kokonaishinta;
    }
    // Kate valitaan värien alkuperästä: EU:n ulkopuolelta tilaaminen on
    // työläämpää, joten sille on oma prosentti. Valinnainen lakka lasketaan
    // mukaan samoin kuin sen maalikustannus.
    const kate = valitseKate(
      valittuOsa.kateprosentit,
      valittuVari.alkupera,
      paavarinToinenVari?.alkupera
    );
    // Lakattu työ voi olla omalla kiinteällä hinnallaan: se on kalliimpi kuin
    // lakkaamaton. Candyllä ja illusionilla lakka kuuluu hintaan aina, joten
    // niillä kategorian oma hinta on ainoa.
    const kategorianHinta =
      kategorianKiinteaHinta(valittuKategoriahinta, !pakollinenRooli && lakattu) ??
      Math.round(kustannus * (1 + kate / 100) * 100) / 100;
    return kategorianHinta;
  }, [
    valittuKategoriahinta,
    valittuVari,
    valittuOsa,
    paavarinToinenVari,
    oletusKulutusG,
    oletusToinenKulutusG,
    kategoria,
    lakattu,
    pakollinenRooli,
    laskettuHinnoittelu,
  ]);

  // "Muu"-rivin hinta tulee maalin kulutuksesta ja asetusten katteesta, koska
  // kategoriahintaa ei ole (ks. muunKohteenHinta).
  const muunLaskettuHintaEur = useMemo(() => {
    if (!onMuu || !valittuVari || !laskettuHinnoittelu) return null;
    return muunKohteenHinta(
      [
        { ...valittuVari, grammat: arvioituKulutusG },
        ...paavarinAutomaatit.flatMap((r) => {
          const v = varit.find((x) => x.id === r.variId);
          return v ? [{ ...v, grammat: r.kulutusG }] : [];
        }),
        ...lisavarit.flatMap((l) => {
          const vari = varit.find((v) => v.id === l.variId);
          return vari ? [{ ...vari, grammat: numeroTaiOletus(l.kulutus, 0) }] : [];
        }),
      ],
      oletusKateprosentit
    );
  }, [
    onMuu,
    valittuVari,
    paavarinAutomaatit,
    arvioituKulutusG,
    lisavarit,
    varit,
    oletusKateprosentit,
    laskettuHinnoittelu,
  ]);

  const laskettuHintaEur = onMuu ? muunLaskettuHintaEur : osanLaskettuHintaEur;

  // Custom-työn hinta on maalaajan päätettävissä: laskettu hinta on vain
  // lähtöarvo, koska monivärityön hintaa ei voi johtaa kategoriasta. Sama
  // kenttä tulee näkyviin kun hinnoittelutietoja ei ole käytettävissä: silloin
  // kiinteän kategoriahinnan puuttuessa hinta kirjoitetaan itse.
  const hintaKasin = kulutusKasin || !laskettuHinnoittelu;
  const yksikkohintaEur = !hintaKasin
    ? laskettuHintaEur
    : (hintaSyote ?? "").trim() === "" && laskettuHintaEur === null
      ? null
      : Math.round(numeroTaiOletus(hintaSyote ?? "", laskettuHintaEur ?? 0) * 100) / 100;

  // Asiakashinta = osan kategoriahinta + lisätöiden hinnat. Automaattiset
  // pohjaväri- ja lakkarivit eivät lisää hintaa: ne varaavat maalia ja
  // kuluttavat saldoa. Riville tallentuu tämä summa, ja lisätyörivit
  // säilyttävät oman hintansa erittelynä - niitä ei lasketa myyntiin
  // toiseen kertaan.
  const riviHintaEur =
    yksikkohintaEur === null
      ? null
      : Math.round((yksikkohintaEur + lisatoidenTulos.hinnatYhteensaEur) * 100) / 100;

  // Koskematon kenttä näyttää esitäytön ja seuraa kategorian tai värin vaihtoa;
  // kirjoitettu arvo jää voimaan.
  const kentanArvo = (syote: string | null, oletus: number) =>
    syote ?? (oletus > 0 ? String(oletus) : "");

  // Sama väri ei voi olla rivillä kahdesti: pääväri, pohjaväri ja jo lisätyt
  // ovat poissa valittavista.
  const lisavarinVaihtoehdot = useMemo(() => {
    const varatut = new Set(
      [variId, ...paavarinAutomaatit.map((r) => r.variId)].filter(Boolean)
    );
    return varit.filter((v) => !varatut.has(v.id));
  }, [varit, variId, paavarinAutomaatit]);

  const lisavarienKulutusG = lisavarit.reduce(
    (summa, l) => summa + numeroTaiOletus(l.kulutus, 0),
    0
  );
  const automaattienKulutusG = paavarinAutomaatit.reduce((s, r) => s + r.kulutusG, 0);
  const kulutusYhteensaG = arvioituKulutusG + automaattienKulutusG + lisavarienKulutusG;
  const oletusYhteensaG = oletusKulutusG + (paavarinAutomaatit.length > 0 ? oletusToinenKulutusG : 0);

  function vaihdaOsa(v: string) {
    setOsaId(v);
    setOmaKuvaus("");
    setKategoria("");
    setVariId("");
    setLakkausValittu(false);
    setPaavariKasin(false);
    setAutomaattiMuokkaukset([]);
    tyhjennaCustom();
    // Toisen osan lisätyöt ovat eri lisätöitä: valinnat eivät saa jäädä
    // roikkumaan, koska ne viittaisivat lisätyöhön jota uudella osalla ei ole.
    tyhjennaLisatyot();
  }

  function vaihdaKategoria(v: string) {
    setKategoria(v as MyytavaMaaliTyyppi);
    setVariId("");
    setLakkausValittu(false);
    setAutomaattiMuokkaukset([]);
  }

  /**
   * Päävärin valinta käyttöliittymästä.
   *
   * Jos rivillä on jo värillinen jako, valinta on käyttäjän tietoinen päätös
   * eikä sovellus enää vaihda pääväriä automaattisesti.
   */
  function valitsePaavari(uusiId: string) {
    setVariId(uusiId);
    // Lakkaus ei ole kategoriakohtainen pakko vaan värikohtainen tieto, joten
    // valinta seuraa väriä molempiin suuntiin: uusi väri joka vaatii
    // lakkauksen kytkee sen päälle ja väri joka ei vaadi ottaa sen pois.
    // Käyttäjä voi silti muuttaa valintaa itse - siksi se on ehdotus eikä lukko.
    setLakkausValittu(varit.find((v) => v.id === uusiId)?.vaatii_lakkauksen === true);
    if (lisatyot.some((l) => l.variId && onJako(l.lisatyoId))) setPaavariKasin(true);
  }

  /** Custom-valinnat nollautuvat aina rivin mukana, ei työn mukana. */
  function tyhjennaCustom() {
    setCustom(false);
    setKommentti("");
    setKulutusSyote(null);
    setHintaSyote(null);
    setLisavarit([]);
  }

  /**
   * Lisätyöt nollautuvat rivin mukana samoin kuin custom-valinnat.
   *
   * Myös automaattisten värien vaihdot: ne ovat työkohtaisia poikkeuksia
   * yhdelle riville, eivät uusi oletus seuraavalle osalle.
   */
  function tyhjennaLisatyot() {
    setLisatyot([]);
  }

  function lisaaLisatyo(lisatyoId: string) {
    setLisatyot((vanhat) => [
      ...vanhat,
      {
        avain: String(seuraavaLisatyoAvain.current++),
        lisatyoId,
        // Oletukseksi ei perusväriä: lisätyön koko idea on toinen väri.
        variId: "",
        maara: 1,
        osuusProsentti: 50,
      },
    ]);
  }

  /**
   * Automaattisen rivin muokkaus.
   *
   * Avaimena lähde ja laji: sama pohjaväri voi tulla sekä päävärin että jaon
   * takia, ja kumpaakin riviä on voitava muokata itsenäisesti. Aiempi arvo
   * säilyy, jotta värin vaihto ei nollaa laajuutta eikä päinvastoin.
   */
  function muokkaaAutomaattia(muutos: AutomaattisenMuokkaus) {
    setAutomaattiMuokkaukset((vanhat) => {
      const muut = vanhat.filter(
        (m) => !(m.lahdeAvain === muutos.lahdeAvain && m.laji === muutos.laji)
      );
      const vanha = vanhat.find(
        (m) => m.lahdeAvain === muutos.lahdeAvain && m.laji === muutos.laji
      );
      return [...muut, { ...vanha, ...muutos }];
    });
  }

  function palautaAutomaatinOletus(lahdeAvain: string | null, laji: AutomaattinenLaji) {
    setAutomaattiMuokkaukset((vanhat) =>
      vanhat.filter((m) => !(m.lahdeAvain === lahdeAvain && m.laji === laji))
    );
  }

  function muutaLisatyo(avain: string, muutos: Partial<Omit<LisatyoValinta, "avain">>) {
    setLisatyot((vanhat) => vanhat.map((l) => (l.avain === avain ? { ...l, ...muutos } : l)));

    // Jaon väri voi olla osalle päävärii kalliimpi. Silloin pääväri ja jako
    // vaihtavat paikkaa heti, koska perushinta tulee päävärin kategoriasta:
    // muuten sama työ hinnoiteltaisiin halvemmin sen mukaan kumpi väri
    // sattui tulemaan ensin. Käyttäjä voi vaihtaa takaisin - se varoittaa
    // muttei estä.
    const jako = lisatyot.find((l) => l.avain === avain);
    if (muutos.variId && jako && onJako(jako.lisatyoId) && !paavariKasin) {
      vaihdaPaavariksi(avain, muutos.variId);
    }
  }

  /**
   * Vaihtaa jaon värin pääväriksi ja päävärin jakoon.
   *
   * Tekee vaihdon vain kun uusi väri on osalle kalliimpi; muuten ei mitään.
   */
  function vaihdaPaavariksi(jaonAvain: string, jaonVariId: string) {
    const uusi = varinKategoriaOsalle(jaonVariId);
    const nykyinenHinta = valittuKategoriahinta?.hinta;
    if (!uusi || nykyinenHinta === null || nykyinenHinta === undefined) return;
    if (uusi.hinta <= nykyinenHinta) return;

    const vanhaPaavari = variId;
    setKategoria(uusi.kategoria);
    setVariId(jaonVariId);
    setLakkausValittu(varit.find((v) => v.id === jaonVariId)?.vaatii_lakkauksen === true);
    setLisatyot((vanhat) =>
      vanhat.map((l) => (l.avain === jaonAvain ? { ...l, variId: vanhaPaavari } : l))
    );
    // Lähteiden värit vaihtuivat, joten niille tehdyt poikkeukset eivät enää
    // osu samaan väriin.
    setAutomaattiMuokkaukset([]);
    setPaavariKasin(false);
  }

  function tyhjennaRivilomake() {
    setOsaId("");
    setOmaKuvaus("");
    setKategoria("");
    setVariId("");
    setLakkausValittu(false);
    setPaavariKasin(false);
    setAutomaattiMuokkaukset([]);
    tyhjennaCustom();
    tyhjennaLisatyot();
  }

  function lisaaLisavari() {
    setLisavarit((vanhat) => [
      ...vanhat,
      { avain: String(seuraavaLisavariAvain.current++), variId: "", kulutus: "" },
    ]);
  }

  function paivitaLisavari(avain: string, muutos: Partial<Omit<LisavariSyote, "avain">>) {
    setLisavarit((vanhat) =>
      vanhat.map((l) => (l.avain === avain ? { ...l, ...muutos } : l))
    );
  }

  function lisaaKoriin() {
    if ((!valittuOsa && !onMuu) || !valittuVari) {
      toast.error("Valitse osa, kategoria ja väri.");
      return;
    }
    if (riviHintaEur === null) {
      toast.error("Anna hinta asiakkaalle - sitä ei voi laskea näillä tiedoilla.");
      return;
    }
    if (onMuu && !omaKuvaus.trim()) {
      toast.error("Kirjoita mitä maalataan.");
      return;
    }
    if (arvioituKulutusG <= 0) {
      toast.error("Anna maalinkulutus - ilman sitä varastosta ei varata oikeaa määrää.");
      return;
    }
    // Jokainen lisäväri varaa maalia varastosta, joten kulutus on pakko tietää.
    // Ilman tarkistusta rivi tallentuisi nollalla eikä saldo vähenisi.
    const kelvottomat = kulutusKasin
      ? lisavarit.filter((l) => !l.variId || numeroTaiOletus(l.kulutus, 0) <= 0)
      : [];
    if (kelvottomat.length > 0) {
      toast.error("Valitse jokaiselle lisävärille väri ja arvioitu kulutus.");
      return;
    }
    // Sama väri kahdesti samalla rivillä varaisi maalia kahteen kertaan ja
    // kaatuisi vasta kannassa. Kategorian vaihto voi jättää lisävärin osumaan
    // uuteen päävääriin, joten tarkistus on tässä eikä pelkässä valikossa.
    const kaytetyt = [variId];
    const lisavarienIdt = kulutusKasin ? lisavarit.map((l) => l.variId) : [];
    if (new Set([...kaytetyt, ...lisavarienIdt]).size !== kaytetyt.length + lisavarienIdt.length) {
      toast.error("Sama väri on rivillä kahdesti - valitse eri värit.");
      return;
    }
    // Ilman väriä lisätyö ei varaisi maalia varastosta eikä sen kulutus
    // päätyisi mihinkään. Saldo ja lakkausarvot sen sijaan ovat varoituksia,
    // eivät esteitä - työ on silti tehtävä.
    if (lisatyot.some((l) => !l.variId)) {
      toast.error("Valitse jokaiselle lisätyölle väri.");
      return;
    }

    const rivi: KoriRivi = {
      avain: String(seuraavaAvain.current++),
      osaId: onMuu ? null : (valittuOsa?.id ?? null),
      omaKuvaus: onMuu ? omaKuvaus.trim() : null,
      osaNimi: onMuu ? omaKuvaus.trim() : (valittuOsa?.nimi ?? ""),
      variId: valittuVari.id,
      variNimi: valittuVari.nimi,
      arvioituKulutusG: perusvarinKulutusG,
      yksikkohintaEur: riviHintaEur,
      // Uudella rivillä pohjaväri ja lakka ovat automaattisia lisätyörivejä,
      // eivät työrivin omia kenttiä. Vanhat rivit kantavat nämä yhä.
      toinenVariId: null,
      toinenVariNimi: null,
      toinenVariRooli: null,
      toinenArvioituKulutusG: null,
      custom,
      kommentti: custom ? kommentti.trim() || null : null,
      lisatyot: lisatoidenTulos.rivit.map((r) => ({
        avain: r.avain,
        lahdeAvain: r.lahdeAvain,
        lisatyoId: r.lisatyoId,
        nimi: r.nimi,
        variId: r.variId,
        variNimi: r.variNimi,
        maara: r.maara,
        osuusProsentti: r.osuusProsentti,
        kulutusG: r.kulutusG,
        hintaEur: r.hintaEur,
        automaattinen: r.automaattinen,
        lakkausLaajuus: r.lakkausLaajuus,
        lahdeKuvaus: r.lahdeKuvaus,
      })),
      lisavarit: kulutusKasin
        ? lisavarit.map((l) => ({
            variId: l.variId,
            variNimi: varit.find((v) => v.id === l.variId)?.nimi ?? "Tuntematon väri",
            arvioituKulutusG: numeroTaiOletus(l.kulutus, 0),
          }))
        : [],
    };
    setKori((k) => [...k, rivi]);
    tyhjennaRivilomake();
  }

  function poistaKorista(avain: string) {
    setKori((k) => k.filter((r) => r.avain !== avain));
  }

  const koriYhteensa = kori.reduce((s, r) => s + r.yksikkohintaEur, 0);
  // Tyhjä kenttä ja roskasyöte tarkoittavat molemmat "ei alennusta". Rajaus
  // 0-100 % on sama kuin palvelinfunktiossa ja kannassa.
  const alennusProsentti = Math.min(Math.max(Number(alennus) || 0, 0), 100);
  const alennusEur = Math.round(koriYhteensa * (alennusProsentti / 100) * 100) / 100;
  const loppusumma = Math.round((koriYhteensa - alennusEur) * 100) / 100;

  // Uusi työ voidaan joko vastaanottaa (osat tuotu, maalaus alkaa myöhemmin)
  // tai aloittaa heti. Maali varataan molemmissa tapauksissa.
  function kasitteleTallennus(tila: "vastaanotettu" | "vaiheessa" = "vaiheessa") {
    if (kori.length === 0) {
      toast.error(
        muokattavaTyo
          ? "Työssä pitää olla vähintään yksi osa."
          : "Lisää vähintään yksi osa koriin ennen tallennusta."
      );
      return;
    }
    const syotteet = kori.map((r) => ({
      osaId: r.osaId,
      omaKuvaus: r.omaKuvaus,
      variId: r.variId,
      kappalemaara: 1,
      arvioituKulutusG: r.arvioituKulutusG,
      yksikkohintaEur: r.yksikkohintaEur,
      toinenVariId: r.toinenVariId,
      toinenVariRooli: r.toinenVariRooli,
      toinenArvioituKulutusG: r.toinenArvioituKulutusG,
      custom: r.custom,
      kommentti: r.kommentti,
      lisavarit: r.lisavarit.map((l) => ({
        variId: l.variId,
        arvioituKulutusG: l.arvioituKulutusG,
      })),
      lisatyot: r.lisatyot.map((l) => ({
        avain: l.avain,
        lahdeAvain: l.lahdeAvain,
        lisatyoId: l.lisatyoId,
        variId: l.variId,
        maara: l.maara,
        osuusProsentti: l.osuusProsentti,
        kulutusG: l.kulutusG,
        hintaEur: l.hintaEur,
        automaattinen: l.automaattinen,
        lakkausLaajuus: l.lakkausLaajuus,
      })),
    }));

    // Toiminto palauttaa virheen arvona eikä heitä sitä: tuotannossa Next.js
    // korvaa heitetyn virheen yleisellä React-virheellä, jolloin maalaaja näki
    // numerosarjan sen sijaan että olisi tiennyt mikä meni pieleen.
    aloita(async () => {
      const tulos = muokattavaTyo
        ? await paivitaTyo(muokattavaTyo.id, asiakas.trim() || null, syotteet, alennusProsentti)
        : await aloitaTyo(asiakas.trim() || null, syotteet, alennusProsentti, tila);

      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      toast.success(
        muokattavaTyo
          ? "Työ päivitetty ja varaukset korjattu varastoon."
          : tila === "vastaanotettu"
            ? "Työ vastaanotettu ja maali varattu varastosta."
            : "Työ aloitettu ja maali varattu varastosta."
      );
      router.push("/tyot");
    });
  }

  // "Muu"-rivillä kohde kirjoitetaan itse, ja se kuuluu luettavaksi ennen
  // kategoriaa: ensin mikä kappale, sitten millä maalilla. Kenttä on siksi
  // omana muuttujanaan - osarivillä se on osavalikon vieressä, Muu-rivillä
  // kuvaus vie sen paikan ja kategoria putoaa omalle rivilleen.
  const kategoriaKentta = (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor="kategoria">Kategoria</Label>
      <Select value={kategoria} onValueChange={vaihdaKategoria} disabled={!osaId}>
        <SelectTrigger
          id="kategoria"
          className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate"
        >
          <SelectValue placeholder="Valitse kategoria" />
        </SelectTrigger>
        <SelectContent>
          {valittavatKategoriat.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              Osalle ei ole asetettu hintoja
            </p>
          )}
          {valittavatKategoriat.map((tyyppi) => (
            <SelectItem key={tyyppi} value={tyyppi}>
              {myytavaMaaliTyypinNimi(tyyppi)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const kuvausKentta = (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor="oma_kuvaus">Mitä maalataan? *</Label>
      <Input
        id="oma_kuvaus"
        value={omaKuvaus}
        onChange={(e) => setOmaKuvaus(e.target.value)}
        placeholder="Esim. oma venekoppa"
      />
      <p className="text-xs text-muted-foreground">
        Jää vain tähän työhön - osaluetteloon ei tallenneta mitään.
      </p>
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor="asiakas">Asiakas (valinnainen)</Label>
        <Input
          id="asiakas"
          value={asiakas}
          onChange={(e) => setAsiakas(e.target.value)}
          placeholder="Nimi tai viite"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lisää osa koriin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Ensin kuva, sitten hinnoittelu: maalari näkee mitä on
              maalaamassa ennen kuin valitsee millä. Kategoria ja väri
              ilmestyvät vasta osan jälkeen, jotta valinnat tehdään
              järjestyksessä eikä tyhjiin valikoihin. */}
          <OsanValinta
            osat={osat}
            ajoneuvotyypit={ajoneuvotyypit}
            valittuId={osaId}
            onValitse={vaihdaOsa}
          />

          {onMuu && kuvausKentta}

          {osaId && <div className="grid gap-4 sm:max-w-sm">{kategoriaKentta}</div>}

          {kategoria && (
            <VarinValinta
              varit={kategorianVarit}
              valittuId={variId}
              onValitse={valitsePaavari}
              tyhjaTeksti="Tässä kategoriassa ei ole värejä - lisää kategoria värille."
            />
          )}
          {lakkausMahdollinen && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="lakkaus_kytketty"
                checked={lakkausValittu}
                onCheckedChange={(t) => setLakkausValittu(t === true)}
              />
              <Label htmlFor="lakkaus_kytketty" className="font-normal">
                Lisää lakkaus (kirkas topcoat)
                {valittuVari?.vaatii_lakkauksen && (
                  <span className="text-muted-foreground"> - väri vaatii lakkauksen</span>
                )}
              </Label>
            </div>
          )}

          {/* Päävärin pohjaväri ja lakkaus ovat osa perusmaalausta ja
              sisältyvät osalle asetettuun kiinteään hintaan, joten ne näkyvät
              heti värin alla eivätkä lisätöiden joukossa. */}
          {kategoria && variId && (
            <PaavarinKerrokset
              tulos={lisatoidenTulos}
              pohjavariVaihtoehdot={lisatyonPohjaVaihtoehdot}
              lakkaVaihtoehdot={lisatyonLakkaVaihtoehdot}
              onMuokkaaAutomaattia={muokkaaAutomaattia}
              onPalautaOletus={palautaAutomaatinOletus}
            />
          )}

          {/* Lisätyöt tulevat värin jälkeen: jaon osuus lasketaan perusvärin
              kulutuksesta ja automaattinen lakkaus riippuu siitä, lakataanko
              rivi jo muutenkin. */}
          {kategoria && variId && (
            <LisatyotRivilla
              perustat={osanLisatyot}
              varit={varit}
              valinnat={lisatyot}
              tulos={lisatoidenTulos}
              pohjavariVaihtoehdot={lisatyonPohjaVaihtoehdot}
              lakkaVaihtoehdot={lisatyonLakkaVaihtoehdot}
              onLisaa={lisaaLisatyo}
              onPoista={(avain) =>
                setLisatyot((vanhat) => vanhat.filter((l) => l.avain !== avain))
              }
              onMuuta={muutaLisatyo}
              onMuokkaaAutomaattia={muokkaaAutomaattia}
              onPalautaOletus={palautaAutomaatinOletus}
            />
          )}

          {/* Pääväriksi on valittu halvempi väri: varoitus, ei esto.
              Poikkeustapauksia voi olla, joten tallennus onnistuu silti. */}
          {kalliimpiEhdokas && ehdokkaanHintaEur !== null && riviHintaEur !== null && (
            <div className="grid min-w-0 gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <div className="flex min-w-0 gap-2">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0 wrap-anywhere">
                  Pääväriksi on valittu halvempi väri. Osan perushinta tulee päävärin
                  kategoriasta, joten {varinNimi(kalliimpiEhdokas.variId)} pääväriksi antaa{" "}
                  {muotoileEuro(ehdokkaanHintaEur)}, nykyinen järjestys{" "}
                  {muotoileEuro(riviHintaEur)}.
                </span>
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-0 max-w-full"
                  onClick={() => vaihdaPaavariksi(kalliimpiEhdokas.avain, kalliimpiEhdokas.variId)}
                >
                  <span className="min-w-0 truncate">
                    Vaihda pääväriksi {varinNimi(kalliimpiEhdokas.variId)}
                  </span>
                </Button>
              </div>
            </div>
          )}

          {/* Varoitukset ja maalinkulutus koskevat koko riviä, joten ne ovat
              lisätyölaatikon ulkopuolella - myös lisätyötön candy varaa
              pohjaväriä ja voi jäädä saldosta vajaaksi. */}
          {kategoria && variId && <RivinYhteenveto tulos={lisatoidenTulos} />}

          {/* Custom-työ: sama osa maalataan usealla värillä, kulutus jaetaan
              käsin ja hinta sovitaan tapauskohtaisesti. Nappi tulee näkyviin
              osan ja kategorian valinnan jälkeen, koska esitäytöt tulevat
              kategorialta. */}
          {osaId && kategoria && !custom && !onMuu && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => setCustom(true)}>
                <Palette className="size-4" />
                Custom
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Useampi väri samaan osaan, oma kulutus ja oma hinta.
              </p>
            </div>
          )}

          {kulutusKasin && kategoria && (
            <div className="grid gap-4 rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="font-medium">{onMuu ? "Arvio" : "Custom-työ"}</Label>
                  <p className="text-xs text-muted-foreground">
                    {onMuu
                      ? "Arvioi kulutus ja hinta nyt - toteutunut kulutus kirjataan kun työ merkitään valmiiksi."
                      : "Jaa esitäytetty kulutus väreille ja aseta työlle hinta."}
                  </p>
                </div>
                {!onMuu && (
                  <Button type="button" variant="ghost" size="sm" onClick={tyhjennaCustom}>
                    Peruuta
                  </Button>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="kommentti">Kommentti</Label>
                <Textarea
                  id="kommentti"
                  rows={2}
                  value={kommentti}
                  onChange={(e) => setKommentti(e.target.value)}
                  placeholder="Esim. 50/50 vanteet tai satuloiden logot värillä"
                />
              </div>

              {/* Esitäytetyt kulutukset pysyvät näkyvissä kenttien vieressä:
                  useammalle värille jaettaessa on tiedettävä mistä summasta
                  ollaan jakamassa ja paljonko on jo jaettu. */}
              <div
                className={
                  onMuu ? "grid gap-4" : "grid gap-4 sm:grid-cols-[1fr_13rem] sm:items-start"
                }
              >
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="kulutus" className="text-xs text-muted-foreground">
                      {valittuVari?.nimi ?? "Pääväri"} (g){onMuu ? " *" : ""}
                    </Label>
                    <Input
                      id="kulutus"
                      type="number"
                      min="0"
                      step="1"
                      value={kentanArvo(kulutusSyote, oletusKulutusG)}
                      onChange={(e) => setKulutusSyote(e.target.value)}
                    />
                  </div>
                  {lisavarit.map((lisa) => (
                    <div
                      key={lisa.avain}
                      className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end"
                    >
                      <div className="grid gap-1">
                        <Label
                          htmlFor={`lisavari_${lisa.avain}`}
                          className="text-xs text-muted-foreground"
                        >
                          Lisäväri
                        </Label>
                        <Select
                          value={lisa.variId}
                          onValueChange={(v) => paivitaLisavari(lisa.avain, { variId: v })}
                        >
                          <SelectTrigger id={`lisavari_${lisa.avain}`} className="w-full">
                            <SelectValue placeholder="Valitse väri" />
                          </SelectTrigger>
                          <SelectContent>
                            {lisavarinVaihtoehdot.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.nimi}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end gap-2 sm:contents">
                        <div className="grid min-w-0 flex-1 gap-1 sm:flex-none">
                          <Label
                            htmlFor={`lisakulutus_${lisa.avain}`}
                            className="text-xs text-muted-foreground"
                          >
                            Kulutus (g) *
                          </Label>
                          <Input
                            id={`lisakulutus_${lisa.avain}`}
                            type="number"
                            min="1"
                            step="1"
                            value={lisa.kulutus}
                            onChange={(e) =>
                              paivitaLisavari(lisa.avain, { kulutus: e.target.value })
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Poista lisäväri"
                          onClick={() =>
                            setLisavarit((vanhat) => vanhat.filter((l) => l.avain !== lisa.avain))
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div>
                    <Button type="button" variant="outline" size="sm" onClick={lisaaLisavari}>
                      <Plus className="size-4" />
                      Lisää väri
                    </Button>
                  </div>
                </div>

                {!onMuu && (
                <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Esitäytetyt kulutukset</span>
                  <span className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">Pääväri</span>
                    <span className="shrink-0">{oletusKulutusG} g</span>
                  </span>
                  {paavarinAutomaatit.map((r) => (
                    <span key={r.avain} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{r.nimi}</span>
                      <span className="shrink-0">{r.kulutusG} g</span>
                    </span>
                  ))}
                  <span className="flex justify-between gap-3 border-t pt-1">
                    <span>Yhteensä</span>
                    <span className="shrink-0">{oletusYhteensaG} g</span>
                  </span>
                  <span className="mt-1 flex justify-between gap-3 border-t pt-1 text-foreground">
                    <span>Nyt jaettu</span>
                    <span className="shrink-0">{Math.round(kulutusYhteensaG * 100) / 100} g</span>
                  </span>
                </div>
                )}
              </div>

              <div className="grid gap-1 sm:max-w-[16rem]">
                <Label htmlFor="hinta" className="text-xs text-muted-foreground">
                  Hinta €
                  {laskettuHintaEur !== null && ` - laskettu ${muotoileEuro(laskettuHintaEur)}`}
                </Label>
                <Input
                  id="hinta"
                  type="number"
                  min="0"
                  step="0.01"
                  value={kentanArvo(hintaSyote, laskettuHintaEur ?? 0)}
                  onChange={(e) => setHintaSyote(e.target.value)}
                />
                {onMuu && (
                  <p className="text-xs text-muted-foreground">
                    Ilman omaa hintaa veloitus on maalinkulutus + kate.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Maalaajalla ei ole hinnoittelutietoja, joten laskettua hintaa ei
              synny kiinteän kategoriahinnan puuttuessa: hinta kirjoitetaan
              käsin samaan tapaan kuin custom-rivillä. */}
          {!laskettuHinnoittelu && !kulutusKasin && valittuVari && (kategoria || onMuu) && (
            <div className="grid gap-1 sm:max-w-[16rem]">
              <Label htmlFor="hinta_kasin" className="text-xs text-muted-foreground">
                Hinta €
                {laskettuHintaEur !== null && ` - kiinteä ${muotoileEuro(laskettuHintaEur)}`}
              </Label>
              <Input
                id="hinta_kasin"
                type="number"
                min="0"
                step="0.01"
                value={kentanArvo(hintaSyote, laskettuHintaEur ?? 0)}
                onChange={(e) => setHintaSyote(e.target.value)}
              />
              {laskettuHintaEur === null && (
                <p className="text-xs text-muted-foreground">
                  Kategorialle ei ole kiinteää hintaa - kirjoita asiakkaalta veloitettava hinta.
                </p>
              )}
            </div>
          )}

          {kategoria && valittuVari && riviHintaEur !== null && (
            <p className="text-sm break-words text-muted-foreground">
              {hintaKasin ? "Hinta: " : "Laskettu hinta: "}
              <span className="font-medium text-foreground">{muotoileEuro(riviHintaEur)}</span>
              {lisatoidenTulos.hinnatYhteensaEur > 0 && yksikkohintaEur !== null && (
                <>
                  {" ("}
                  {muotoileEuro(yksikkohintaEur)}
                  {" + lisätyöt "}
                  {muotoileEuro(lisatoidenTulos.hinnatYhteensaEur)}
                  {")"}
                </>
              )}
              {perusvarinKulutusG > 0 && (
                <>
                  {" - maalia "}
                  {[
                    perusvarinKulutusG,
                    ...(kulutusKasin ? lisavarit.map((l) => numeroTaiOletus(l.kulutus, 0)) : []),
                    ...lisatoidenTulos.rivit.map((r) => r.kulutusG),
                  ]
                    .filter((g) => g > 0)
                    .join(" + ")}
                  {" g"}
                </>
              )}
            </p>
          )}

          <div>
            <Button type="button" variant="outline" onClick={lisaaKoriin} disabled={!variId}>
              <Plus className="size-4" />
              Lisää koriin
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4" />
            Kori ({kori.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {kori.length === 0 && (
            <p className="text-sm text-muted-foreground">Kori on tyhjä - lisää osia yllä.</p>
          )}
          {/* Viisi saraketta ei mahdu puhelimeen: taulukko vieri vaakasuunnassa
              ja hinta sekä poistonappi jäivät ruudun ulkopuolelle. Kapealla
              ruudulla rivit ovat omina lohkoinaan, sm-koosta ylöspäin taulukko. */}
          {kori.length > 0 && (
            <div className="grid gap-2 sm:hidden">
              {kori.map((r) => (
                <div key={r.avain} className="grid gap-1 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-medium break-words">{r.osaNimi}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="-mt-1 shrink-0"
                      onClick={() => poistaKorista(r.avain)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <span className="text-sm break-words text-muted-foreground">
                    {[r.variNimi, r.toinenVariNimi, ...r.lisavarit.map((l) => l.variNimi)]
                      .filter(Boolean)
                      .join(" + ")}
                  </span>
                  {/* Lisätyöt omina riveinään: lisätyön hinta ei saa piiloutua
                      loppusummaan, vaan asiakkaan on nähtävä mistä maksaa. */}
                  {r.lisatyot.map((l, i) => (
                    <span
                      key={`${r.avain}-${i}`}
                      className="flex min-w-0 justify-between gap-2 text-xs text-muted-foreground"
                    >
                      <span className="min-w-0 truncate">
                        {l.nimi}
                        {l.maara > 1 && ` x${l.maara}`}
                        {l.osuusProsentti !== null && ` ${l.osuusProsentti} %`}
                        {" · "}
                        {l.variNimi}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {l.hintaEur > 0 ? muotoileEuro(l.hintaEur) : "sisältyy"}
                      </span>
                    </span>
                  ))}
                  {r.kommentti && (
                    <span className="text-xs break-words text-muted-foreground italic">
                      {r.kommentti}
                    </span>
                  )}
                  <span className="text-sm font-medium">{muotoileEuro(r.yksikkohintaEur)}</span>
                </div>
              ))}
            </div>
          )}
          {kori.length > 0 && (
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Osa</TableHead>
                    <TableHead>Värit ja lisätyöt</TableHead>
                    <TableHead>Hinta</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kori.map((r) => (
                    <TableRow key={r.avain}>
                      <TableCell>
                        {r.osaNimi}
                        {r.kommentti && (
                          <span className="block text-xs text-muted-foreground italic">
                            {r.kommentti}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.variNimi}
                        {/* Vanhan työn pohjaväri ja lakka ovat yhä työrivillä.
                            Uusilla ne tulevat lisätyöriveinä alle. */}
                        {r.toinenVariNimi && (
                          <span className="block text-xs text-muted-foreground">
                            {r.toinenVariRooli === "lakka" ? "Lakka" : "Pohjaväri"} ·{" "}
                            {r.toinenVariNimi}
                          </span>
                        )}
                        {r.lisavarit.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            + {r.lisavarit.map((l) => l.variNimi).join(" + ")}
                          </span>
                        )}
                        {r.lisatyot.map((l, i) => (
                          <span
                            key={`${r.avain}-${i}`}
                            className="block text-xs text-muted-foreground"
                          >
                            {l.nimi}
                            {l.maara > 1 && ` x${l.maara}`}
                            {l.osuusProsentti !== null && ` ${l.osuusProsentti} %`}
                            {" · "}
                            {l.variNimi}
                            {l.hintaEur > 0 && ` · ${muotoileEuro(l.hintaEur)}`}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell>{muotoileEuro(r.yksikkohintaEur)}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => poistaKorista(r.avain)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  </TableBody>
              </Table>
            </div>
          )}
          {kori.length > 0 && (
            <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-4">
              <div className="grid gap-1.5">
                <Label htmlFor="alennus">Alennus %</Label>
                <Input
                  id="alennus"
                  className="w-28"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  placeholder="0"
                  value={alennus}
                  onChange={(e) => setAlennus(e.target.value)}
                />
              </div>
              <div className="grid flex-1 gap-1 text-sm sm:flex-none">
                <div className="flex justify-between gap-6">
                  <span className="text-muted-foreground">Välisumma</span>
                  <span>{muotoileEuro(koriYhteensa)}</span>
                </div>
                {alennusProsentti > 0 && (
                  <div className="flex justify-between gap-6 text-muted-foreground">
                    <span>Alennus {muotoileProsentti(alennusProsentti)}</span>
                    <span>-{muotoileEuro(alennusEur)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-6 border-t pt-1">
                  <span className="font-medium">Yhteensä</span>
                  <span className="text-lg font-semibold">{muotoileEuro(loppusumma)}</span>
                </div>
              </div>
            </div>
          )}
          {/* Vastaanotto on tavallisin: osat tuodaan ensin ja maalataan kun
              vuoro tulee. Heti aloittaminen on toinen nappi samalla rivillä. */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => kasitteleTallennus(muokattavaTyo ? "vaiheessa" : "vastaanotettu")}
              disabled={kaynnissa || kori.length === 0}
            >
              {kaynnissa && <Loader2 className="size-4 animate-spin" />}
              {muokattavaTyo ? "Tallenna muutokset" : "Vastaanota työ"}
            </Button>
            {!muokattavaTyo && (
              <Button
                type="button"
                variant="outline"
                onClick={() => kasitteleTallennus("vaiheessa")}
                disabled={kaynnissa || kori.length === 0}
              >
                Aloita heti
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
