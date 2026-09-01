"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KayttajaRooli } from "@/lib/supabase/database.types";

import { paivitaRooli } from "./actions";

export function RooliValitsin({
  kayttajaId,
  nykyinenRooli,
  omaId,
}: {
  kayttajaId: string;
  nykyinenRooli: KayttajaRooli;
  omaId: string;
}) {
  const [kaynnissa, aloita] = useTransition();
  const onOma = kayttajaId === omaId;

  return (
    <Select
      defaultValue={nykyinenRooli}
      disabled={kaynnissa || onOma}
      onValueChange={(uusiRooli) => {
        aloita(async () => {
          try {
            await paivitaRooli(kayttajaId, uusiRooli as KayttajaRooli);
            toast.success("Rooli päivitetty.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Roolin päivitys epäonnistui.");
          }
        });
      }}
    >
      <SelectTrigger className="w-32 sm:w-36" title={onOma ? "Et voi muuttaa omaa roolia" : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="maalaaja">Maalaaja</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}
