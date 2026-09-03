"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { paivitaOmatTiedot, type AsetuksetTila } from "./actions";

const alkutila: AsetuksetTila = { virhe: null, viesti: null };

export function OmatTiedotLomake({ nimi }: { nimi: string }) {
  const [tila, formAction, kaynnissa] = useActionState(paivitaOmatTiedot, alkutila);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor="full_name">Nimi</Label>
        <Input id="full_name" name="full_name" defaultValue={nimi} required />
        <p className="text-xs text-muted-foreground">
          Näkyy töiden kohdalla merkintänä siitä kuka aloitti tai viimeisteli työn.
        </p>
      </div>

      {tila.virhe && (
        <p className="text-sm text-destructive" role="alert">
          {tila.virhe}
        </p>
      )}
      {tila.viesti && <p className="text-sm text-success">{tila.viesti}</p>}

      <div>
        <Button type="submit" disabled={kaynnissa}>
          {kaynnissa ? "Tallennetaan..." : "Tallenna"}
        </Button>
      </div>
    </form>
  );
}
