"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ToinenVariRooli } from "@/lib/supabase/database.types";

import { merkitseTyoValmiiksi } from "./actions";

/**
 * Lisätyörivi jolla on oma maalinkulutus.
 *
 * Pohjaväri ja lakka ovat näitä: ne eivät ole enää työrivin toinen_vari vaan
 * omia lisätyörivejään, joten toteutunut menekki kirjataan riveittäin. Sama
 * väri voi esiintyä useassa rivissä eri lähteistä, eikä niitä yhdistetä -
 * maalaaja näkee mistä kukin erä tuli.
 */
export interface ValmiiksiLisatyo {
  id: string;
  nimi: string;
  /** Automaattisen rivin lähdeväri. Null kun rivi ei ole automaattinen. */
  lahdeNimi: string | null;
  variNimi: string;
  arvioituKulutusG: number;
}

export interface ValmiiksiRivi {
  id: string;
  osaNimi: string;
  variNimi: string;
  arvioituKulutusG: number;
  /** Vanhojen töiden pohjaväri tai lakka. Uusilla riveillä null. */
  toinenVariNimi: string | null;
  toinenVariRooli: ToinenVariRooli | null;
  toinenArvioituKulutusG: number | null;
  lisatyot: ValmiiksiLisatyo[];
}

const ROOLIN_NIMI: Record<ToinenVariRooli, string> = {
  pohjavari: "Pohjaväri",
  lakka: "Lakka",
};

export function MerkitseValmiiksi({ tyoId, rivit }: { tyoId: string; rivit: ValmiiksiRivi[] }) {
  const [auki, setAuki] = useState(false);
  const [kaynnissa, aloita] = useTransition();
  const [arvot, setArvot] = useState<Record<string, string>>(() =>
    Object.fromEntries(rivit.map((r) => [r.id, String(r.arvioituKulutusG)]))
  );
  const [toisetArvot, setToisetArvot] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rivit.filter((r) => r.toinenVariNimi).map((r) => [r.id, String(r.toinenArvioituKulutusG ?? 0)])
    )
  );
  // Lisätyörivin id on yksilöllinen koko työssä, joten yksi kartta riittää.
  const [lisatyonArvot, setLisatyonArvot] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rivit.flatMap((r) => r.lisatyot.map((lt) => [lt.id, String(lt.arvioituKulutusG)]))
    )
  );

  function kasitteleValmistuminen() {
    aloita(async () => {
      try {
        await merkitseTyoValmiiksi(
          tyoId,
          rivit.map((r) => ({
            riviId: r.id,
            toteutunutKulutusG: Number(arvot[r.id] ?? r.arvioituKulutusG),
            toinenToteutunutKulutusG: r.toinenVariNimi
              ? Number(toisetArvot[r.id] ?? r.toinenArvioituKulutusG ?? 0)
              : null,
            lisatyot: r.lisatyot.map((lt) => ({
              lisatyoRiviId: lt.id,
              toteutunutKulutusG: Number(lisatyonArvot[lt.id] ?? lt.arvioituKulutusG),
            })),
          }))
        );
        toast.success("Työ merkitty valmiiksi - maali kulutettu varastosta.");
        setAuki(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Valmiiksi merkitseminen epäonnistui.");
      }
    });
  }

  return (
    <Dialog open={auki} onOpenChange={setAuki}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <CheckCircle2 className="size-4" />
          Valmis
        </Button>
      </DialogTrigger>
      {/* Osia voi olla monta, jolloin lista ei mahdu puhelimen ruudulle.
          Otsikko ja vahvistusnappi pysyvät paikallaan ja vain lista vierii,
          jottei nappia tarvitse etsiä vierittämällä. */}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Merkitse työ valmiiksi</DialogTitle>
        </DialogHeader>
        <div className="grid content-start gap-4 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Vahvista toteutunut maalinkulutus - oletuksena arvio, muokkaa tarvittaessa.
          </p>
          {rivit.map((r) => (
            <div key={r.id} className="grid min-w-0 gap-3 rounded-md border p-3">
              <p className="min-w-0 text-sm font-medium wrap-anywhere">{r.osaNimi}</p>
              <div className="grid gap-2">
                <Label htmlFor={`toteutunut_${r.id}`} className="text-xs text-muted-foreground">
                  <span className="min-w-0 wrap-anywhere">
                    {r.variNimi}: toteutunut kulutus (g)
                  </span>
                </Label>
                <Input
                  id={`toteutunut_${r.id}`}
                  type="number"
                  min="1"
                  step="1"
                  className="min-w-0 tabular-nums"
                  value={arvot[r.id] ?? ""}
                  onChange={(e) => setArvot((a) => ({ ...a, [r.id]: e.target.value }))}
                />
              </div>
              {r.toinenVariNimi && (
                <div className="grid gap-2">
                  <Label
                    htmlFor={`toinen_toteutunut_${r.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    <span className="min-w-0 wrap-anywhere">
                      {r.toinenVariNimi} ({r.toinenVariRooli && ROOLIN_NIMI[r.toinenVariRooli]}):
                      toteutunut kulutus (g)
                    </span>
                  </Label>
                  <Input
                    id={`toinen_toteutunut_${r.id}`}
                    type="number"
                    min="1"
                    step="1"
                    className="min-w-0 tabular-nums"
                    value={toisetArvot[r.id] ?? ""}
                    onChange={(e) => setToisetArvot((a) => ({ ...a, [r.id]: e.target.value }))}
                  />
                </div>
              )}
              {r.lisatyot.map((lt) => (
                <div key={lt.id} className="grid gap-2">
                  <Label
                    htmlFor={`lisatyo_toteutunut_${lt.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    <span className="min-w-0 wrap-anywhere">
                      {lt.nimi}
                      {lt.lahdeNimi ? ` (${lt.lahdeNimi})` : ""} - {lt.variNimi}: toteutunut
                      kulutus (g)
                    </span>
                  </Label>
                  <Input
                    id={`lisatyo_toteutunut_${lt.id}`}
                    type="number"
                    min="0"
                    step="1"
                    className="min-w-0 tabular-nums"
                    value={lisatyonArvot[lt.id] ?? ""}
                    onChange={(e) =>
                      setLisatyonArvot((a) => ({ ...a, [lt.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" onClick={kasitteleValmistuminen} disabled={kaynnissa}>
            {kaynnissa && <Loader2 className="size-4 animate-spin" />}
            Vahvista valmis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
