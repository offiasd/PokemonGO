"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { muotoileEuro } from "@/lib/vakiot";

import { kirjaaLuovutus } from "./actions";

export interface KalustoListalla {
  id: string;
  nimi: string;
  kuvaus: string | null;
  hankittu: string;
  hankintamenoEur: number;
  luovutettu: string | null;
  luovutushintaEur: number | null;
}

function paiva(arvo: string): string {
  return new Date(arvo).toLocaleDateString("fi-FI");
}

/**
 * Kalustorekisterin lista ja luovutuksen kirjaus.
 *
 * Luovutushinta vähennetään luovutusvuoden poistopohjasta, eikä myyntivoittoa
 * lasketa erikseen. Siksi luovutus ei poista riviä vaan merkitsee sen: rivi
 * kertoo edelleen mistä poistopohjan muutos tuli.
 */
export function KalustoLista({ rivit }: { rivit: KalustoListalla[] }) {
  const router = useRouter();
  const [avoin, setAvoin] = useState<KalustoListalla | null>(null);
  const [paivays, setPaivays] = useState("");
  const [hinta, setHinta] = useState("");
  const [kesken, aja] = useTransition();

  if (rivit.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ei kalustoa. Yli 1 200 euron hankinnan voi siirtää kuitin riviltä tai lisätä käsin.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-2">
        {rivit.map((rivi) => (
          <div
            key={rivi.id}
            className={cn(
              "grid gap-1 border-t pt-3 first:border-t-0 first:pt-0",
              rivi.luovutettu && "text-muted-foreground"
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              {/* Kuitilta tulleet nimet ovat pitkiä ja katkeamattomia. */}
              <span className="min-w-0 font-medium wrap-anywhere">{rivi.nimi}</span>
              <span className="font-medium tabular-nums">
                {muotoileEuro(rivi.hankintamenoEur)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {paiva(rivi.hankittu)}
                {rivi.luovutettu && (
                  <>
                    {" · luovutettu "}
                    {paiva(rivi.luovutettu)}
                    {rivi.luovutushintaEur !== null &&
                      ` · ${muotoileEuro(rivi.luovutushintaEur)}`}
                  </>
                )}
              </span>
              {rivi.luovutettu ? (
                <Badge variant="outline">Luovutettu</Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAvoin(rivi);
                    setPaivays(new Date().toISOString().slice(0, 10));
                    setHinta("");
                  }}
                >
                  <PackageMinus className="size-4" />
                  Kirjaa luovutus
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={avoin !== null} onOpenChange={(auki) => !auki && setAvoin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Luovutus</DialogTitle>
            <DialogDescription>
              {avoin?.nimi}. Luovutushinta vähennetään luovutusvuoden poistopohjasta ennen
              poistoa. Myyntivoittoa tai -tappiota ei lasketa erikseen. Hinta ilman
              arvonlisäveroa.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="luovutuspaiva">Luovutuspäivä</Label>
              <Input
                id="luovutuspaiva"
                type="date"
                value={paivays}
                onChange={(e) => setPaivays(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="luovutushinta">Luovutushinta € (ALV 0 %)</Label>
              <Input
                id="luovutushinta"
                type="number"
                min="0"
                step="0.01"
                value={hinta}
                onChange={(e) => setHinta(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAvoin(null)}>
              Peruuta
            </Button>
            <Button
              type="button"
              disabled={kesken || paivays === "" || hinta.trim() === ""}
              onClick={() =>
                aja(async () => {
                  if (!avoin) return;
                  try {
                    await kirjaaLuovutus(avoin.id, paivays, Number(hinta.replace(",", ".")));
                    setAvoin(null);
                    toast.success("Luovutus kirjattu ja poistolaskelma päivitetty.");
                    router.refresh();
                  } catch (virhe) {
                    toast.error(virhe instanceof Error ? virhe.message : "Kirjaus epäonnistui.");
                  }
                })
              }
            >
              Tallenna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
