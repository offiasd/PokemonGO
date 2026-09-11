"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { muotoileKuitinSumma } from "@/lib/vakiot";

import { mitatoiKuitti, poistaKuitti } from "../actions";

/**
 * Kuitin poisto tai mitätöinti sen mukaan onko se jo tosite.
 *
 * Säilytysvelvollisuus koskee kirjanpitoon vietyjä kuitteja. Vahingossa
 * kuvattu kuva, kaksoiskappale tai jonkun toisen kuitti ei ole tosite - sitä
 * ei ole luovutettu mihinkään, joten se poistetaan kokonaan eikä jää
 * kertymään kuudeksi vuodeksi.
 *
 * Luovutettua kuittia ei poisteta vaan mitätöidään syineen: kirjanpidossa
 * vientejä ei pyyhitä vaan oikaistaan, ja kirjanpitäjän pitää nähdä että
 * jotain korjattiin ja miksi. Kuva ja rivit säilyvät.
 *
 * Molemmissa varmistuksessa näkyy nimenomaan se kuitti joka on menossa:
 * pelkkä "oletko varma" ei estä väärän kuitin poistoa, mutta toimittaja ja
 * summa estävät.
 */
export function KuitinPoisto({
  kuittiId,
  toimittaja,
  paivays,
  loppusummaEur,
  valuutta,
  loppusummaValuutassa,
  kurssinLahde,
  luovutettuAt,
  mitatoityAt,
  mitatointiSyy,
}: {
  kuittiId: string;
  toimittaja: string | null;
  paivays: string;
  loppusummaEur: number;
  /** Valuutta ja siinä luettu summa: vahvistamaton euromäärä on nolla. */
  valuutta: string;
  loppusummaValuutassa: number;
  kurssinLahde: string | null;
  /** Milloin kuitti lähti kirjanpitäjälle. Sen jälkeen vain mitätöinti. */
  luovutettuAt: string | null;
  mitatoityAt: string | null;
  mitatointiSyy: string | null;
}) {
  const router = useRouter();
  const [auki, setAuki] = useState(false);
  const [syy, setSyy] = useState("");
  const [kesken, aja] = useTransition();

  const luovutettu = luovutettuAt !== null;

  const kuitinTiedot = (
    <div className="grid gap-1 rounded-md border p-3 text-sm">
      <span className="font-medium">{toimittaja ?? "Toimittaja puuttuu"}</span>
      <span className="text-muted-foreground">
        {new Date(paivays).toLocaleDateString("fi-FI")} &middot;{" "}
        {muotoileKuitinSumma({ loppusummaEur, valuutta, loppusummaValuutassa, kurssinLahde })}
      </span>
    </div>
  );

  // Jo mitätöity kuitti on loppuun käsitelty: se näkyy historiassa syineen,
  // eikä sille ole enää toimintoa.
  if (mitatoityAt !== null) {
    return (
      <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
        Mitätöity {new Date(mitatoityAt).toLocaleDateString("fi-FI")}
        {mitatointiSyy ? `: ${mitatointiSyy}` : "."} Kuitti ei ole summissa mukana, mutta kuva ja
        rivit säilyvät.
      </p>
    );
  }

  function vahvistaPoisto() {
    aja(async () => {
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

  function vahvistaMitatointi() {
    if (syy.trim() === "") {
      toast.error("Kirjoita syy - kirjanpitäjä näkee sen.");
      return;
    }
    aja(async () => {
      const tulos = await mitatoiKuitti(kuittiId, syy);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      setAuki(false);
      toast.success("Kuitti mitätöity.");
      router.refresh();
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
        {luovutettu ? <Ban className="size-4" /> : <Trash2 className="size-4" />}
        {luovutettu ? "Mitätöi kuitti" : "Poista kuitti"}
      </Button>

      <Dialog open={auki} onOpenChange={setAuki}>
        <DialogContent>
          {luovutettu ? (
            <>
              <DialogHeader>
                <DialogTitle>Mitätöidäänkö kuitti?</DialogTitle>
                <DialogDescription>
                  Kuitti on luovutettu kirjanpitäjälle{" "}
                  {new Date(luovutettuAt).toLocaleDateString("fi-FI")}, joten sitä ei poisteta
                  vaan oikaistaan. Kuva ja rivit säilyvät, mutta kuitti jää pois summista.
                </DialogDescription>
              </DialogHeader>

              {kuitinTiedot}

              <div className="grid gap-2">
                <Label htmlFor="mitatointi_syy">Syy *</Label>
                <Textarea
                  id="mitatointi_syy"
                  value={syy}
                  onChange={(e) => setSyy(e.target.value)}
                  placeholder="Esim. kaksoiskappale, korvattu oikealla kuitilla"
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={kesken}
                  onClick={() => setAuki(false)}
                >
                  Peruuta
                </Button>
                <Button type="button" disabled={kesken} onClick={vahvistaMitatointi}>
                  {kesken ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                  Mitätöi
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Poistetaanko kuitti pysyvästi?</DialogTitle>
                <DialogDescription>
                  Poisto vie mukanaan kuitin rivit, luokittelut ja kuvan. Sitä ei voi perua.
                </DialogDescription>
              </DialogHeader>

              {kuitinTiedot}

              <p className="rounded-md border p-3 text-xs text-muted-foreground">
                Kuittia ei ole vielä luovutettu kirjanpitäjälle, joten se ei ole tosite ja sen voi
                poistaa. Luovutuksen jälkeen kuitti mitätöidään syineen.
              </p>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={kesken}
                  onClick={() => setAuki(false)}
                >
                  Peruuta
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={kesken}
                  onClick={vahvistaPoisto}
                >
                  {kesken ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Poista pysyvästi
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
