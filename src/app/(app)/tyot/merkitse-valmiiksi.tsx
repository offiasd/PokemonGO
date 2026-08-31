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

export interface ValmiiksiRivi {
  id: string;
  osaNimi: string;
  variNimi: string;
  arvioituKulutusG: number;
  toinenVariNimi: string | null;
  toinenVariRooli: ToinenVariRooli | null;
  toinenArvioituKulutusG: number | null;
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merkitse työ valmiiksi</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Vahvista toteutunut maalinkulutus - oletuksena arvio, muokkaa tarvittaessa.
          </p>
          {rivit.map((r) => (
            <div key={r.id} className="grid gap-3 rounded-md border p-3">
              <p className="text-sm font-medium">{r.osaNimi}</p>
              <div className="grid gap-2">
                <Label htmlFor={`toteutunut_${r.id}`} className="text-xs text-muted-foreground">
                  {r.variNimi}: toteutunut kulutus (g)
                </Label>
                <Input
                  id={`toteutunut_${r.id}`}
                  type="number"
                  min="1"
                  step="1"
                  value={arvot[r.id] ?? ""}
                  onChange={(e) => setArvot((a) => ({ ...a, [r.id]: e.target.value }))}
                />
              </div>
              {r.toinenVariNimi && (
                <div className="grid gap-2">
                  <Label htmlFor={`toinen_toteutunut_${r.id}`} className="text-xs text-muted-foreground">
                    {r.toinenVariNimi} ({r.toinenVariRooli && ROOLIN_NIMI[r.toinenVariRooli]}
                    ): toteutunut kulutus (g)
                  </Label>
                  <Input
                    id={`toinen_toteutunut_${r.id}`}
                    type="number"
                    min="1"
                    step="1"
                    value={toisetArvot[r.id] ?? ""}
                    onChange={(e) => setToisetArvot((a) => ({ ...a, [r.id]: e.target.value }))}
                  />
                </div>
              )}
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
