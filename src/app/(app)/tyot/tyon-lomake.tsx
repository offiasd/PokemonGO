"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Palette, Plus, ShoppingCart, Trash2 } from "lucide-react";

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
  PAKOLLINEN_TOINEN_VARI_ROOLI,
  TOINEN_VARI_ROOLIN_NIMI,
  VALINNAINEN_TOINEN_VARI_ROOLI,
} from "@/lib/vakiot";
import type {
  Alkupera,
  MaaliTyyppi,
  MyytavaMaaliTyyppi,
  ToinenVariRooli,
} from "@/lib/supabase/database.types";
import { kategorianKiinteaHinta, valitseKate, type Kateprosentit } from "@/lib/hinnat";

import { aloitaTyo, paivitaTyo } from "./actions";

interface Osa {
  id: string;
  nimi: string;
  lisatiedot: string | null;
  lakkaus_kulutus_g: number | null;
  tyokustannusKerroksittain: number[];
  /** Kate-% erikseen EU- ja ei-EU-väreille. */
  kateprosentit: Kateprosentit;
  kateKiintea: number;
  manuaalinen_hinta: number | null;
}

interface Vari {
  id: string;
  nimi: string;
  alkupera: Alkupera;
  tyyppi: MaaliTyyppi;
  saldo_g: number;
  varattu_g: number;
  hintalisa_prosentti: number;
  vaatii_lakkauksen: boolean;
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
  osaId: string;
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
}

/** Lisäväririvi lomakkeella: väri valitaan ja kulutus kirjoitetaan itse. */
interface LisavariSyote {
  avain: string;
  variId: string;
  kulutus: string;
}

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
  muokattavaTyo,
}: {
  osat: Osa[];
  varit: Vari[];
  kategoriahinnat: Kategoriahinta[];
  variKategoriat: VariKategoria[];
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
  const [kategoria, setKategoria] = useState<MyytavaMaaliTyyppi | "">("");
  const [variId, setVariId] = useState("");
  const [lakkausValittu, setLakkausValittu] = useState(false);
  const [toinenVariId, setToinenVariId] = useState("");

  // Custom-työssä osa maalataan useammalla värillä kuin rivin omat kaksi, ja
  // maalaaja päättää itse miten kulutus jakautuu ja mitä työstä veloitetaan.
  const [custom, setCustom] = useState(false);
  const [kommentti, setKommentti] = useState("");
  // null = kenttää ei ole koskettu, jolloin siinä näkyy kategorian esitäyttö ja
  // se seuraa värin vaihtoa. Merkkijono on maalaajan oma arvo.
  const [kulutusSyote, setKulutusSyote] = useState<string | null>(null);
  const [toinenKulutusSyote, setToinenKulutusSyote] = useState<string | null>(null);
  const [hintaSyote, setHintaSyote] = useState<string | null>(null);
  const [lisavarit, setLisavarit] = useState<LisavariSyote[]>([]);
  const seuraavaLisavariAvain = useRef(0);

  const valittuOsa = useMemo(() => osat.find((o) => o.id === osaId), [osat, osaId]);
  const valittuVari = useMemo(() => varit.find((v) => v.id === variId), [varit, variId]);
  const valittuToinenVari = useMemo(
    () => varit.find((v) => v.id === toinenVariId),
    [varit, toinenVariId]
  );

  const osanKategoriat = useMemo(
    () => kategoriahinnat.filter((k) => k.osa_id === osaId),
    [kategoriahinnat, osaId]
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
  // varattaisiin lakkaa nolla grammaa eikä varasto vähenisi oikein.
  const lakkausMahdollinen = Boolean(valinnainenRooli) && !pakollinenRooli && toisenKulutusG > 0;
  const lakattu = lakkausMahdollinen && lakkausValittu;

  const toinenVariRooli = pakollinenRooli ?? (lakattu ? valinnainenRooli : undefined);
  const toinenVariAktiivinen = Boolean(toinenVariRooli);
  const toisenVarinKategoria: MaaliTyyppi | undefined =
    toinenVariRooli === "pohjavari" ? "pohjavari" : toinenVariRooli === "lakka" ? "transparent" : undefined;
  const toisenVarinVaihtoehdot = useMemo(
    () =>
      varit.filter(
        (v) =>
          v.id !== variId &&
          (!toisenVarinKategoria || variKategoriaKartta.get(v.id)?.has(toisenVarinKategoria))
      ),
    [varit, variId, toisenVarinKategoria, variKategoriaKartta]
  );

  // Kategorian kulutus on esitäyttö. Custom-työssä sen voi jakaa väreille
  // toisin, mutta oletus jää näkyviin arvion tueksi.
  const oletusKulutusG = valittuKategoriahinta?.arvioitu_kulutus_g ?? 0;
  const oletusToinenKulutusG = toisenKulutusG;
  const arvioituKulutusG = custom
    ? numeroTaiOletus(kulutusSyote ?? "", oletusKulutusG)
    : oletusKulutusG;
  const toinenArvioituKulutusG = custom
    ? numeroTaiOletus(toinenKulutusSyote ?? "", oletusToinenKulutusG)
    : oletusToinenKulutusG;

  // Hinnoittelujärjestys on sama kuin osan omalla sivulla: adminin kategorialle
  // asettama kiinteä hinta ensin, sitten osan manuaalinen hinta, ja vasta jos
  // kumpaakaan ei ole asetettu, värin ostohinnasta + katteesta laskettu
  // suositushinta. Kiinteä hinta korvaa koko kustannuslaskennan, joten sitä ei
  // koroteta työkustannuksella eikä maalin hinnalla - vain värikohtaisella
  // hintalisällä, kuten laskettuakin hintaa.
  const laskettuHintaEur = useMemo(() => {
    if (!valittuKategoriahinta || !valittuVari || !valittuOsa) return null;
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
    if (toinenVariAktiivinen && valittuToinenVari) {
      kustannus += (oletusToinenKulutusG / 1000) * valittuToinenVari.kokonaishinta;
    }
    // Kate valitaan värien alkuperästä: EU:n ulkopuolelta tilaaminen on
    // työläämpää, joten sille on oma prosentti. Valinnainen lakka lasketaan
    // mukaan samoin kuin sen maalikustannus.
    const kate = valitseKate(
      valittuOsa.kateprosentit,
      valittuVari.alkupera,
      toinenVariAktiivinen ? valittuToinenVari?.alkupera : undefined
    );
    // Lakattu työ voi olla omalla kiinteällä hinnallaan: se on kalliimpi kuin
    // lakkaamaton. Candyllä ja illusionilla lakka kuuluu hintaan aina, joten
    // niillä kategorian oma hinta on ainoa.
    const kategorianHinta =
      kategorianKiinteaHinta(valittuKategoriahinta, !pakollinenRooli && lakattu) ??
      valittuOsa.manuaalinen_hinta ??
      Math.round((kustannus * (1 + kate / 100) + valittuOsa.kateKiintea) * 100) / 100;
    const lisa = kategorianHinta * (valittuVari.hintalisa_prosentti / 100);
    return Math.round((kategorianHinta + lisa) * 100) / 100;
  }, [
    valittuKategoriahinta,
    valittuVari,
    valittuOsa,
    valittuToinenVari,
    toinenVariAktiivinen,
    oletusKulutusG,
    oletusToinenKulutusG,
    kategoria,
    lakattu,
    pakollinenRooli,
  ]);

  // Custom-työn hinta on maalaajan päätettävissä: laskettu hinta on vain
  // lähtöarvo, koska monivärityön hintaa ei voi johtaa kategoriasta.
  const yksikkohintaEur =
    custom && laskettuHintaEur !== null
      ? Math.round(numeroTaiOletus(hintaSyote ?? "", laskettuHintaEur) * 100) / 100
      : laskettuHintaEur;

  // Koskematon kenttä näyttää esitäytön ja seuraa kategorian tai värin vaihtoa;
  // kirjoitettu arvo jää voimaan.
  const kentanArvo = (syote: string | null, oletus: number) =>
    syote ?? (oletus > 0 ? String(oletus) : "");

  // Sama väri ei voi olla rivillä kahdesti: pääväri, pohjaväri ja jo lisätyt
  // ovat poissa valittavista.
  const lisavarinVaihtoehdot = useMemo(() => {
    const varatut = new Set([variId, toinenVariId].filter(Boolean));
    return varit.filter((v) => !varatut.has(v.id));
  }, [varit, variId, toinenVariId]);

  const lisavarienKulutusG = lisavarit.reduce(
    (summa, l) => summa + numeroTaiOletus(l.kulutus, 0),
    0
  );
  const kulutusYhteensaG =
    arvioituKulutusG + (toinenVariAktiivinen ? toinenArvioituKulutusG : 0) + lisavarienKulutusG;
  const oletusYhteensaG =
    oletusKulutusG + (toinenVariAktiivinen ? oletusToinenKulutusG : 0);

  function vaihdaOsa(v: string) {
    setOsaId(v);
    setKategoria("");
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
    tyhjennaCustom();
  }

  function vaihdaKategoria(v: string) {
    setKategoria(v as MyytavaMaaliTyyppi);
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
  }

  /** Custom-valinnat nollautuvat aina rivin mukana, ei työn mukana. */
  function tyhjennaCustom() {
    setCustom(false);
    setKommentti("");
    setKulutusSyote(null);
    setToinenKulutusSyote(null);
    setHintaSyote(null);
    setLisavarit([]);
  }

  function tyhjennaRivilomake() {
    setOsaId("");
    setKategoria("");
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
    tyhjennaCustom();
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
    if (!valittuOsa || !valittuVari || yksikkohintaEur === null) {
      toast.error("Valitse osa, kategoria ja väri.");
      return;
    }
    if (toinenVariAktiivinen && !toinenVariId) {
      toast.error(`Valitse ${(toinenVariRooli && TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli]) ?? "toinen väri"}.`);
      return;
    }
    if (arvioituKulutusG <= 0) {
      toast.error("Anna maalinkulutus - ilman sitä varastosta ei varata oikeaa määrää.");
      return;
    }
    // Jokainen lisäväri varaa maalia varastosta, joten kulutus on pakko tietää.
    // Ilman tarkistusta rivi tallentuisi nollalla eikä saldo vähenisi.
    const kelvottomat = custom
      ? lisavarit.filter((l) => !l.variId || numeroTaiOletus(l.kulutus, 0) <= 0)
      : [];
    if (kelvottomat.length > 0) {
      toast.error("Valitse jokaiselle lisävärille väri ja arvioitu kulutus.");
      return;
    }
    // Sama väri kahdesti samalla rivillä varaisi maalia kahteen kertaan ja
    // kaatuisi vasta kannassa. Kategorian vaihto voi jättää lisävärin osumaan
    // uuteen päävääriin, joten tarkistus on tässä eikä pelkässä valikossa.
    const kaytetyt = [variId, toinenVariAktiivinen ? toinenVariId : null].filter(Boolean);
    const lisavarienIdt = custom ? lisavarit.map((l) => l.variId) : [];
    if (new Set([...kaytetyt, ...lisavarienIdt]).size !== kaytetyt.length + lisavarienIdt.length) {
      toast.error("Sama väri on rivillä kahdesti - valitse eri värit.");
      return;
    }

    const rivi: KoriRivi = {
      avain: String(seuraavaAvain.current++),
      osaId: valittuOsa.id,
      osaNimi: valittuOsa.nimi,
      variId: valittuVari.id,
      variNimi: valittuVari.nimi,
      arvioituKulutusG,
      yksikkohintaEur,
      toinenVariId: toinenVariAktiivinen ? toinenVariId : null,
      toinenVariNimi: toinenVariAktiivinen ? (valittuToinenVari?.nimi ?? null) : null,
      toinenVariRooli: toinenVariAktiivinen ? (toinenVariRooli ?? null) : null,
      toinenArvioituKulutusG: toinenVariAktiivinen ? toinenArvioituKulutusG : null,
      custom,
      kommentti: custom ? kommentti.trim() || null : null,
      lisavarit: custom
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
    }));

    aloita(async () => {
      try {
        if (muokattavaTyo) {
          await paivitaTyo(muokattavaTyo.id, asiakas.trim() || null, syotteet, alennusProsentti);
          toast.success("Työ päivitetty ja varaukset korjattu varastoon.");
        } else {
          await aloitaTyo(asiakas.trim() || null, syotteet, alennusProsentti, tila);
          toast.success(
            tila === "vastaanotettu"
              ? "Työ vastaanotettu ja maali varattu varastosta."
              : "Työ aloitettu ja maali varattu varastosta."
          );
        }
        router.push("/tyot");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : muokattavaTyo
              ? "Työn päivitys epäonnistui."
              : "Työn tallennus epäonnistui."
        );
      }
    });
  }

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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="osa_id">Osa</Label>
              <Select value={osaId} onValueChange={vaihdaOsa}>
                <SelectTrigger id="osa_id" className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                  <SelectValue placeholder="Valitse osa" />
                </SelectTrigger>
                <SelectContent>
                  {osat.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nimi}
                      {o.lisatiedot && (
                        <span className="text-muted-foreground"> - {o.lisatiedot}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="kategoria">Kategoria</Label>
              <Select value={kategoria} onValueChange={vaihdaKategoria} disabled={!osaId}>
                <SelectTrigger id="kategoria" className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate">
                  <SelectValue placeholder="Valitse kategoria" />
                </SelectTrigger>
                <SelectContent>
                  {osanKategoriat.length === 0 && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      Osalle ei ole asetettu hintoja
                    </p>
                  )}
                  {osanKategoriat.map((k) => (
                    <SelectItem key={k.maali_tyyppi} value={k.maali_tyyppi}>
                      {myytavaMaaliTyypinNimi(k.maali_tyyppi)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {kategoria && (
            <div className="grid gap-2">
              <Label htmlFor="vari_id">Väri</Label>
              <Select
                value={variId}
                onValueChange={(uusiId) => {
                  setVariId(uusiId);
                  // Lakkaus ei ole kategoriakohtainen pakko vaan värikohtainen
                  // tieto, joten valinta seuraa väriä molempiin suuntiin: uusi
                  // väri joka vaatii lakkauksen kytkee sen päälle ja väri joka
                  // ei vaadi ottaa sen pois. Käyttäjä voi silti muuttaa
                  // valintaa itse - siksi se on ehdotus eikä lukko.
                  setLakkausValittu(
                    varit.find((v) => v.id === uusiId)?.vaatii_lakkauksen === true
                  );
                }}
              >
                <SelectTrigger id="vari_id" className="w-full">
                  <SelectValue placeholder="Valitse väri" />
                </SelectTrigger>
                <SelectContent>
                  {kategorianVarit.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nimi}
                      {v.hintalisa_prosentti > 0 && ` (+${v.hintalisa_prosentti} %)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          {toinenVariAktiivinen && toinenVariRooli && (
            <div className="grid gap-2 rounded-md border bg-muted/30 p-4">
              <Label htmlFor="toinen_vari_id">
                {TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli]}
                {pakollinenRooli ? " *" : ""}
              </Label>
              <Select value={toinenVariId} onValueChange={setToinenVariId}>
                <SelectTrigger id="toinen_vari_id" className="w-full">
                  <SelectValue
                    placeholder={`Valitse ${TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli].toLowerCase()}`}
                  />
                </SelectTrigger>
                <SelectContent>
                  {toisenVarinVaihtoehdot.length === 0 && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      Ei värejä tässä kategoriassa - lisää lisäkategoria värille
                    </p>
                  )}
                  {toisenVarinVaihtoehdot.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nimi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom-työ: sama osa maalataan usealla värillä, kulutus jaetaan
              käsin ja hinta sovitaan tapauskohtaisesti. Nappi tulee näkyviin
              osan ja kategorian valinnan jälkeen, koska esitäytöt tulevat
              kategorialta. */}
          {osaId && kategoria && !custom && (
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

          {custom && kategoria && (
            <div className="grid gap-4 rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="font-medium">Custom-työ</Label>
                  <p className="text-xs text-muted-foreground">
                    Jaa esitäytetty kulutus väreille ja aseta työlle hinta.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={tyhjennaCustom}>
                  Peruuta
                </Button>
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
              <div className="grid gap-4 sm:grid-cols-[1fr_13rem] sm:items-start">
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="kulutus" className="text-xs text-muted-foreground">
                      {valittuVari?.nimi ?? "Pääväri"} (g)
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
                  {toinenVariAktiivinen && toinenVariRooli && (
                    <div className="grid gap-1">
                      <Label htmlFor="toinen_kulutus" className="text-xs text-muted-foreground">
                        {valittuToinenVari?.nimi ?? TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli]} (g)
                      </Label>
                      <Input
                        id="toinen_kulutus"
                        type="number"
                        min="0"
                        step="1"
                        value={kentanArvo(toinenKulutusSyote, oletusToinenKulutusG)}
                        onChange={(e) => setToinenKulutusSyote(e.target.value)}
                      />
                    </div>
                  )}

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

                <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Esitäytetyt kulutukset</span>
                  <span className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">Pääväri</span>
                    <span className="shrink-0">{oletusKulutusG} g</span>
                  </span>
                  {toinenVariAktiivinen && toinenVariRooli && (
                    <span className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli]}
                      </span>
                      <span className="shrink-0">{oletusToinenKulutusG} g</span>
                    </span>
                  )}
                  <span className="flex justify-between gap-3 border-t pt-1">
                    <span>Yhteensä</span>
                    <span className="shrink-0">{oletusYhteensaG} g</span>
                  </span>
                  <span className="mt-1 flex justify-between gap-3 border-t pt-1 text-foreground">
                    <span>Nyt jaettu</span>
                    <span className="shrink-0">{Math.round(kulutusYhteensaG * 100) / 100} g</span>
                  </span>
                </div>
              </div>

              <div className="grid gap-1 sm:max-w-[12rem]">
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
              </div>
            </div>
          )}

          {kategoria && valittuVari && yksikkohintaEur !== null && (
            <p className="text-sm break-words text-muted-foreground">
              {custom ? "Hinta: " : "Laskettu hinta: "}
              <span className="font-medium text-foreground">{muotoileEuro(yksikkohintaEur)}</span>
              {arvioituKulutusG > 0 && (
                <>
                  {" - maalia "}
                  {[
                    arvioituKulutusG,
                    ...(toinenVariAktiivinen && toinenArvioituKulutusG > 0
                      ? [toinenArvioituKulutusG]
                      : []),
                    ...(custom ? lisavarit.map((l) => numeroTaiOletus(l.kulutus, 0)) : []),
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
                    <TableHead>Väri</TableHead>
                    <TableHead>Pohjaväri / lakka</TableHead>
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
                        {r.lisavarit.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            + {r.lisavarit.map((l) => l.variNimi).join(" + ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.toinenVariNimi ?? "-"}
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
