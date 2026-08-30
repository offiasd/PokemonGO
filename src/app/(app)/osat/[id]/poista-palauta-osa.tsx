"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ArchiveRestore, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { asetaOsanAktiivisuus } from "../actions";

export function PoistaPalautaOsa({ osaId, aktiivinen }: { osaId: string; aktiivinen: boolean }) {
  const [kaynnissa, aloita] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={kaynnissa}
      onClick={() =>
        aloita(async () => {
          try {
            await asetaOsanAktiivisuus(osaId, !aktiivinen);
            toast.success(aktiivinen ? "Osa poistettu (soft delete)." : "Osa palautettu.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Toiminto epäonnistui.");
          }
        })
      }
    >
      {aktiivinen ? <Trash2 className="size-4" /> : <ArchiveRestore className="size-4" />}
      {aktiivinen ? "Poista käytöstä" : "Palauta käyttöön"}
    </Button>
  );
}
