"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeOff, Eye, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { muotoileEuro, tyovaiheenNimi } from "@/lib/vakiot";
import type { LisatyoLuettelossa } from "@/lib/supabase/database.types";

import { asetaLisatyonTila, muokkaaLisatyo, poistaLisatyo } from "./actions";

function luku(arvo: string): number {
  const n = Number(arvo.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Käyttöliittymän nimi vaiheelle jonka arvo kannassa on yhä 'teippaus'.
const SUOJAUS = tyovaiheenNimi("teippaus");

/**
 * Hinnat rinnakkain kun ne eroavat, muuten yksi luku.
 *
 * Kahden hinnan näyttäminen aina veisi turhaa tilaa niiltä lisätöiltä joilla
 * väri ei vaikuta hintaan - ja juuri ero on se tieto joka kannattaa erottua.
 */
function hintateksti(perusvari: number, erikoisvari: number): string {
  return perusvari === erikoisvari
    ? muotoileEuro(perusvari)
    : `${muotoileEuro(perusvari)} / ${muotoileEuro(erikoisvari)}`;
}

/**
 * Katalogin lista ryhmiteltynä.
 *
 * Käyttömäärä näkyy jokaisella rivillä, koska se ratkaisee poiston: kahdeksalla
 * osalla käytössä olevaa lisätyötä ei kannata poistaa vaan merkitä pois
 * käytöstä, jolloin vanhat työt säilyttävät hintansa.
 */
export function Lisatyolista({ rivit }: { rivit: LisatyoLuettelossa[] }) {
  const router = useRouter();
  const [avoin, setAvoin] = useState<LisatyoLuettelossa | null>(null);
  const [poistettava, setPoistettava] = useState<LisatyoLuettelossa | null>(null);
  const [kesken, aja] = useTransition();

  const [nimi, setNimi] = useState("");
  const [ryhma, setRyhma] = useState("");
  const [teippaus, setTeippaus] = useState("");
  const [maalaus, setMaalaus] = useState("");
  const [lisakulutus, setLisakulutus] = useState("");
  const [hintaPerus, setHintaPerus] = useState("");
  const [hintaErikois, setHintaErikois] = useState("");
  const [onJako, setOnJako] = useState(false);

  function avaa(rivi: LisatyoLuettelossa) {
    setAvoin(rivi);
    setNimi(rivi.nimi);
    setRyhma(rivi.ryhma ?? "");
    setTeippaus(String(rivi.teippaus_min));
    setMaalaus(String(rivi.maalaus_min));
    setLisakulutus(String(rivi.lisakulutus_g));
    setHintaPerus(String(rivi.hinta_perusvari_eur));
    setHintaErikois(String(rivi.hinta_erikoisvari_eur));
    setOnJako(rivi.on_jako);
  }

  function suorita(tehtava: () => Promise<void>, viesti: string) {
    aja(async () => {
      try {
        await tehtava();
        setAvoin(null);
        setPoistettava(null);
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
        <CardContent className="py-6 text-sm text-muted-foreground">
          Ei lisätöitä. Lisää ensimmäinen alta.
        </CardContent>
      </Card>
    );
  }

  // Ryhmittely säilyttää katalogin järjestyksen: ryhmä esiintyy siinä
  // kohdassa jossa sen ensimmäinen lisätyö on.
  const ryhmat: { nimi: string; rivit: LisatyoLuettelossa[] }[] = [];
  for (const rivi of rivit) {
    const avain = rivi.ryhma?.trim() || "Muut";
    const olemassa = ryhmat.find((r) => r.nimi === avain);
    if (olemassa) olemassa.rivit.push(rivi);
    else ryhmat.push({ nimi: avain, rivit: [rivi] });
  }

  return (
    <>
      <div className="grid gap-4">
        {ryhmat.map((ryhmaRivi) => (
          <Card key={ryhmaRivi.nimi}>
            <CardHeader>
              <CardTitle className="text-base">{ryhmaRivi.nimi}</CardTitle>
              <CardDescription>
                {ryhmaRivi.rivit.length}{" "}
                {ryhmaRivi.rivit.length === 1 ? "lisätyö" : "lisätyötä"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {ryhmaRivi.rivit.map((rivi) => (
                <div
                  key={rivi.id}
                  className={cn(
                    "grid gap-1 border-t pt-3 first:border-t-0 first:pt-0",
                    !rivi.aktiivinen && "text-muted-foreground"
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
                      <span className="min-w-0 wrap-anywhere">{rivi.nimi}</span>
                      {rivi.on_jako && <Badge variant="outline">Jako</Badge>}
                      {!rivi.aktiivinen && <Badge variant="outline">Pois käytöstä</Badge>}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {hintateksti(rivi.hinta_perusvari_eur, rivi.hinta_erikoisvari_eur)}
                    </span>
                  </div>
                  {rivi.hinta_perusvari_eur !== rivi.hinta_erikoisvari_eur && (
                    <p className="text-xs text-muted-foreground">perusväri / erikoisväri</p>
                  )}
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {SUOJAUS.toLowerCase()} {rivi.teippaus_min} min · maalaus {rivi.maalaus_min} min
                    {rivi.on_jako ? "" : ` · lisäkulutus ${rivi.lisakulutus_g} g`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {rivi.osia === 0
                      ? "Ei käytössä yhdelläkään osalla"
                      : `Käytössä ${rivi.osia} ${rivi.osia === 1 ? "osalla" : "osalla"}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => avaa(rivi)}>
                      <Pencil className="size-4" />
                      Muokkaa
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={kesken}
                      onClick={() =>
                        suorita(
                          () => asetaLisatyonTila(rivi.id, !rivi.aktiivinen),
                          rivi.aktiivinen ? "Merkitty pois käytöstä." : "Otettu käyttöön."
                        )
                      }
                    >
                      {rivi.aktiivinen ? (
                        <>
                          <EyeOff className="size-4" />
                          Pois käytöstä
                        </>
                      ) : (
                        <>
                          <Eye className="size-4" />
                          Ota käyttöön
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPoistettava(rivi)}
                    >
                      <Trash2 className="size-4" />
                      Poista
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={avoin !== null} onOpenChange={(auki) => !auki && setAvoin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Muokkaa lisätyötä</DialogTitle>
            <DialogDescription>
              Muutos näkyy heti kaikilla osilla joilla ei ole omaa arvoa. Osan omat arvot
              säilyvät ennallaan.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="lisatyo_nimi">Nimi</Label>
              <Input id="lisatyo_nimi" value={nimi} onChange={(e) => setNimi(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lisatyo_ryhma">Ryhmä</Label>
              <Input
                id="lisatyo_ryhma"
                value={ryhma}
                onChange={(e) => setRyhma(e.target.value)}
                placeholder="Esim. Tekstit"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ajat eivät vaikuta hintaan. Ne kirjataan työn keston arviointia varten.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="lisatyo_teippaus">{SUOJAUS} min</Label>
                <Input
                  id="lisatyo_teippaus"
                  type="number"
                  min="0"
                  value={teippaus}
                  onChange={(e) => setTeippaus(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lisatyo_maalaus">Maalaus min</Label>
                <Input
                  id="lisatyo_maalaus"
                  type="number"
                  min="0"
                  value={maalaus}
                  onChange={(e) => setMaalaus(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lisatyo_kulutus">Lisäkulutus g</Label>
              <Input
                id="lisatyo_kulutus"
                type="number"
                min="0"
                step="0.1"
                value={lisakulutus}
                onChange={(e) => setLisakulutus(e.target.value)}
                disabled={onJako}
              />
              <p className="text-xs text-muted-foreground">
                {onJako
                  ? "Jaossa kulutus tulee osuutena osan kokonaiskulutuksesta, ei tästä."
                  : "Lisätyön oma kulutus, joka tulee osan kulutuksen päälle."}
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={onJako}
                onCheckedChange={(arvo) => setOnJako(arvo === true)}
              />
              <span>
                Jaettu pinta
                <span className="block text-xs text-muted-foreground">
                  Kulutus jakautuu osan kokonaiskulutuksesta eikä lisäydy päälle, eikä
                  kappalemäärää ole.
                </span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="lisatyo_hinta_perus">Hinta perusvärillä €</Label>
                <Input
                  id="lisatyo_hinta_perus"
                  type="number"
                  min="0"
                  step="0.01"
                  value={hintaPerus}
                  onChange={(e) => setHintaPerus(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Solid / RAL</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lisatyo_hinta_erikois">Hinta erikoisvärillä €</Label>
                <Input
                  id="lisatyo_hinta_erikois"
                  type="number"
                  min="0"
                  step="0.01"
                  value={hintaErikois}
                  onChange={(e) => setHintaErikois(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Kaikki muut värit</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAvoin(null)}>
              Peruuta
            </Button>
            <Button
              type="button"
              disabled={kesken || nimi.trim() === ""}
              onClick={() =>
                suorita(
                  () =>
                    muokkaaLisatyo(avoin?.id ?? "", {
                      nimi: nimi.trim(),
                      ryhma: ryhma.trim() || null,
                      teippausMin: Math.round(luku(teippaus)),
                      maalausMin: Math.round(luku(maalaus)),
                      lisakulutusG: onJako ? 0 : luku(lisakulutus),
                      hintaPerusvariEur: luku(hintaPerus),
                      hintaErikoisvariEur: luku(hintaErikois),
                      onJako,
                      jarjestys: avoin?.jarjestys ?? 0,
                    }),
                  "Lisätyö tallennettu."
                )
              }
            >
              Tallenna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={poistettava !== null} onOpenChange={(auki) => !auki && setPoistettava(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Poistetaanko lisätyö?</DialogTitle>
            <DialogDescription>
              {poistettava?.nimi}
              {poistettava && poistettava.osia > 0 ? (
                <>
                  {" "}
                  on käytössä {poistettava.osia}{" "}
                  {poistettava.osia === 1 ? "osalla" : "osalla"}. Poisto vie sen näiltä osilta.
                  Harkitse pois käytöstä merkitsemistä: silloin lisätyö katoaa uusien töiden
                  valikoista mutta vanhat työt säilyttävät hintansa.
                </>
              ) : (
                " ei ole käytössä yhdelläkään osalla."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPoistettava(null)}>
              Peruuta
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={kesken}
              onClick={() =>
                suorita(() => poistaLisatyo(poistettava?.id ?? ""), "Lisätyö poistettu.")
              }
            >
              <Trash2 className="size-4" />
              Poista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
