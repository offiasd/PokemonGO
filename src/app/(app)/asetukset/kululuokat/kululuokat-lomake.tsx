"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { lisaaKululuokka, nimeaKululuokka, poistaKululuokka } from "./actions";

interface Luokka {
  id: string;
  nimi: string;
  aktiivinen: boolean;
  /** Montako kuittiriviä luokkaan viittaa. Käytössä olevaa ei voi poistaa. */
  rivit: number;
}

/**
 * Kululuokkien hallinta.
 *
 * Nimeäminen ei riko olemassa olevia rivejä, koska ne viittaavat tunnisteeseen
 * eivätkä nimeen. Poisto sen sijaan sallitaan vain käyttämättömälle luokalle:
 * poistetun luokan rivit jäisivät ilman seurantatietoa.
 */
export function KululuokatLomake({ luokat }: { luokat: Luokka[] }) {
  const router = useRouter();
  const [kaynnissa, aloita] = useTransition();
  const [uusi, setUusi] = useState("");
  const [nimet, setNimet] = useState<Record<string, string>>(() =>
    Object.fromEntries(luokat.map((l) => [l.id, l.nimi]))
  );

  const suorita = (tyo: () => Promise<{ ok: boolean; virhe?: string }>, onnistui: string) =>
    aloita(async () => {
      const tulos = await tyo();
      if (!tulos.ok) {
        toast.error(tulos.virhe ?? "Toiminto epäonnistui.");
        return;
      }
      toast.success(onnistui);
      router.refresh();
    });

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {luokat.map((luokka) => (
          <div key={luokka.id} className="flex items-center gap-2">
            <Input
              value={nimet[luokka.id] ?? luokka.nimi}
              onChange={(e) => setNimet((v) => ({ ...v, [luokka.id]: e.target.value }))}
              onBlur={(e) => {
                const nimi = e.target.value.trim();
                if (!nimi || nimi === luokka.nimi) return;
                suorita(() => nimeaKululuokka(luokka.id, nimi), "Kululuokka nimetty uudelleen.");
              }}
              aria-label={`Kululuokan ${luokka.nimi} nimi`}
            />
            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
              {luokka.rivit === 0
                ? "ei käytössä"
                : `${luokka.rivit} ${luokka.rivit === 1 ? "rivi" : "riviä"}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={kaynnissa || luokka.rivit > 0}
              aria-label={`Poista ${luokka.nimi}`}
              title={luokka.rivit > 0 ? "Käytössä olevaa luokkaa ei voi poistaa" : undefined}
              onClick={() =>
                suorita(() => poistaKululuokka(luokka.id), "Kululuokka poistettu.")
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:max-w-md">
        <Label htmlFor="uusi_kululuokka">Uusi kululuokka</Label>
        <div className="flex gap-2">
          <Input
            id="uusi_kululuokka"
            value={uusi}
            onChange={(e) => setUusi(e.target.value)}
            placeholder="Esim. Vuokrat"
          />
          <Button
            type="button"
            variant="outline"
            disabled={kaynnissa || !uusi.trim()}
            onClick={() =>
              suorita(async () => {
                const tulos = await lisaaKululuokka(uusi.trim());
                if (tulos.ok) setUusi("");
                return tulos;
              }, "Kululuokka lisätty.")
            }
          >
            {kaynnissa ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Lisää
          </Button>
        </div>
      </div>
    </div>
  );
}
