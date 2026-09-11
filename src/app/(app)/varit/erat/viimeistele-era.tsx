"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Stamp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { muotoileEuro } from "@/lib/vakiot";

import { viimeisteleEra } from "./actions";

/**
 * Tullauspäätöksen kirjaus kesken olleelle erälle.
 *
 * Arviot näkyvät kenttien oletusarvoina, jotta näkee mistä luvusta ollaan
 * korjaamassa mihin. Tallennus laskee erän kilohinnat uudelleen ja siirtää
 * värien keskihintaa erotuksen verran.
 */
export function ViimesteleEra({
  eraId,
  toimittaja,
  arvioTulli,
  arvioAlv,
}: {
  eraId: string;
  toimittaja: string | null;
  arvioTulli: number;
  arvioAlv: number;
}) {
  const router = useRouter();
  const [auki, setAuki] = useState(false);
  const [tulli, setTulli] = useState(String(arvioTulli));
  const [alv, setAlv] = useState(String(arvioAlv));
  const [kesken, aja] = useTransition();

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAuki(true)}>
        <Stamp className="size-4" />
        Kirjaa tullauspäätös
      </Button>

      <Dialog open={auki} onOpenChange={setAuki}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tullauspäätös</DialogTitle>
            <DialogDescription>
              {toimittaja ? `${toimittaja}: ` : ""}arviot olivat tulli{" "}
              {muotoileEuro(arvioTulli)} ja tuonti-ALV {muotoileEuro(arvioAlv)}. Todelliset luvut
              korvaavat ne, ja erän kilohinnat lasketaan uudelleen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="paatos_tulli">Tulli €</Label>
              <Input
                id="paatos_tulli"
                type="number"
                min="0"
                step="0.01"
                value={tulli}
                onChange={(e) => setTulli(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paatos_alv">Tuonti-ALV €</Label>
              <Input
                id="paatos_alv"
                type="number"
                min="0"
                step="0.01"
                value={alv}
                onChange={(e) => setAlv(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAuki(false)}>
              Peruuta
            </Button>
            <Button
              type="button"
              disabled={kesken}
              onClick={() =>
                aja(async () => {
                  try {
                    await viimeisteleEra(eraId, Number(tulli.replace(",", ".")), Number(alv.replace(",", ".")));
                    setAuki(false);
                    toast.success("Tullauspäätös kirjattu ja kilohinnat korjattu.");
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
