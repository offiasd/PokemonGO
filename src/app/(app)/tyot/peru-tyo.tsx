"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { peruTyo } from "./actions";

export function PeruTyo({ tyoId }: { tyoId: string }) {
  const [kaynnissa, aloita] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={kaynnissa}
      onClick={() => {
        if (!window.confirm("Perutaanko työ? Varattu maali vapautuu varastoon.")) return;
        aloita(async () => {
          try {
            await peruTyo(tyoId);
            toast.success("Työ peruttu.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Peruminen epäonnistui.");
          }
        });
      }}
    >
      <X className="size-4" />
      Peru
    </Button>
  );
}
