"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Calculator, Info, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { muotoileEuro } from "@/lib/vakiot";
import type { Poistolaskelma } from "@/lib/tilikausi";

import { kirjaaToteutunutPoisto, laskePoistot } from "../kalusto/actions";

/**
 * Tilikauden poistolaskelma.
 *
 * Rivit ovat auki tarkoituksella: kirjanpitäjän on nähtävä mistä luku tulee,
 * eikä pelkkä loppusaldo kerro sitä. Sama syy kuin siinä ettei sovellus
 * päätä poistoa - se laskee enimmäismäärän, ja EVL 54 § sitoo verotuksen
 * poiston siihen mitä kirjanpidossa on vähennetty.
 */
export function PoistolaskelmaKortti({
  vuosi,
  laskelma,
  seuraavaOlemassa,
}: {
  vuosi: number;
  laskelma: Poistolaskelma | null;
  /** Seuraavan tilikauden laskelma on jo olemassa, joten muutos valuu siihen. */
  seuraavaOlemassa: boolean;
}) {
  const router = useRouter();
  const [toteutunut, setToteutunut] = useState(
    laskelma?.poistoToteutunutEur !== null && laskelma?.poistoToteutunutEur !== undefined
      ? String(laskelma.poistoToteutunutEur)
      : ""
  );
  const [kesken, aja] = useTransition();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Poistolaskelma {vuosi}</CardTitle>
            <CardDescription>
              Irtaimen kaluston menojäännöspoisto. Sovellus laskee enimmäismäärän, kirjanpitäjä
              päättää poiston.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/kulut/kalusto?vuosi=${vuosi}`}>
              <Wrench className="size-4" />
              Kalusto
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!laskelma ? (
          <>
            <p className="text-sm text-muted-foreground">
              Tilikaudelle ei ole laskettu poistolaskelmaa. Laskenta ketjuttaa vuodet: tämän
              vuoden loppusaldo on ensi vuoden alkusaldo.
            </p>
            <div>
              <Button
                type="button"
                disabled={kesken}
                onClick={() =>
                  aja(async () => {
                    try {
                      await laskePoistot(vuosi);
                      toast.success("Poistolaskelma laskettu.");
                      router.refresh();
                    } catch (virhe) {
                      toast.error(
                        virhe instanceof Error ? virhe.message : "Laskenta epäonnistui."
                      );
                    }
                  })
                }
              >
                <Calculator className="size-4" />
                Laske poistolaskelma
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-1 text-sm">
              <Rivi nimi="Menojäännös tilikauden alussa" arvo={laskelma.menojaannosAlussaEur} />
              <Rivi nimi="Tilikauden hankinnat" arvo={laskelma.hankinnatEur} etumerkki="+" />
              <Rivi
                nimi="Tilikauden luovutushinnat"
                arvo={laskelma.luovutushinnatEur}
                etumerkki="-"
              />
              <Rivi nimi="Poistopohja" arvo={laskelma.poistopohjaEur} korosta />
              <Rivi
                nimi={
                  laskelma.kertapoisto
                    ? "Poiston enimmäismäärä (kertapoisto)"
                    : "Poiston enimmäismäärä (25 %)"
                }
                arvo={laskelma.poistoEnintaanEur}
              />
              {laskelma.poistoToteutunutEur !== null && (
                <Rivi nimi="Toteutunut poisto" arvo={laskelma.poistoToteutunutEur} />
              )}
              <Rivi
                nimi="Menojäännös tilikauden lopussa"
                arvo={laskelma.menojaannosLopussaEur}
                korosta
              />
            </div>

            {laskelma.kertapoisto && (
              <p className="flex items-start gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Jäännös on alle 1 200 €, joten se saadaan poistaa kerralla.
                </span>
              </p>
            )}

            {laskelma.menojaannosLopussaEur < 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Luovutushinnat ylittivät poistopohjan, joten menojäännös on negatiivinen.
                  Poistoa ei ole. Kirjanpitäjä ratkaisee miten erotus käsitellään.
                </span>
              </p>
            )}

            <div className="grid gap-2 border-t pt-4">
              <Label htmlFor="toteutunut_poisto">Toteutunut poisto € (kirjanpidosta)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="toteutunut_poisto"
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full min-w-0 sm:w-40"
                  placeholder="Enimmäismäärä"
                  value={toteutunut}
                  onChange={(e) => setToteutunut(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={kesken}
                  onClick={() =>
                    aja(async () => {
                      try {
                        await kirjaaToteutunutPoisto(
                          vuosi,
                          toteutunut.trim() === "" ? null : Number(toteutunut.replace(",", ".")),
                          null
                        );
                        toast.success(
                          toteutunut.trim() === ""
                            ? "Enimmäismäärä otettu takaisin käyttöön."
                            : "Toteutunut poisto kirjattu."
                        );
                        router.refresh();
                      } catch (virhe) {
                        toast.error(
                          virhe instanceof Error ? virhe.message : "Kirjaus epäonnistui."
                        );
                      }
                    })
                  }
                >
                  Tallenna
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enimmäismäärää ei ole pakko poistaa, ja poisto voi olla pienempi. Verotuksessa ei
                voi vähentää enempää kuin kirjanpidossa on vähennetty (EVL 54 §). Tyhjä kenttä
                palauttaa enimmäismäärän käyttöön.
                {seuraavaOlemassa && (
                  <>
                    {" "}
                    <span className="text-warning">
                      Tilikaudelle {vuosi + 1} on jo laskelma: muutos siirtää sen alkusaldoa.
                    </span>
                  </>
                )}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Laskelman rivi: nimi vasemmalle, luku oikealle tabular-numsilla. */
function Rivi({
  nimi,
  arvo,
  etumerkki,
  korosta,
}: {
  nimi: string;
  arvo: number;
  etumerkki?: "+" | "-";
  korosta?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        korosta && "border-t pt-1 font-semibold"
      )}
    >
      <span className={cn("min-w-0", korosta ? "" : "text-muted-foreground")}>{nimi}</span>
      <span className="shrink-0 tabular-nums">
        {etumerkki === "-" ? "−" : etumerkki === "+" ? "+" : ""}
        {muotoileEuro(arvo)}
      </span>
    </div>
  );
}
