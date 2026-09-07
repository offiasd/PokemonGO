"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { muotoileEuro } from "@/lib/vakiot";

import { poistaKuitti } from "../actions";

/**
 * Kuitin pysyvä poisto.
 *
 * Tarkoitettu testikuittien siivoukseen, jottei kokeiluista jää kantaan
 * turhaa aineistoa. Painikkeen takana on varmistus, jossa näkyy nimenomaan
 * se kuitti joka on poistumassa: pelkkä "oletko varma" ei estä väärän
 * kuitin poistoa, mutta toimittaja ja summa estävät.
 *
 * Poisto on peruuttamaton ja vie mukanaan rivit ja kuvan, joten painike on
 * hillitty ja sivun laidassa - ei tallennuksen vieressä.
 */
export function KuitinPoisto({
  kuittiId,
  toimittaja,
  paivays,
  loppusummaEur,
  sailytettavaAsti,
}: {
  kuittiId: string;
  toimittaja: string | null;
  paivays: string;
  loppusummaEur: number;
  /** Kirjanpitolain mukainen säilytysajan päättymispäivä. */
  sailytettavaAsti: string;
}) {
  const router = useRouter();
  const [auki, setAuki] = useState(false);
  const [poistaa, poista] = useTransition();

  const sailytysaikaVoimassa = new Date(sailytettavaAsti) >= new Date();

  function vahvista() {
    poista(async () => {
      const tulos = await poistaKuitti(kuittiId);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      setAuki(false);
      toast.success("Kuitti poistettu.");
      router.push("/kulut");
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setAuki(true)}
      >
        <Trash2 className="size-4" />
        Poista kuitti
      </Button>

      <Dialog open={auki} onOpenChange={setAuki}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Poistetaanko kuitti pysyvästi?</DialogTitle>
            <DialogDescription>
              Poisto vie mukanaan kuitin rivit, luokittelut ja kuvan. Sitä ei voi perua.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1 rounded-md border p-3 text-sm">
            <span className="font-medium">{toimittaja ?? "Toimittaja puuttuu"}</span>
            <span className="text-muted-foreground">
              {new Date(paivays).toLocaleDateString("fi-FI")} &middot;{" "}
              {muotoileEuro(loppusummaEur)}
            </span>
          </div>

          {sailytysaikaVoimassa && (
            <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
              Säilytysaika on voimassa{" "}
              {new Date(sailytettavaAsti).toLocaleDateString("fi-FI")} asti. Kirjanpitolaki
              vaatii säilyttämään oikeat tositteet - poista vain testikuitteja.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={poistaa}
              onClick={() => setAuki(false)}
            >
              Peruuta
            </Button>
            <Button type="button" variant="destructive" disabled={poistaa} onClick={vahvista}>
              {poistaa ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Poista pysyvästi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
