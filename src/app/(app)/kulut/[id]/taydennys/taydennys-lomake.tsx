"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Calculator, PackagePlus, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { muotoileEuro, muotoileGrammat, muunnaGrammoiksi } from "@/lib/vakiot";
import type {
  EhdotettuMaalirivi,
  MaalieranEsikatselu,
  Yksikko,
} from "@/lib/supabase/database.types";

import { esikatseleEra } from "../../../varit/erat/actions";
import { luoTaydennysKuitista } from "./actions";

/** Kannan sallimat yksiköt. Maalille painoyksiköt ovat ne jotka kelpaavat. */
const PAINOYKSIKOT: Yksikko[] = ["lb", "kg", "g"];

const PERUSTEEN_NIMI: Record<string, string> = {
  opittu: "muistettu valinta",
  tuotekoodi: "tuotekoodi",
  ral: "RAL-koodi",
  nimi: "nimihaku",
};

export interface ValittavaVari {
  id: string;
  nimi: string;
  valmistaja: string | null;
}

interface RiviTila {
  rivi: EhdotettuMaalirivi;
  mukana: boolean;
  onRahti: boolean;
  variId: string;
  yksikko: Yksikko | "";
}

function kilohinta(arvo: number | null): string {
  if (arvo === null) return "-";
  return `${arvo.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kg`;
}

/**
 * Kuitin rivit varastotäydennykseksi.
 *
 * Ehdotus, ei automaatti: kuitilla lukee tuotenimi ja kannassa on väri, ja
 * niiden yhdistäminen on arvausta. Väärä osuma päätyisi suoraan saldoihin ja
 * kilohintoihin, ja väärä kilohinta vääristäisi kaikkien tulevien töiden
 * katteen - siksi jokainen rivi käydään läpi ennen tallennusta.
 */
export function TaydennysLomake({
  kuittiId,
  ehdotukset,
  varit,
}: {
  kuittiId: string;
  ehdotukset: EhdotettuMaalirivi[];
  varit: ValittavaVari[];
}) {
  const router = useRouter();
  const [rivit, setRivit] = useState<RiviTila[]>(() =>
    ehdotukset.map((rivi) => ({
      rivi,
      // Rahtirivi ei ole väri, ja tuntematon rivi odottaa valintaa.
      mukana: !rivi.on_rahti && rivi.ehdotus_vari_id !== null,
      onRahti: rivi.on_rahti,
      variId: rivi.ehdotus_vari_id ?? "",
      yksikko: rivi.yksikko ?? "",
    }))
  );
  const [muistiinpano, setMuistiinpano] = useState("");
  const [esikatselu, setEsikatselu] = useState<MaalieranEsikatselu | null>(null);
  const [kesken, aja] = useTransition();

  function paivita(riviId: string, muutos: Partial<RiviTila>) {
    setRivit((vanhat) =>
      vanhat.map((r) => (r.rivi.rivi_id === riviId ? { ...r, ...muutos } : r))
    );
    // Vanhentunut esikatselu näyttää oikealta olematta sitä.
    setEsikatselu(null);
  }

  const rahtiEur = useMemo(
    () => rivit.filter((r) => r.onRahti).reduce((summa, r) => summa + r.rivi.brutto_eur, 0),
    [rivit]
  );

  const varirivit = rivit.filter((r) => r.mukana && !r.onRahti);
  const grammat = (r: RiviTila) =>
    muunnaGrammoiksi(r.rivi.maara, r.yksikko === "" ? null : r.yksikko);

  const puutteelliset = varirivit.filter((r) => r.variId === "" || grammat(r) === null);
  const voiTallentaa = varirivit.length > 0 && puutteelliset.length === 0;

  function syote() {
    return varirivit.map((r) => ({
      rivi_id: r.rivi.rivi_id,
      vari_id: r.variId,
      maara_g: grammat(r) ?? 0,
      tavara_eur: r.rivi.brutto_eur,
    }));
  }

  function laske() {
    aja(async () => {
      try {
        const tulos = await esikatseleEra(
          syote().map((r) => ({
            vari_id: r.vari_id,
            maara_g: r.maara_g,
            tavara_eur: r.tavara_eur,
          })),
          rahtiEur,
          null,
          null
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
        await luoTaydennysKuitista(kuittiId, syote(), rahtiEur, muistiinpano.trim() || null);
        toast.success("Varastotäydennys kirjattu.");
        router.push(`/kulut/${kuittiId}`);
        router.refresh();
      } catch (virhe) {
        toast.error(virhe instanceof Error ? virhe.message : "Tallennus epäonnistui.");
      }
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kuitin rivit</CardTitle>
          <CardDescription>
            Väri on ehdotus, ei totuus. Käy rivit läpi: väärä osuma päätyy suoraan
            varastosaldoon ja kilohintaan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {rivit.map((r) => {
            const gram = grammat(r);
            const epavarma = r.rivi.peruste === "nimi";
            return (
              <div
                key={r.rivi.rivi_id}
                className={cn(
                  "grid gap-2 border-t pt-3 first:border-t-0 first:pt-0",
                  !r.mukana && !r.onRahti && "opacity-60"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-1 items-start gap-2 font-medium">
                    {!r.onRahti && (
                      <Checkbox
                        className="mt-0.5 shrink-0"
                        checked={r.mukana}
                        onCheckedChange={(arvo) =>
                          paivita(r.rivi.rivi_id, { mukana: arvo === true })
                        }
                        aria-label={`Ota rivi ${r.rivi.teksti} mukaan`}
                      />
                    )}
                    {/* Tuotekoodit ovat pitkiä katkeamattomia merkkijonoja.
                        wrap-anywhere eikä break-words: vain edellinen katkaisee
                        sanan myös silloin kun laatikon leveys lasketaan siitä. */}
                    <span className="min-w-0 wrap-anywhere">{r.rivi.teksti}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{muotoileEuro(r.rivi.brutto_eur)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={r.onRahti ? "default" : "outline"}
                    onClick={() =>
                      paivita(r.rivi.rivi_id, { onRahti: !r.onRahti, mukana: r.onRahti })
                    }
                  >
                    <Truck className="size-4" />
                    {r.onRahti ? "Rahtia" : "Merkitse rahdiksi"}
                  </Button>

                  {!r.onRahti && (
                    <>
                      <select
                        value={r.variId}
                        onChange={(e) => paivita(r.rivi.rivi_id, { variId: e.target.value })}
                        disabled={!r.mukana}
                        className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs sm:w-auto sm:min-w-48 sm:flex-1 md:text-sm"
                        aria-label={`Väri riville ${r.rivi.teksti}`}
                      >
                        <option value="">Valitse väri</option>
                        {varit.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nimi}
                            {v.valmistaja ? ` - ${v.valmistaja}` : ""}
                          </option>
                        ))}
                      </select>

                      <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
                        {r.rivi.maara ?? "?"}
                        <select
                          value={r.yksikko}
                          onChange={(e) =>
                            paivita(r.rivi.rivi_id, { yksikko: e.target.value as Yksikko | "" })
                          }
                          disabled={!r.mukana}
                          className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs"
                          aria-label={`Yksikkö riville ${r.rivi.teksti}`}
                        >
                          <option value="">-</option>
                          {PAINOYKSIKOT.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                        <span className="text-muted-foreground">
                          → {gram === null ? "?" : muotoileGrammat(gram)}
                        </span>
                      </span>
                    </>
                  )}
                </div>

                {!r.onRahti && r.mukana && (
                  <p className="text-xs text-muted-foreground">
                    {r.rivi.peruste
                      ? `Ehdotus: ${PERUSTEEN_NIMI[r.rivi.peruste] ?? r.rivi.peruste}`
                      : "Ei ehdotusta - valitse väri"}
                    {epavarma && " · tarkista tämä"}
                    {gram === null && " · yksikkö puuttuu, valitse se"}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Erän kulut</CardTitle>
          <CardDescription>
            Rahti tulee rahdiksi merkityiltä riveiltä. Tulli ja tuonti-ALV eivät ole kuitilla -
            ne arvioidaan värien prosenteilla ja tarkentuvat tullauspäätöksellä. EU-erässä niitä
            ei tule lainkaan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Rahti riveiltä</span>
            <span className="tabular-nums">{muotoileEuro(rahtiEur)}</span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="taydennyksen_muistiinpano">Muistiinpano</Label>
            <Input
              id="taydennyksen_muistiinpano"
              value={muistiinpano}
              onChange={(e) => setMuistiinpano(e.target.value)}
              placeholder="Valinnainen"
            />
          </div>
        </CardContent>
      </Card>

      {puutteelliset.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {puutteelliset.length} {puutteelliset.length === 1 ? "rivi" : "riviä"} odottaa väriä
            tai yksikköä. Yksikköä ei arvata: väärä yksikkö on kertaluokan virhe saldossa.
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!voiTallentaa || kesken} onClick={laske}>
          <Calculator className="size-4" />
          Laske kilohinnat
        </Button>
        <Button
          type="button"
          disabled={!voiTallentaa || kesken || esikatselu === null}
          onClick={tallenna}
        >
          <PackagePlus className="size-4" />
          Luo varastotäydennys
        </Button>
      </div>

      {esikatselu && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Esikatselu</CardTitle>
            <CardDescription>
              Näin saldot ja keskihinnat muuttuvat. Tästä huomaa jos jokin meni pieleen ennen
              kuin se on varastossa.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {/* Viisi saraketta ei mahdu kapeimmalle puhelimelle, joten siellä
                jokainen väri on oma korttinsa. sm-koosta ylöspäin taulukko. */}
            <div className="grid gap-3 sm:hidden">
              {esikatselu.rivit.map((rivi, jarjestys) => (
                <div
                  key={`${rivi.vari_id}-${jarjestys}`}
                  className="grid gap-1 rounded-md border p-3 text-sm"
                >
                  <p className="font-medium wrap-anywhere">{rivi.nimi}</p>
                  <Lukupari nimi="Määrä" arvo={muotoileGrammat(rivi.maara_g)} />
                  <Lukupari nimi="Erän kilohinta" arvo={kilohinta(rivi.hankintahinta_per_kg)} />
                  <Lukupari nimi="Keskihinta ennen" arvo={kilohinta(rivi.keskihinta_ennen_per_kg)} />
                  <Lukupari
                    nimi="Keskihinta jälkeen"
                    arvo={kilohinta(rivi.keskihinta_jalkeen_per_kg)}
                    korosta
                  />
                </div>
              ))}
            </div>

            <div className="hidden sm:block sm:overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Väri</TableHead>
                    <TableHead className="text-right">Määrä</TableHead>
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
                        {kilohinta(rivi.hankintahinta_per_kg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {kilohinta(rivi.keskihinta_ennen_per_kg)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {kilohinta(rivi.keskihinta_jalkeen_per_kg)}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Nimi vasemmalle, luku oikealle. Luvut tabular-nums, jotta ne eivät hypi. */
function Lukupari({
  nimi,
  arvo,
  korosta,
}: {
  nimi: string;
  arvo: string;
  korosta?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{nimi}</span>
      <span className={cn("tabular-nums", korosta ? "font-semibold" : "font-medium")}>{arvo}</span>
    </div>
  );
}
