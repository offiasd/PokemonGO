"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Calculator, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { muotoileEuro, muotoileGrammat } from "@/lib/vakiot";
import type { MaalieranEsikatselu } from "@/lib/supabase/database.types";

import { esikatseleEra, luoEra } from "./actions";

export interface ValittavaVari {
  id: string;
  nimi: string;
  valmistaja: string | null;
  alkupera: string;
}

interface RiviSyote {
  avain: string;
  variId: string;
  maaraG: string;
  tavaraEur: string;
}

function luku(arvo: string): number {
  const numero = Number(arvo.replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

/** Kilohinta neljällä desimaalilla: sentin erot näkyvät vasta siinä. */
function muotoileKilohinta(arvo: number | null): string {
  if (arvo === null || arvo === undefined) return "-";
  return `${arvo.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kg`;
}

/**
 * Maalierän kirjaus.
 *
 * Kulut syötetään erälle kokonaisuudessaan, ei riveille: rahti maksetaan koko
 * lähetyksestä ja tulli lasketaan koko erän arvosta. Kanta jakaa ne riveille
 * kukin omalla perusteellaan.
 *
 * Esikatselu on erillinen askel tarkoituksella. Kilohinta on luku jonka
 * kanssa eletään pitkään, ja se kannattaa nähdä ennen kuin se vaikuttaa
 * varaston keskihintaan.
 */
export function EraLomake({ varit }: { varit: ValittavaVari[] }) {
  const [toimittaja, setToimittaja] = useState("");
  const [paivays, setPaivays] = useState(() => new Date().toISOString().slice(0, 10));
  const [muistiinpano, setMuistiinpano] = useState("");
  const [rahti, setRahti] = useState("");
  const [tulli, setTulli] = useState("");
  const [tuontiAlv, setTuontiAlv] = useState("");
  const [rivit, setRivit] = useState<RiviSyote[]>([
    { avain: "rivi-1", variId: "", maaraG: "", tavaraEur: "" },
  ]);
  const [esikatselu, setEsikatselu] = useState<MaalieranEsikatselu | null>(null);
  const [tallennettu, setTallennettu] = useState(false);
  const [kesken, aja] = useTransition();

  const kelvollisetRivit = rivit.filter((r) => r.variId !== "" && luku(r.maaraG) > 0);
  const voiLaskea = kelvollisetRivit.length > 0;

  function paivita(avain: string, muutos: Partial<RiviSyote>) {
    setRivit((vanhat) => vanhat.map((r) => (r.avain === avain ? { ...r, ...muutos } : r)));
    // Vanhentunut esikatselu on pahempi kuin puuttuva: se näyttää oikealta.
    setEsikatselu(null);
  }

  function syote() {
    return kelvollisetRivit.map((r) => ({
      vari_id: r.variId,
      maara_g: luku(r.maaraG),
      tavara_eur: luku(r.tavaraEur),
    }));
  }

  function laske() {
    aja(async () => {
      try {
        const tulos = await esikatseleEra(
          syote(),
          luku(rahti),
          tulli.trim() === "" ? null : luku(tulli),
          tuontiAlv.trim() === "" ? null : luku(tuontiAlv)
        );
        setEsikatselu(tulos);
      } catch (virhe) {
        toast.error(virhe instanceof Error ? virhe.message : "Esikatselu epäonnistui.");
      }
    });
  }

  function tallenna() {
    aja(async () => {
      try {
        await luoEra(
          {
            toimittaja: toimittaja.trim() || null,
            paivays,
            rahti_eur: luku(rahti),
            tulli_eur: tulli.trim() === "" ? null : luku(tulli),
            tuonti_alv_eur: tuontiAlv.trim() === "" ? null : luku(tuontiAlv),
            muistiinpano: muistiinpano.trim() || null,
          },
          syote()
        );
        setTallennettu(true);
        toast.success("Erä kirjattu ja keskihinnat päivitetty.");
      } catch (virhe) {
        toast.error(virhe instanceof Error ? virhe.message : "Erän tallennus epäonnistui.");
      }
    });
  }

  if (tallennettu && esikatselu) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Erä kirjattu</CardTitle>
          <CardDescription>
            Keskihinta koskee vain tulevaa kulutusta. Jo tehtyjen töiden maalikustannus on
            lukittu kulutushetkeensä eikä muutu tästä.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Tulostaulukko esikatselu={esikatselu} />
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Kirjaa toinen erä
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Erän tiedot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="toimittaja">Toimittaja</Label>
              <Input
                id="toimittaja"
                value={toimittaja}
                onChange={(e) => setToimittaja(e.target.value)}
                placeholder="Esim. Prismatic Powders"
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
            <Label htmlFor="muistiinpano">Muistiinpano</Label>
            <Textarea
              id="muistiinpano"
              value={muistiinpano}
              onChange={(e) => setMuistiinpano(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rivit</CardTitle>
          <CardDescription>Väri, määrä ja laskun tavarahinta ilman rahtia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {rivit.map((rivi) => (
            <div
              key={rivi.avain}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto] sm:items-end"
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`vari-${rivi.avain}`}>Väri</Label>
                <select
                  id={`vari-${rivi.avain}`}
                  value={rivi.variId}
                  onChange={(e) => paivita(rivi.avain, { variId: e.target.value })}
                  className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs md:text-sm"
                >
                  <option value="">Valitse väri</option>
                  {varit.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nimi}
                      {v.valmistaja ? ` - ${v.valmistaja}` : ""} ({v.alkupera})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`maara-${rivi.avain}`}>Määrä g</Label>
                <Input
                  id={`maara-${rivi.avain}`}
                  type="number"
                  min="1"
                  step="1"
                  value={rivi.maaraG}
                  onChange={(e) => paivita(rivi.avain, { maaraG: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`tavara-${rivi.avain}`}>Hinta €</Label>
                <Input
                  id={`tavara-${rivi.avain}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={rivi.tavaraEur}
                  onChange={(e) => paivita(rivi.avain, { tavaraEur: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Poista rivi"
                disabled={rivit.length === 1}
                onClick={() => {
                  setRivit((v) => v.filter((r) => r.avain !== rivi.avain));
                  setEsikatselu(null);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
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
                  { avain: `rivi-${v.length + 1}-${Date.now()}`, variId: "", maaraG: "", tavaraEur: "" },
                ])
              }
            >
              <Plus className="size-4" />
              Lisää rivi
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Erän kulut</CardTitle>
          <CardDescription>
            Rahti jaetaan riveille painon mukaan, tulli ja tuonti-ALV arvon mukaan. Tyhjä tulli ja
            ALV tarkoittaa että tullauspäätöstä ei ole vielä tullut: ne arvioidaan värien
            prosenteilla ja erä jää kesken.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="rahti">Rahti €</Label>
            <Input
              id="rahti"
              type="number"
              min="0"
              step="0.01"
              value={rahti}
              onChange={(e) => {
                setRahti(e.target.value);
                setEsikatselu(null);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tulli">Tulli €</Label>
            <Input
              id="tulli"
              type="number"
              min="0"
              step="0.01"
              value={tulli}
              placeholder="Arvioidaan"
              onChange={(e) => {
                setTulli(e.target.value);
                setEsikatselu(null);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tuonti_alv">Tuonti-ALV €</Label>
            <Input
              id="tuonti_alv"
              type="number"
              min="0"
              step="0.01"
              value={tuontiAlv}
              placeholder="Arvioidaan"
              onChange={(e) => {
                setTuontiAlv(e.target.value);
                setEsikatselu(null);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!voiLaskea || kesken} onClick={laske}>
          <Calculator className="size-4" />
          Laske kilohinnat
        </Button>
        <Button type="button" disabled={!voiLaskea || kesken || esikatselu === null} onClick={tallenna}>
          <Save className="size-4" />
          Tallenna erä
        </Button>
      </div>

      {esikatselu && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Esikatselu</CardTitle>
            <CardDescription>
              {esikatselu.tullit_arvioitu
                ? "Tulli ja tuonti-ALV ovat arvioita, joten kilohinnat tarkentuvat tullauspäätöksellä."
                : "Kulut ovat lopullisia."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tulostaulukko esikatselu={esikatselu} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Tulostaulukko({ esikatselu }: { esikatselu: MaalieranEsikatselu }) {
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Väri</TableHead>
              <TableHead className="text-right">Määrä</TableHead>
              <TableHead className="text-right">Kulut</TableHead>
              <TableHead className="text-right">Erän kilohinta</TableHead>
              <TableHead className="text-right">Keskihinta ennen</TableHead>
              <TableHead className="text-right">Keskihinta jälkeen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {esikatselu.rivit.map((rivi, jarjestys) => (
              <TableRow key={`${rivi.vari_id}-${jarjestys}`}>
                <TableCell className="font-medium">{rivi.nimi}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {muotoileGrammat(rivi.maara_g)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {muotoileEuro(rivi.kulut_eur)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {muotoileKilohinta(rivi.hankintahinta_per_kg)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {muotoileKilohinta(rivi.keskihinta_ennen_per_kg)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {muotoileKilohinta(rivi.keskihinta_jalkeen_per_kg)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        Tulli {muotoileEuro(esikatselu.tulli_eur)} · tuonti-ALV{" "}
        {muotoileEuro(esikatselu.tuonti_alv_eur)}
        {esikatselu.tullit_arvioitu ? " (arvio)" : ""}
      </p>
    </div>
  );
}
