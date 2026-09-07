"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Paperclip, Plus, ScanText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createClient } from "@/lib/supabase/client";
import { lataaKuitinTiedosto } from "@/lib/kuvanpakkaus";
import type { AlvErittelynRivi } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { muotoileEuro } from "@/lib/vakiot";
import {
  ehdotaLuokittelu,
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

function luku(syote: string): number {
  const arvo = Number(syote.replace(",", "."));
  return Number.isFinite(arvo) ? arvo : 0;
}

/**
 * Kuitin tiedot ja rivien luokittelu.
 *
 * Rivit ovat paikallista tilaa ja tallentuvat kerralla: kuitti on yksi tosite,
 * ja rivi kerrallaan tallentaminen jättäisi kuitin puolitiehen jos selain
 * suljetaan kesken.
 */
export function KuitinLomake({
  kuitti,
  rivit: alkuRivit,
  luokat,
  opitut,
  kayttotarkoitukset,
  naytaAlv,
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
  /** ALV-sarakkeet näkyvät vain ALV-rekisterissä oleville. */
  naytaAlv: boolean;
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
  const [alvErittely, setAlvErittely] = useState<AlvErittelynRivi[] | null>(
    kuitti.alvErittely
  );
  const [lukee, setLukee] = useState(false);
  const [vaihtaa, setVaihtaa] = useState(false);
  const [poiminnanHuomiot, setPoiminnanHuomiot] = useState<string[]>([]);
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
  function lueKuitti() {
    if (rivit.length > 0 && !window.confirm("Poiminta korvaa nykyiset rivit. Jatketaanko?")) {
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

  const tasmays = tarkistaTasmays(luku(loppusumma), rivit.map((r) => ({
    brutto_eur: r.bruttoEur,
    verokanta: r.verokanta,
    kayttotarkoitus: r.kayttotarkoitus,
  })));
  const kuluina = kuluinaYhteensa(
    rivit.map((r) => ({
      brutto_eur: r.bruttoEur,
      verokanta: r.verokanta,
      kayttotarkoitus: r.kayttotarkoitus,
    }))
  );
  const luokittelematta = rivit.filter((r) => !r.kayttotarkoitus).length;

  // Vihjeet vain niistä luokista joita kuitilla oikeasti on.
  const kaytossaOlevatVihjeet = kayttotarkoitukset.filter(
    (k) => k.vihje && rivit.some((r) => r.kayttotarkoitus === k.arvo)
  );

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
    <div className="grid gap-6">
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
            <Button type="button" onClick={lueKuitti} disabled={lukee || vaihtaa}>
              {lukee ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanText className="size-4" />
              )}
              Lue kuitti
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={lukee || vaihtaa}
              onClick={() => kameraRef.current?.click()}
            >
              {vaihtaa ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              Kuvaa uudelleen
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={lukee || vaihtaa}
              onClick={() => tiedostoRef.current?.click()}
            >
              <Paperclip className="size-4" />
              Vaihda tiedosto
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kuitin tiedot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="toimittaja">Toimittaja</Label>
              <Input
                id="toimittaja"
                value={toimittaja}
                onChange={(e) => setToimittaja(e.target.value)}
                placeholder="Esim. Puuilo"
              />
            </div>
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
            <div className="grid gap-2">
              <Label htmlFor="maksupaiva">Maksupäivä (jos eri)</Label>
              <Input
                id="maksupaiva"
                type="date"
                value={maksupaiva}
                onChange={(e) => setMaksupaiva(e.target.value)}
              />
            </div>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rivit</CardTitle>
          <CardDescription>
            Mihin ostos meni, ei mikä on sen verokohtelu. Kirjanpitäjä ratkaisee kohtelun.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {rivit.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ei rivejä. Lisää kuitin rivit alta.
            </p>
          )}

          {rivit.map((rivi) => (
            <div key={rivi.avain} className="grid gap-2 rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
                <div className="grid gap-1">
                  <Label htmlFor={`teksti_${rivi.avain}`} className="text-xs text-muted-foreground">
                    Teksti kuitilta
                  </Label>
                  <Input
                    id={`teksti_${rivi.avain}`}
                    value={rivi.teksti}
                    onChange={(e) => paivita(rivi.avain, { teksti: e.target.value })}
                    onBlur={(e) => ehdotaRiville(rivi.avain, e.target.value)}
                    placeholder="Esim. TEIPPI 50MM"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`brutto_${rivi.avain}`} className="text-xs text-muted-foreground">
                    Hinta €
                  </Label>
                  <Input
                    id={`brutto_${rivi.avain}`}
                    type="number"
                    step="0.01"
                    value={rivi.bruttoEur}
                    onChange={(e) => paivita(rivi.avain, { bruttoEur: luku(e.target.value) })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Poista rivi"
                  onClick={() => setRivit((v) => v.filter((r) => r.avain !== rivi.avain))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Käyttötarkoitus</Label>
                  <Select
                    value={rivi.kayttotarkoitus ?? ""}
                    onValueChange={(v) =>
                      paivita(rivi.avain, { kayttotarkoitus: v as Kayttotarkoitus })
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
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Kululuokka</Label>
                  <Select
                    value={rivi.kululuokkaId ?? EI_LUOKKAA}
                    onValueChange={(v) =>
                      paivita(rivi.avain, { kululuokkaId: v === EI_LUOKKAA ? null : v })
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

              {naytaAlv && (
                <div className="grid gap-1 sm:max-w-[10rem]">
                  <Label htmlFor={`alv_${rivi.avain}`} className="text-xs text-muted-foreground">
                    Verokanta %
                  </Label>
                  <Input
                    id={`alv_${rivi.avain}`}
                    type="number"
                    step="0.5"
                    value={rivi.verokanta ?? ""}
                    onChange={(e) =>
                      paivita(rivi.avain, {
                        verokanta: e.target.value === "" ? null : luku(e.target.value),
                      })
                    }
                  />
                </div>
              )}

              <Input
                value={rivi.muistiinpano ?? ""}
                onChange={(e) => paivita(rivi.avain, { muistiinpano: e.target.value })}
                placeholder="Rivin muistiinpano (valinnainen)"
                className="text-sm"
              />
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRivit((v) => [
                  ...v,
                  {
                    avain: `uusi-${seuraavaAvain.current++}`,
                    teksti: "",
                    maara: null,
                    bruttoEur: 0,
                    verokanta: null,
                    kayttotarkoitus: null,
                    kululuokkaId: null,
                    muistiinpano: null,
                  },
                ])
              }
            >
              <Plus className="size-4" />
              Lisää rivi
            </Button>
          </div>
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
                    <TableCell>
                      {String(erittely.verokanta).replace(".", ",")}&nbsp;%
                    </TableCell>
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Rivit yhteensä</span>
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                !tasmays.tasmaa && "text-destructive"
              )}
            >
              {muotoileEuro(tasmays.riviteYhteensa)}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Yrityksen kuluina</span>
            <span className="text-sm font-medium tabular-nums">{muotoileEuro(kuluina)}</span>
          </div>

          {!tasmays.tasmaa && rivit.length > 0 && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              Rivien summa ei täsmää loppusummaan ({muotoileEuro(tasmays.erotus)} ero). Kuitti
              tallentuu tarkistettavaksi. Jos kuva on epäselvä, kuvaa kuitti uudelleen ennen
              kuin korjaat rivit käsin.
            </p>
          )}
          {luokittelematta > 0 && (
            <p className="text-xs text-muted-foreground">
              {luokittelematta} riviä ilman käyttötarkoitusta. Kuitti tallentuu
              tarkistettavaksi.
            </p>
          )}

          <Button onClick={kasitteleTallennus} disabled={tallentaa}>
            {tallentaa && <Loader2 className="size-4 animate-spin" />}
            Tallenna kuitti
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
