"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database, TyoVaihe } from "@/lib/supabase/database.types";
import { TYO_VAIHEET } from "@/lib/vakiot";

import { paivitaTuntiveloitus, poistaTuntiveloitusYlikirjoitus } from "./actions";

type Tuntiveloitus = Database["public"]["Tables"]["tuntiveloitukset"]["Row"];

function Rivi({
  vaihe,
  nimi,
  ylikirjoitus,
  yleinenTuntihinta,
}: {
  vaihe: TyoVaihe;
  nimi: string;
  ylikirjoitus: Tuntiveloitus | undefined;
  yleinenTuntihinta: number;
}) {
  const [arvo, setArvo] = useState(String(ylikirjoitus?.tuntihinta ?? ""));
  const [kaynnissa, aloita] = useTransition();

  return (
    // Neljä saraketta vaativat vähintään 385 px, mikä leikkautui puhelimessa
    // kortin reunan yli. Mobiilissa nimi on omalla rivillään ja kenttä + napit
    // sen alla; sm-koosta ylöspäin sm:contents purkaa kääreen, jolloin ne
    // asettuvat takaisin gridin omiksi sarakkeikseen.
    <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-end">
      <div className="min-w-0">
        <Label className="font-normal">{nimi}</Label>
        {!ylikirjoitus && (
          <p className="text-xs text-muted-foreground">
            Käytössä yleinen: {yleinenTuntihinta.toLocaleString("fi-FI")} €/h
          </p>
        )}
      </div>
      <div className="flex items-end gap-2 sm:contents">
        <Input
          className="min-w-0 flex-1"
          type="number"
          step="0.01"
          min="0"
          placeholder={yleinenTuntihinta.toLocaleString("fi-FI")}
          value={arvo}
          onChange={(e) => setArvo(e.target.value)}
          disabled={kaynnissa}
        />
        <Button
          type="button"
          size="sm"
          disabled={kaynnissa || arvo === ""}
          onClick={() =>
            aloita(async () => {
              try {
                await paivitaTuntiveloitus(vaihe, Number(arvo));
                toast.success(`${nimi}: tuntiveloitus tallennettu.`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Tallennus epäonnistui.");
              }
            })
          }
        >
          Tallenna
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Käytä yleistä tuntihintaa"
          disabled={kaynnissa || !ylikirjoitus}
          onClick={() =>
            aloita(async () => {
              try {
                await poistaTuntiveloitusYlikirjoitus(vaihe);
                setArvo("");
                toast.success(`${nimi}: käytetään jälleen yleistä tuntihintaa.`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Nollaus epäonnistui.");
              }
            })
          }
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function TuntiveloituksetLomake({
  tuntiveloitukset,
  yleinenTuntihinta,
}: {
  tuntiveloitukset: Tuntiveloitus[];
  yleinenTuntihinta: number;
}) {
  return (
    <div className="grid gap-4">
      {TYO_VAIHEET.map(({ arvo, nimi }) => (
        <Rivi
          key={arvo}
          vaihe={arvo}
          nimi={nimi}
          ylikirjoitus={tuntiveloitukset.find((t) => t.vaihe === arvo)}
          yleinenTuntihinta={yleinenTuntihinta}
        />
      ))}
    </div>
  );
}
