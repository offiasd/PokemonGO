"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { korjaaSaldo } from "../actions";

/**
 * Saldon manuaalinen oikaisu: kenttään syötetään uusi kokonaissaldo, ei
 * muutosta. Näin luku vastaa sitä mitä hyllyssä on, kun saldo lasketaan
 * inventaariossa. Palvelinpuoli muuntaa sen erotukseksi.
 *
 * Kenttä alustetaan nykyisellä saldolla. Sivu antaa komponentille key-arvoksi
 * saldon, joten kenttä palautuu ajan tasalle aina kun saldo muuttuu - myös
 * täydennyksen jälkeen.
 */
export function KorjaaSaldo({
  variId,
  nykyinenSaldoG,
}: {
  variId: string;
  nykyinenSaldoG: number;
}) {
  const [arvo, setArvo] = useState(String(nykyinenSaldoG));
  const [kaynnissa, aloita] = useTransition();

  const muuttumaton = arvo === "" || Number(arvo) === nykyinenSaldoG;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="korjaa-saldo">
          Korjaa saldo (g)
        </label>
        <Input
          id="korjaa-saldo"
          type="number"
          min="0"
          step="1"
          value={arvo}
          onChange={(e) => setArvo(e.target.value)}
          className="w-36"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={kaynnissa || muuttumaton}
        onClick={() =>
          aloita(async () => {
            try {
              await korjaaSaldo(variId, Number(arvo));
              toast.success("Saldo korjattu.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Korjaus epäonnistui.");
            }
          })
        }
      >
        <Pencil className="size-4" />
        Tallenna saldo
      </Button>
    </div>
  );
}
