"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/supabase/database.types";

import { paivitaAsetukset, type AsetuksetTila } from "./actions";

const alkutila: AsetuksetTila = { virhe: null, viesti: null };

export function AsetuksetLomake({
  asetukset,
}: {
  asetukset: Database["public"]["Tables"]["asetukset"]["Row"];
}) {
  const [tila, formAction, kaynnissa] = useActionState(paivitaAsetukset, alkutila);

  return (
    <form action={formAction} className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="oletus_halytysraja_g">Oletushälytysraja (g)</Label>
          <Input
            id="oletus_halytysraja_g"
            name="oletus_halytysraja_g"
            type="number"
            step="1"
            min="0"
            defaultValue={asetukset.oletus_halytysraja_g}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tullimaksu_prosentti_oletus">Tullimaksu-% (oletus, ei-EU)</Label>
          <Input
            id="tullimaksu_prosentti_oletus"
            name="tullimaksu_prosentti_oletus"
            type="number"
            step="0.01"
            min="0"
            defaultValue={asetukset.tullimaksu_prosentti_oletus}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="alv_prosentti_oletus">ALV-% (oletus, ei-EU tuonti)</Label>
          <Input
            id="alv_prosentti_oletus"
            name="alv_prosentti_oletus"
            type="number"
            step="0.01"
            min="0"
            defaultValue={asetukset.alv_prosentti_oletus}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kate_prosentti_oletus">Kate-% (oletus, osan suositushinta)</Label>
          <Input
            id="kate_prosentti_oletus"
            name="kate_prosentti_oletus"
            type="number"
            step="0.01"
            min="0"
            defaultValue={asetukset.kate_prosentti_oletus}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="yleinen_tuntihinta">Yleinen tuntihinta (€/h)</Label>
          <Input
            id="yleinen_tuntihinta"
            name="yleinen_tuntihinta"
            type="number"
            step="0.01"
            min="0"
            defaultValue={asetukset.yleinen_tuntihinta}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="nayta_hinnat_maalaajalle"
          name="nayta_hinnat_maalaajalle"
          defaultChecked={asetukset.nayta_hinnat_maalaajalle}
        />
        <Label htmlFor="nayta_hinnat_maalaajalle" className="font-normal">
          Näytä kilohinnat ja tuntiveloitukset myös maalaaja-roolille
        </Label>
      </div>

      <div className="grid gap-4 rounded-md border p-4">
        <div>
          <h2 className="font-medium">Toimituskuluarviot</h2>
          <p className="text-sm text-muted-foreground">
            Ei live-hakua myyjän sivulta - arvioidut kulut alkuperittäin, käytetään kun väriltä
            puuttuu oma ylikirjoitus.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="yrityksen_osoite">Yrityksen toimitusosoite</Label>
          <Textarea
            id="yrityksen_osoite"
            name="yrityksen_osoite"
            rows={2}
            defaultValue={asetukset.yrityksen_osoite ?? ""}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="toimituskulu_per_kg_eu_oletus">Toimituskulu €/kg (EU)</Label>
            <Input
              id="toimituskulu_per_kg_eu_oletus"
              name="toimituskulu_per_kg_eu_oletus"
              type="number"
              step="0.01"
              min="0"
              defaultValue={asetukset.toimituskulu_per_kg_eu_oletus}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="toimituskulu_per_kg_usa_oletus">Toimituskulu €/kg (USA)</Label>
            <Input
              id="toimituskulu_per_kg_usa_oletus"
              name="toimituskulu_per_kg_usa_oletus"
              type="number"
              step="0.01"
              min="0"
              defaultValue={asetukset.toimituskulu_per_kg_usa_oletus}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="toimituskulu_per_kg_muu_oletus">Toimituskulu €/kg (muu)</Label>
            <Input
              id="toimituskulu_per_kg_muu_oletus"
              name="toimituskulu_per_kg_muu_oletus"
              type="number"
              step="0.01"
              min="0"
              defaultValue={asetukset.toimituskulu_per_kg_muu_oletus}
            />
          </div>
        </div>
      </div>

      {tila.virhe && (
        <p className="text-sm text-destructive" role="alert">
          {tila.virhe}
        </p>
      )}
      {tila.viesti && <p className="text-sm text-success">{tila.viesti}</p>}

      <div>
        <Button type="submit" disabled={kaynnissa}>
          {kaynnissa ? "Tallennetaan..." : "Tallenna asetukset"}
        </Button>
      </div>
    </form>
  );
}
