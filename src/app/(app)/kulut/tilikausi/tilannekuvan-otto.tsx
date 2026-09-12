"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera } from "lucide-react";

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

import { otaTilannekuva } from "./actions";

/**
 * Tilannekuvan ottaminen ja uudelleenotto.
 *
 * Uudelleenotto kysyy vahvistuksen, koska vanha korvautuu. Se on silti
 * tarpeen: puuttuvan kirjauksen huomaa helposti vasta tilannekuvan jälkeen.
 */
export function TilannekuvanOtto({
  vuosi,
  onJoOtettu,
}: {
  vuosi: number;
  onJoOtettu: boolean;
}) {
  const router = useRouter();
  const [auki, setAuki] = useState(false);
  const [muistiinpano, setMuistiinpano] = useState("");
  const [kesken, aja] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant={onJoOtettu ? "outline" : "default"}
        onClick={() => setAuki(true)}
      >
        <Camera className="size-4" />
        {onJoOtettu ? "Ota uudelleen" : "Ota tilannekuva"}
      </Button>

      <Dialog open={auki} onOpenChange={setAuki}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Varaston tilannekuva 31.12.{vuosi}</DialogTitle>
            <DialogDescription>
              {onJoOtettu
                ? "Tilikaudelta on jo tilannekuva. Uusi korvaa vanhan, eikä vanhaa saa takaisin. Ota uudelleen vain jos kirjauksissa oli puute."
                : "Kopioi jokaisen aktiivisen värin saldon ja kilohinnan sellaisena kuin ne ovat juuri nyt. Ota vasta kun joulukuun työt ja täydennykset on kirjattu."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="tilannekuvan_muistiinpano">Muistiinpano</Label>
            <Input
              id="tilannekuvan_muistiinpano"
              value={muistiinpano}
              onChange={(e) => setMuistiinpano(e.target.value)}
              placeholder="Esim. inventaario tehty 30.12."
            />
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
                    await otaTilannekuva(vuosi, muistiinpano.trim() || null);
                    setAuki(false);
                    setMuistiinpano("");
                    toast.success("Tilannekuva otettu.");
                    router.refresh();
                  } catch (virhe) {
                    toast.error(
                      virhe instanceof Error ? virhe.message : "Tilannekuvan otto epäonnistui."
                    );
                  }
                })
              }
            >
              {onJoOtettu ? "Korvaa tilannekuva" : "Ota tilannekuva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
