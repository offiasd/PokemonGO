"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  ScanLine,
  ScanText,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KayttotarkoituksenKuvake } from "@/components/kayttotarkoituksen-kuvake";
import { createClient } from "@/lib/supabase/client";
import { lataaKuitinTiedosto } from "@/lib/kuvanpakkaus";
import type { AlvErittelynRivi } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { muotoileEuro } from "@/lib/vakiot";
import {
  ehdotaLuokittelu,
  kayttotarkoituksenNimi,
  kuluinaYhteensa,
  tarkistaTasmays,
  type Kayttotarkoitus,
  type KayttotarkoituksenTiedot,
} from "@/lib/kulut";

import { korvaaKuitinTiedosto, tallennaKuitti } from "../actions";

interface RiviSyote {
  avain: string;
  teksti: string;
  maara: number | null;
  bruttoEur: number;
  verokanta: number | null;
  kayttotarkoitus: Kayttotarkoitus | null;
  kululuokkaId: string | null;
  muistiinpano: string | null;
}

/**
 * Edge Functionin lue-kuitti palauttama poiminta.
 * Sama rakenne kuin supabase/functions/lue-kuitti/poiminta.ts.
 */
interface PoimittuKuitti {
  toimittaja: string | null;
  paivays: string | null;
  maksupaiva: string | null;
  loppusumma_eur: number | null;
  rivit: { teksti: string; maara: number | null; brutto_eur: number; verokanta: number | null }[];
  alv_erittely: AlvErittelynRivi[];
}

const EI_LUOKKAA = "ei-luokkaa";

/**
 * Kuinka kauan riviä pidetään pohjassa ennen kuin valikko aukeaa.
 *
 * Napautus vaihtaa käyttötarkoitusta, joten valikon pitää vaatia selvästi
 * pidempi painallus - muuten harjoittelematon sormi avaisi sen vahingossa.
 */
const PITKA_PAINALLUS_MS = 450;

function luku(arvo: string): number {
  const numero = Number(arvo.replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Yksi kuitti: tiedot, rivit ja niiden luokittelu.
 *
 * Rivit ovat luettava lista eivätkä kenttärivistö. Kuitti luetaan useammin
 * kuin sitä korjataan, ja tavallisin korjaus on käyttötarkoituksen vaihto -
 * se on yhden painalluksen päässä. Kaikki muu on rivin muokkausikkunassa.
 *
 * Rivit ovat paikallista tilaa ja tallentuvat kerralla: kuitti on yksi tosite,
 * ja puolikas tallennus jättäisi sen tilaan jota ei ole olemassa.
 */
export function KuitinLomake({
  kuitti,
  rivit: alkuRivit,
  luokat,
  opitut,
  kayttotarkoitukset,
  naytaAlv,
  onTosite,
}: {
  kuitti: {
    id: string;
    toimittaja: string | null;
    paivays: string;
    maksupaiva: string | null;
    loppusummaEur: number;
    muistiinpano: string | null;
    tila: "luonnos" | "tarkistettava" | "valmis";
    alvErittely: AlvErittelynRivi[] | null;
  };
  rivit: RiviSyote[];
  luokat: { id: string; nimi: string }[];
  /** Aiemmin luokitellut tuotetekstit normalisoituna avaimena. */
  opitut: Record<string, { kayttotarkoitus: Kayttotarkoitus; kululuokkaId: string | null }>;
  kayttotarkoitukset: KayttotarkoituksenTiedot[];
  /** ALV-tiedot näkyvät vain ALV-rekisterissä oleville. */
  naytaAlv: boolean;
  /** Onko kuittiin liitetty tosite. Ilman sitä ei ole mitä lukea. */
  onTosite: boolean;
}) {
  const router = useRouter();
  const [tallentaa, tallenna] = useTransition();
  const seuraavaAvain = useRef(0);

  const [toimittaja, setToimittaja] = useState(kuitti.toimittaja ?? "");
  const [paivays, setPaivays] = useState(kuitti.paivays);
  const [maksupaiva, setMaksupaiva] = useState(kuitti.maksupaiva ?? "");
  const [loppusumma, setLoppusumma] = useState(String(kuitti.loppusummaEur));
  const [muistiinpano, setMuistiinpano] = useState(kuitti.muistiinpano ?? "");
  const [rivit, setRivit] = useState<RiviSyote[]>(alkuRivit);
  // Erittely tallennetaan vaikka yritys ei olisi ALV-rekisterissä: täsmäytys
  // nojaa siihen, ja rekisteröitymisen tullessa se on jo historiassa.
  const [alvErittely, setAlvErittely] = useState<AlvErittelynRivi[] | null>(kuitti.alvErittely);
  const [lukee, setLukee] = useState(false);
  const [vaihtaa, setVaihtaa] = useState(false);
  const [poiminnanHuomiot, setPoiminnanHuomiot] = useState<string[]>([]);
  const [tiedotAuki, setTiedotAuki] = useState(false);
  const [muokattavaRivi, setMuokattavaRivi] = useState<string | null>(null);
  const [avoinValikko, setAvoinValikko] = useState<string | null>(null);
  const painallusAjastin = useRef<number | null>(null);
  const pitkaPainallus = useRef(false);
  const automaattiLuettu = useRef(false);
  const kameraRef = useRef<HTMLInputElement>(null);
  const tiedostoRef = useRef<HTMLInputElement>(null);

  const opittuKartta = new Map(
    Object.entries(opitut).map(([avain, arvo]) => [
      avain,
      {
        kayttotarkoitus: arvo.kayttotarkoitus,
        luokka: luokat.find((l) => l.id === arvo.kululuokkaId)?.nimi ?? null,
      },
    ])
  );

  const paivita = (avain: string, muutos: Partial<RiviSyote>) =>
    setRivit((vanhat) => vanhat.map((r) => (r.avain === avain ? { ...r, ...muutos } : r)));

  /**
   * Rivin tekstin perusteella päätelty luokittelu.
   *
   * Ehdotus, ei automaatti: käyttäjä voi aina vaihtaa sen. Käyttötarkoitus,
   * jota tämä yritysmuoto ei tunne, laskeutuu yksityisotoksi - luokka ei saa
   * jäädä roikkumaan tilaan jota ei ole olemassa.
   */
  function ehdotusTekstille(teksti: string): Partial<RiviSyote> {
    const ehdotus = ehdotaLuokittelu(teksti, opittuKartta);
    if (!ehdotus) return {};
    const sallittu = kayttotarkoitukset.some((k) => k.arvo === ehdotus.kayttotarkoitus);
    return {
      kayttotarkoitus: sallittu ? ehdotus.kayttotarkoitus : "yksityisotto",
      kululuokkaId: ehdotus.luokka
        ? (luokat.find((l) => l.nimi === ehdotus.luokka)?.id ?? null)
        : null,
    };
  }

  /**
   * Napautus vaihtaa käyttötarkoituksen seuraavaan.
   *
   * Tavallisin korjaus on juuri tämä, ja käytettävissä olevia vaihtoehtoja on
   * kolme tai neljä - kierto on nopeampi kuin valikon avaaminen ja rivin
   * etsiminen sieltä. Luokittelematon rivi hyppää ensimmäiseen.
   */
  function napautaRivia(rivi: RiviSyote) {
    // Pitkä painallus avasi jo valikon; sitä seuraava napautus ei saa vaihtaa
    // käyttötarkoitusta vahingossa.
    if (pitkaPainallus.current) {
      pitkaPainallus.current = false;
      return;
    }
    const arvot = kayttotarkoitukset.map((k) => k.arvo);
    if (arvot.length === 0) return;
    const nykyinen = rivi.kayttotarkoitus ? arvot.indexOf(rivi.kayttotarkoitus) : -1;
    paivita(rivi.avain, { kayttotarkoitus: arvot[(nykyinen + 1) % arvot.length] });
  }

  function aloitaPainallus(avain: string) {
    pitkaPainallus.current = false;
    painallusAjastin.current = window.setTimeout(() => {
      pitkaPainallus.current = true;
      setAvoinValikko(avain);
    }, PITKA_PAINALLUS_MS);
  }

  function lopetaPainallus() {
    if (painallusAjastin.current !== null) {
      clearTimeout(painallusAjastin.current);
      painallusAjastin.current = null;
    }
  }

  /** Esitäyttö vain luokittelemattomalle riville, jottei valinta katoa alta. */
  function ehdotaRiville(avain: string, teksti: string) {
    const rivi = rivit.find((r) => r.avain === avain);
    if (!rivi || rivi.kayttotarkoitus) return;
    const ehdotus = ehdotusTekstille(teksti);
    if (!ehdotus.kayttotarkoitus) return;
    paivita(avain, {
      kayttotarkoitus: ehdotus.kayttotarkoitus,
      kululuokkaId: ehdotus.kululuokkaId ?? rivi.kululuokkaId,
    });
  }

  /**
   * Kuitin luku vision-mallilla.
   *
   * Poiminta täyttää lomakkeen mutta ei tallenna: tallennuspolku pysyy yhtenä
   * riippumatta siitä tuliko tieto mallilta vai näppäimistöltä, ja käyttäjä
   * näkee mitä kantaan on menossa. Jos poiminta ei onnistu, lomake jää
   * ennalleen ja käsinsyöttö toimii kuten ennen.
   */
  function lueKuitti(kysyVarmistus = true) {
    if (
      kysyVarmistus &&
      rivit.length > 0 &&
      !window.confirm("Poiminta korvaa nykyiset rivit. Jatketaanko?")
    ) {
      return;
    }
    setLukee(true);
    setPoiminnanHuomiot([]);
    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.functions.invoke("lue-kuitti", {
          body: { kuitti_id: kuitti.id },
        });
        if (error) {
          toast.error(
            "Kuitin luku epäonnistui - tarkista että Edge Function 'lue-kuitti' on julkaistu Supabase-projektissa."
          );
          return;
        }
        if (data?.virhe) {
          toast.warning(data.virhe);
          return;
        }

        const poiminta = data?.poiminta as PoimittuKuitti | undefined;
        if (!poiminta) {
          toast.error("Poiminta ei palauttanut tietoja.");
          return;
        }

        if (poiminta.toimittaja) setToimittaja(poiminta.toimittaja);
        if (poiminta.paivays) setPaivays(poiminta.paivays);
        setMaksupaiva(poiminta.maksupaiva ?? "");
        if (poiminta.loppusumma_eur !== null) setLoppusumma(String(poiminta.loppusumma_eur));
        setAlvErittely(poiminta.alv_erittely.length > 0 ? poiminta.alv_erittely : null);
        setRivit(
          poiminta.rivit.map((rivi, jarjestys) => ({
            avain: `poimittu-${seuraavaAvain.current++}-${jarjestys}`,
            teksti: rivi.teksti,
            maara: rivi.maara,
            bruttoEur: rivi.brutto_eur,
            verokanta: rivi.verokanta,
            kayttotarkoitus: null,
            kululuokkaId: null,
            muistiinpano: null,
            ...ehdotusTekstille(rivi.teksti),
          }))
        );

        const huomiot: string[] = data?.arvio?.huomiot ?? [];
        setPoiminnanHuomiot(huomiot);
        if (huomiot.length > 0) {
          toast.warning("Kuitti luettu, mutta tarkista merkityt kohdat.");
        } else {
          toast.success(`Kuitti luettu: ${poiminta.rivit.length} riviä. Tarkista ja luokittele.`);
        }
      } finally {
        setLukee(false);
      }
    })();
  }

  /**
   * Uudelleenkuvaus.
   *
   * Tarjotaan ennen käsin korjaamista, koska tarkempi kuva korjaa poiminnan
   * kerralla siinä missä naputtelu korjaa yhden rivin.
   */
  async function vaihdaTiedosto(tiedosto: File, lahde: "kamera" | "tiedosto") {
    setVaihtaa(true);
    try {
      const lataus = await lataaKuitinTiedosto(tiedosto);
      if (!lataus.ok) {
        toast.error(lataus.virhe);
        return;
      }
      const tulos = await korvaaKuitinTiedosto(kuitti.id, lataus.polku, lataus.tyyppi, lahde);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        await createClient().storage.from("kuitit").remove([lataus.polku]);
        return;
      }
      toast.success("Uusi kuva tallennettu. Lue kuitti uudelleen.");
      router.refresh();
    } finally {
      setVaihtaa(false);
      if (kameraRef.current) kameraRef.current.value = "";
      if (tiedostoRef.current) tiedostoRef.current.value = "";
    }
  }

  /**
   * Tuore luonnos luetaan heti ilman erillistä painallusta.
   *
   * Kuitti on juuri kuvattu, eikä käyttäjän tarvitse pyytää samaa uudelleen.
   * Ehto on tiukka: vain koskematon luonnos, jossa on tosite mutta ei vielä
   * yhtään riviä eikä tietoja - näin kertaalleen luettu tai käsin täytetty
   * kuitti ei koskaan ylikirjoitu itsestään.
   */
  const tuoreLuonnos =
    onTosite &&
    kuitti.tila === "luonnos" &&
    alkuRivit.length === 0 &&
    kuitti.toimittaja === null &&
    kuitti.loppusummaEur === 0;

  useEffect(() => {
    if (!tuoreLuonnos || automaattiLuettu.current) return;
    automaattiLuettu.current = true;
    lueKuitti(false);
    // lueKuitti lukee tuoreen tilan joka kutsulla, joten se ei kuulu
    // riippuvuuksiin - efekti ajetaan kerran kuittia kohden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuoreLuonnos]);

  // Ajastin ei saa jäädä käymään kun näkymä suljetaan kesken painalluksen.
  useEffect(() => lopetaPainallus, []);

  const riviYhteenvedot = rivit.map((r) => ({
    brutto_eur: r.bruttoEur,
    verokanta: r.verokanta,
    kayttotarkoitus: r.kayttotarkoitus,
  }));
  const tasmays = tarkistaTasmays(luku(loppusumma), riviYhteenvedot);
  const kuluina = kuluinaYhteensa(riviYhteenvedot);
  const luokittelematta = rivit.filter((r) => !r.kayttotarkoitus).length;
  const alvTasmaa = naytaAlv && alvErittely !== null && alvErittely.length > 0;

  // Vihjeet vain niistä luokista joita kuitilla oikeasti on.
  const kaytossaOlevatVihjeet = kayttotarkoitukset.filter(
    (k) => k.vihje && rivit.some((r) => r.kayttotarkoitus === k.arvo)
  );

  const muokattava = rivit.find((r) => r.avain === muokattavaRivi) ?? null;

  function lisaaRivi() {
    const avain = `uusi-${seuraavaAvain.current++}`;
    setRivit((v) => [
      ...v,
      {
        avain,
        teksti: "",
        maara: null,
        bruttoEur: 0,
        verokanta: null,
        kayttotarkoitus: null,
        kululuokkaId: null,
        muistiinpano: null,
      },
    ]);
    setMuokattavaRivi(avain);
  }

  function kasitteleTallennus() {
    if (rivit.some((r) => !r.teksti.trim())) {
      toast.error("Jokaisella rivillä pitää olla teksti.");
      return;
    }
    // Täsmäämätön kuitti merkitään tarkistettavaksi, ei hylätä: lämpöpaperi
    // haalistuu ja rypistyy, ja kuitti on silti tosite.
    const tila = luokittelematta > 0 || !tasmays.tasmaa ? "tarkistettava" : "valmis";

    tallenna(async () => {
      const tulos = await tallennaKuitti(
        kuitti.id,
        {
          toimittaja: toimittaja.trim() || null,
          paivays,
          maksupaiva: maksupaiva || null,
          loppusummaEur: luku(loppusumma),
          muistiinpano: muistiinpano.trim() || null,
          tila,
          alvErittely,
        },
        rivit.map((r) => ({
          teksti: r.teksti,
          maara: r.maara,
          bruttoEur: r.bruttoEur,
          verokanta: r.verokanta,
          kayttotarkoitus: r.kayttotarkoitus,
          kululuokkaId: r.kululuokkaId,
          muistiinpano: r.muistiinpano?.trim() || null,
        }))
      );
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      toast.success(
        tila === "valmis" ? "Kuitti tallennettu ja valmis." : "Kuitti tallennettu tarkistettavaksi."
      );
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <input
        ref={kameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const tiedosto = e.target.files?.[0];
          if (tiedosto) void vaihdaTiedosto(tiedosto, "kamera");
        }}
      />
      {/* Ilman capturea puhelin näyttää oman valitsimensa, jonka kautta
          pääsee myös laitteen asiakirjaskanneriin. Selaimessa ei ole
          rajapintaa skannerin avaamiseen suoraan. */}
      <input
        ref={tiedostoRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const tiedosto = e.target.files?.[0];
          if (tiedosto) void vaihdaTiedosto(tiedosto, "tiedosto");
        }}
      />

      <Card className="overflow-hidden py-0">
        <div className="flex items-start gap-4 p-5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Receipt className="size-6" />
          </span>
          <button
            type="button"
            onClick={() => setTiedotAuki(true)}
            className="grid min-w-0 flex-1 gap-0.5 text-left"
          >
            <span className="truncate text-lg font-semibold">
              {toimittaja.trim() || "Toimittaja puuttuu"}
            </span>
            <span className="text-sm text-muted-foreground">
              {new Date(paivays).toLocaleDateString("fi-FI")} · {rivit.length}{" "}
              {rivit.length === 1 ? "rivi" : "riviä"}
            </span>
            <span className="mt-1 text-3xl font-semibold tabular-nums">
              {muotoileEuro(luku(loppusumma))}
            </span>
            <span className="text-sm text-muted-foreground">
              kuluina {muotoileEuro(kuluina)}
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Muokkaa kuitin tietoja"
            onClick={() => setTiedotAuki(true)}
          >
            <Pencil className="size-4" />
          </Button>
        </div>

        {/* Täsmäytys on kuitin tärkein tieto, joten se on omalla palkillaan
            eikä pikkutekstinä muiden lukujen seassa. */}
        {rivit.length > 0 && (
          <p
            className={cn(
              "flex items-center gap-2 px-5 py-3 text-sm",
              tasmays.tasmaa
                ? "bg-tila-vihrea-pinta text-tila-vihrea-teksti"
                : "bg-tila-keltainen-pinta text-tila-keltainen-teksti"
            )}
          >
            {tasmays.tasmaa ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertTriangle className="size-4 shrink-0" />
            )}
            {tasmays.tasmaa
              ? `Täsmää loppusummaan${alvTasmaa ? " ja alv-erittelyyn" : ""}`
              : `Rivit ${muotoileEuro(tasmays.riviteYhteensa)} - ei täsmää loppusummaan`}
          </p>
        )}

        <div className="grid px-5">
          {rivit.length === 0 &&
            (lukee ? (
              <p className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Luetaan kuittia...
              </p>
            ) : (
              <p className="py-5 text-sm text-muted-foreground">
                Ei rivejä. Lue kuitti tai lisää rivit käsin.
              </p>
            ))}

          {rivit.map((rivi, jarjestys) => {
            const yksityinen = rivi.kayttotarkoitus === "yksityisotto";
            const selite = [
              rivi.kayttotarkoitus
                ? kayttotarkoituksenNimi(rivi.kayttotarkoitus)
                : "Luokittelematta",
              naytaAlv && rivi.verokanta !== null
                ? `alv ${String(rivi.verokanta).replace(".", ",")} %`
                : null,
              !naytaAlv ? (luokat.find((l) => l.id === rivi.kululuokkaId)?.nimi ?? null) : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div key={rivi.avain} className={cn("relative", jarjestys > 0 && "border-t")}>
                <button
                  type="button"
                  aria-label={`${rivi.teksti || "Nimetön rivi"}: ${selite}. Napauta vaihtaaksesi käyttötarkoitusta, pidä pohjassa avataksesi valikon.`}
                  onPointerDown={() => aloitaPainallus(rivi.avain)}
                  onPointerUp={lopetaPainallus}
                  onPointerLeave={lopetaPainallus}
                  onPointerCancel={lopetaPainallus}
                  onClick={() => napautaRivia(rivi)}
                  onContextMenu={(e) => {
                    // Hiiren oikea painike ja näppäimistön valikkonäppäin
                    // avaavat saman valikon kuin pitkä painallus.
                    e.preventDefault();
                    lopetaPainallus();
                    setAvoinValikko(rivi.avain);
                  }}
                  className={cn(
                    "-mx-2 flex w-[calc(100%+1rem)] min-w-0 touch-manipulation items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors select-none hover:bg-accent/50 [-webkit-touch-callout:none]",
                    yksityinen && "opacity-60"
                  )}
                >
                  <KayttotarkoituksenKuvake kayttotarkoitus={rivi.kayttotarkoitus} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate">{rivi.teksti || "Nimetön rivi"}</span>
                    <span
                      className={cn(
                        "truncate text-sm",
                        rivi.kayttotarkoitus === null
                          ? "text-warning"
                          : yksityinen
                            ? "text-muted-foreground"
                            : "text-korostus"
                      )}
                    >
                      {selite}
                    </span>
                  </span>
                  <span className="shrink-0 text-lg tabular-nums">
                    {muotoileEuro(rivi.bruttoEur)}
                  </span>
                </button>

                {/* Valikko avataan ohjatusti, koska napautus on varattu
                    käyttötarkoituksen vaihtoon. Ankkuri on näkymätön ja
                    rivin alareunassa, jotta valikko aukeaa rivin kohdalle. */}
                <DropdownMenu
                  open={avoinValikko === rivi.avain}
                  onOpenChange={(auki) => setAvoinValikko(auki ? rivi.avain : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 block h-0"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => setMuokattavaRivi(rivi.avain)}>
                      <Pencil className="size-4" />
                      Muokkaa riviä
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setRivit((v) => v.filter((r) => r.avain !== rivi.avain))}
                    >
                      <Trash2 className="size-4" />
                      Poista rivi
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <p className="text-sm text-muted-foreground">
            Napauta riviä vaihtaaksesi käyttötarkoitusta · pidä pohjassa muokataksesi
          </p>
          <Button type="button" variant="outline" size="sm" onClick={lisaaRivi}>
            <Plus className="size-4" />
            Lisää rivi
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Poiminta</CardTitle>
          <CardDescription>
            Malli lukee kuitin ja täyttää kentät. Ehdotus, ei totuus - tarkista luvut ennen
            tallennusta.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => lueKuitti()} disabled={lukee || vaihtaa}>
              {lukee ? <Loader2 className="size-4 animate-spin" /> : <ScanText className="size-4" />}
              Lue kuitti
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={lukee || vaihtaa}
              onClick={() => kameraRef.current?.click()}
            >
              {vaihtaa ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              Kuvaa uudelleen
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={lukee || vaihtaa}
              onClick={() => tiedostoRef.current?.click()}
            >
              <ScanLine className="size-4" />
              Skannaa tai vaihda
            </Button>
          </div>

          {poiminnanHuomiot.length > 0 && (
            <div className="grid gap-1 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
              <span className="font-medium">
                Poiminta jätti tarkistettavaa. Kuittia ei hylätä - kuvaa se uudelleen tai korjaa
                kohdat alta.
              </span>
              {poiminnanHuomiot.map((huomio) => (
                <span key={huomio} className="text-muted-foreground">
                  {huomio}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {naytaAlv && alvErittely && alvErittely.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ALV-erittely</CardTitle>
            <CardDescription>
              Kuitilta luettu, kannoittain. Tallennettu poiminnassa riippumatta siitä oliko
              yritys silloin ALV-rekisterissä.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kanta</TableHead>
                  <TableHead className="text-right">Veroton</TableHead>
                  <TableHead className="text-right">Vero</TableHead>
                  <TableHead className="text-right">Verollinen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alvErittely.map((erittely) => (
                  <TableRow key={erittely.verokanta}>
                    <TableCell>{String(erittely.verokanta).replace(".", ",")}&nbsp;%</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {muotoileEuro(erittely.veroton_eur)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {muotoileEuro(erittely.vero_eur)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {muotoileEuro(erittely.verollinen_eur)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {kaytossaOlevatVihjeet.length > 0 && (
        <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-xs">
          <span className="font-medium">
            Vihjeitä, ei verotuspäätöksiä. Kirjanpitäjä ratkaisee kohtelun.
          </span>
          {kaytossaOlevatVihjeet.map((k) => (
            <span key={k.arvo} className="text-muted-foreground">
              {k.nimi}: {k.vihje}
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="grid gap-3">
          {!tasmays.tasmaa && rivit.length > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
              Rivien summa ei täsmää loppusummaan ({muotoileEuro(tasmays.erotus)} ero). Kuitti
              tallentuu tarkistettavaksi. Jos kuva on epäselvä, kuvaa kuitti uudelleen ennen kuin
              korjaat rivit käsin.
            </p>
          )}
          {luokittelematta > 0 && (
            <p className="text-xs text-muted-foreground">
              {luokittelematta} riviä ilman käyttötarkoitusta. Kuitti tallentuu tarkistettavaksi.
            </p>
          )}

          <Button onClick={kasitteleTallennus} disabled={tallentaa}>
            {tallentaa && <Loader2 className="size-4 animate-spin" />}
            Tallenna kuitti
          </Button>
        </CardContent>
      </Card>

      {/* Kuitin omat tiedot ikkunassa: niitä korjataan harvoin, ja lomake
          kenttineen veisi näkymän pääasialta eli riveiltä tilan. */}
      <Dialog open={tiedotAuki} onOpenChange={setTiedotAuki}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kuitin tiedot</DialogTitle>
            <DialogDescription>Toimittaja, päiväys ja loppusumma.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="toimittaja">Toimittaja</Label>
              <Input
                id="toimittaja"
                value={toimittaja}
                onChange={(e) => setToimittaja(e.target.value)}
                placeholder="Esim. Puuilo"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="loppusumma">Loppusumma €</Label>
                <Input
                  id="loppusumma"
                  type="number"
                  step="0.01"
                  min="0"
                  value={loppusumma}
                  onChange={(e) => setLoppusumma(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paivays">Päiväys</Label>
                <Input
                  id="paivays"
                  type="date"
                  value={paivays}
                  onChange={(e) => setPaivays(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="maksupaiva">Maksupäivä (jos eri kuin päiväys)</Label>
              <Input
                id="maksupaiva"
                type="date"
                value={maksupaiva}
                onChange={(e) => setMaksupaiva(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kuitin_muistiinpano">Muistiinpano</Label>
              <Textarea
                id="kuitin_muistiinpano"
                rows={2}
                value={muistiinpano}
                onChange={(e) => setMuistiinpano(e.target.value)}
                placeholder="Esim. Vieraille asiakastapaamisessa"
              />
              <p className="text-xs text-muted-foreground">
                Usein arvokkaampi kirjanpitäjälle kuin luokka.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setTiedotAuki(false)}>
              Valmis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={muokattava !== null} onOpenChange={(auki) => !auki && setMuokattavaRivi(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rivin tiedot</DialogTitle>
            <DialogDescription>
              Teksti sellaisenaan kuitilta - lyhenteet ja katkaisut kuuluvat siihen.
            </DialogDescription>
          </DialogHeader>

          {muokattava && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rivi_teksti">Teksti kuitilta</Label>
                <Input
                  id="rivi_teksti"
                  value={muokattava.teksti}
                  onChange={(e) => paivita(muokattava.avain, { teksti: e.target.value })}
                  onBlur={(e) => ehdotaRiville(muokattava.avain, e.target.value)}
                  placeholder="Esim. TEIPPI 50MM"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="rivi_maara">Määrä</Label>
                  <Input
                    id="rivi_maara"
                    type="number"
                    step="0.001"
                    value={muokattava.maara ?? ""}
                    onChange={(e) =>
                      paivita(muokattava.avain, {
                        maara: e.target.value === "" ? null : luku(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rivi_brutto">Hinta €</Label>
                  <Input
                    id="rivi_brutto"
                    type="number"
                    step="0.01"
                    value={muokattava.bruttoEur}
                    onChange={(e) =>
                      paivita(muokattava.avain, { bruttoEur: luku(e.target.value) })
                    }
                  />
                </div>
                {naytaAlv && (
                  <div className="grid gap-2">
                    <Label htmlFor="rivi_alv">Verokanta %</Label>
                    <Input
                      id="rivi_alv"
                      type="number"
                      step="0.5"
                      value={muokattava.verokanta ?? ""}
                      onChange={(e) =>
                        paivita(muokattava.avain, {
                          verokanta: e.target.value === "" ? null : luku(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Käyttötarkoitus</Label>
                  <Select
                    value={muokattava.kayttotarkoitus ?? ""}
                    onValueChange={(v) =>
                      paivita(muokattava.avain, { kayttotarkoitus: v as Kayttotarkoitus })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Valitse" />
                    </SelectTrigger>
                    <SelectContent>
                      {kayttotarkoitukset.map((k) => (
                        <SelectItem key={k.arvo} value={k.arvo}>
                          {k.nimi}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Kululuokka</Label>
                  <Select
                    value={muokattava.kululuokkaId ?? EI_LUOKKAA}
                    onValueChange={(v) =>
                      paivita(muokattava.avain, { kululuokkaId: v === EI_LUOKKAA ? null : v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EI_LUOKKAA}>Ei luokkaa</SelectItem>
                      {luokat.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.nimi}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="rivi_muistiinpano">Muistiinpano</Label>
                <Input
                  id="rivi_muistiinpano"
                  value={muokattava.muistiinpano ?? ""}
                  onChange={(e) => paivita(muokattava.avain, { muistiinpano: e.target.value })}
                  placeholder="Valinnainen"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (muokattava) setRivit((v) => v.filter((r) => r.avain !== muokattava.avain));
                setMuokattavaRivi(null);
              }}
            >
              <Trash2 className="size-4" />
              Poista rivi
            </Button>
            <Button type="button" onClick={() => setMuokattavaRivi(null)}>
              Valmis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
