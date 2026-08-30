"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { kutsuKayttaja, type KutsuTila } from "./actions";

const alkutila: KutsuTila = { virhe: null, viesti: null };

export function KutsuLomake() {
  const [tila, formAction, kaynnissa] = useActionState(kutsuKayttaja, alkutila);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <div className="grid gap-2">
        <Label htmlFor="full_name">Nimi</Label>
        <Input id="full_name" name="full_name" placeholder="Etu Sukunimi" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Sähköposti</Label>
        <Input id="email" name="email" type="email" required placeholder="etu@esimerkki.fi" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="role">Rooli</Label>
        <Select name="role" defaultValue="maalaaja">
          <SelectTrigger id="role" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="maalaaja">Maalaaja</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={kaynnissa}>
        {kaynnissa ? "Lähetetään..." : "Lähetä kutsu"}
      </Button>
      {tila.virhe && (
        <p className="text-sm text-destructive sm:col-span-4" role="alert">
          {tila.virhe}
        </p>
      )}
      {tila.viesti && (
        <p className="text-sm text-success sm:col-span-4">{tila.viesti}</p>
      )}
    </form>
  );
}
