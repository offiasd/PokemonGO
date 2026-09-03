"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";

import { aloitaVastaanotettuTyo } from "./actions";

/** Siirtää vastaanotetun työn maalaukseen ja merkitsee aloittajaksi kirjautuneen. */
export function AloitaTyo({ tyoId, koko = "sm" }: { tyoId: string; koko?: "sm" | "default" }) {
  const router = useRouter();
  const [kaynnissa, aloita] = useTransition();

  return (
    <Button
      type="button"
      size={koko}
      disabled={kaynnissa}
      onClick={() =>
        aloita(async () => {
          try {
            await aloitaVastaanotettuTyo(tyoId);
            toast.success("Työ aloitettu.");
            router.refresh();
          } catch (virhe) {
            toast.error(virhe instanceof Error ? virhe.message : "Aloitus epäonnistui.");
          }
        })
      }
    >
      <Play className="size-4" />
      {kaynnissa ? "Aloitetaan..." : "Aloita työ"}
    </Button>
  );
}
