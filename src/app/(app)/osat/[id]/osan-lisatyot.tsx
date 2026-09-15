"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { muotoileEuro } from "@/lib/vakiot";
import type { OsanLisatyo } from "@/lib/supabase/database.types";

import { asetaOsanLisatyo, paivitaOsanLisatyonArvot } from "./lisatyo-actions";

function luku(arvo: string): number | null {
  const puhdas = arvo.trim();
  if (puhdas === "") return null;
  const n = Number(puhdas.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Osan lisätyöt.
 *
 * Rasti kertoo mitkä lisätyöt ovat mahdollisia tälle osalle - työn sivulla
 * näytetään vain ne, ei koko katalogia. Arvot periytyvät katalogista, ja
 * osan oma arvo annetaan vain kun se poikkeaa. Tyhjä kenttä palauttaa
 * periytymisen, jolloin katalogin muutokset alkavat taas näkyä.
 */
export function OsanLisatyot({ osaId, rivit }: { osaId: string; rivit: OsanLisatyo[] }) {
  const router = useRouter();
  const [kesken, aja] = useTransition();
  const [muokattava, setMuokattava] = useState<string | null>(null);
  const [teippaus, setTeippaus] = useState("");
  const [maalaus, setMaalaus] = useState("");
  const [lisakulutus, setLisakulutus] = useState("");

  function avaa(rivi: OsanLisatyo) {
    setMuokattava(rivi.lisatyo_id);
    setTeippaus(rivi.teippaus_oma ? String(rivi.teippaus_min) : "");
    setMaalaus(rivi.maalaus_oma ? String(rivi.maalaus_min) : "");
    setLisakulutus(rivi.lisakulutus_oma ? String(rivi.lisakulutus_g) : "");
  }

  function suorita(tehtava: () => Promise<void>, viesti: string) {
    aja(async () => {
      try {
        await tehtava();
        toast.success(viesti);
        router.refresh();
      } catch (virhe) {
        toast.error(virhe instanceof Error ? virhe.message : "Toiminto epäonnistui.");
      }
    });
  }

  if (rivit.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lisätyöt</CardTitle>
          <CardDescription>
            Katalogissa ei ole yhtään käytössä olevaa lisätyötä.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lisätyöt</CardTitle>
        <CardDescription>
          Rasti kertoo mitkä lisätyöt ovat mahdollisia tälle osalle. Arvot periytyvät
          katalogista - anna oma arvo vain jos se poikkeaa.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rivit.map((rivi) => {
          const auki = muokattava === rivi.lisatyo_id;
          const onPoikkeuksia = rivi.teippaus_oma || rivi.maalaus_oma || rivi.lisakulutus_oma;
          return (
            <div
              key={rivi.lisatyo_id}
              className={cn(
                "grid gap-2 border-t pt-3 first:border-t-0 first:pt-0",
                !rivi.valittu && "opacity-60"
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <label className="flex min-w-0 flex-1 items-start gap-2 font-medium">
                  <Checkbox
                    className="mt-0.5 shrink-0"
                    checked={rivi.valittu}
                    disabled={kesken}
                    onCheckedChange={(arvo) =>
                      suorita(
                        () => asetaOsanLisatyo(osaId, rivi.lisatyo_id, arvo === true),
                        arvo === true ? "Lisätyö otettu käyttöön osalle." : "Lisätyö poistettu osalta."
                      )
                    }
                    aria-label={`${rivi.nimi} mahdollinen tälle osalle`}
                  />
                  <span className="min-w-0 wrap-anywhere">
                    {rivi.nimi}
                    {rivi.on_jako && (
                      <Badge variant="outline" className="ml-2">
                        Jako
                      </Badge>
                    )}
                  </span>
                </label>
                <span className="shrink-0 font-semibold tabular-nums">
                  {muotoileEuro(rivi.hinta_eur)}
                </span>
              </div>

              <p className="text-sm text-muted-foreground tabular-nums">
                teippaus {rivi.teippaus_min} min{rivi.teippaus_oma ? " (oma)" : ""} · maalaus{" "}
                {rivi.maalaus_min} min{rivi.maalaus_oma ? " (oma)" : ""}
                {!rivi.on_jako && (
                  <>
                    {" "}
                    · lisäkulutus {rivi.lisakulutus_g} g{rivi.lisakulutus_oma ? " (oma)" : ""}
                  </>
                )}
              </p>

              {rivi.valittu && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{onPoikkeuksia ? "Oma arvo" : "Oletus"}</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => (auki ? setMuokattava(null) : avaa(rivi))}
                  >
                    {auki ? "Sulje" : "Säädä arvoja"}
                  </Button>
                  {onPoikkeuksia && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={kesken}
                      onClick={() =>
                        suorita(
                          () =>
                            paivitaOsanLisatyonArvot(osaId, rivi.lisatyo_id, {
                              teippausMin: null,
                              maalausMin: null,
                              lisakulutusG: null,
                            }),
                          "Arvot periytyvät taas katalogista."
                        )
                      }
                    >
                      <RotateCcw className="size-4" />
                      Palauta oletukset
                    </Button>
                  )}
                </div>
              )}

              {auki && rivi.valittu && (
                <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Tyhjä kenttä palauttaa periytymisen, jolloin katalogin muutokset alkavat taas
                    näkyä tällä osalla.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`teippaus-${rivi.lisatyo_id}`}>Teippaus min</Label>
                      <Input
                        id={`teippaus-${rivi.lisatyo_id}`}
                        type="number"
                        min="0"
                        value={teippaus}
                        placeholder={`Oletus ${rivi.teippaus_min}`}
                        onChange={(e) => setTeippaus(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`maalaus-${rivi.lisatyo_id}`}>Maalaus min</Label>
                      <Input
                        id={`maalaus-${rivi.lisatyo_id}`}
                        type="number"
                        min="0"
                        value={maalaus}
                        placeholder={`Oletus ${rivi.maalaus_min}`}
                        onChange={(e) => setMaalaus(e.target.value)}
                      />
                    </div>
                  </div>
                  {!rivi.on_jako && (
                    <div className="grid gap-1.5">
                      <Label htmlFor={`kulutus-${rivi.lisatyo_id}`}>Lisäkulutus g</Label>
                      <Input
                        id={`kulutus-${rivi.lisatyo_id}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={lisakulutus}
                        placeholder={`Oletus ${rivi.lisakulutus_g}`}
                        onChange={(e) => setLisakulutus(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={kesken}
                      onClick={() =>
                        suorita(async () => {
                          await paivitaOsanLisatyonArvot(osaId, rivi.lisatyo_id, {
                            teippausMin: luku(teippaus),
                            maalausMin: luku(maalaus),
                            lisakulutusG: rivi.on_jako ? null : luku(lisakulutus),
                          });
                          setMuokattava(null);
                        }, "Arvot tallennettu.")
                      }
                    >
                      Tallenna arvot
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
