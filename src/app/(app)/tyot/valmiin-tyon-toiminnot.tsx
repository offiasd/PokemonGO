"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Archive, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { arkistoiTyo, palautaTyoKeskeneraiseksi } from "./actions";

/**
 * Valmiin työn palautus ja arkistointi.
 *
 * Palautus on kaikille: valmiiksi painetaan helposti vahingossa liian
 * aikaisin, ja korjaus kuuluu sille joka virheen huomaa. Arkistointi näkyy
 * vain adminille, koska se siirtää työn pois aktiivisesta listasta.
 */
export function ValmiinTyonToiminnot({
  tyoId,
  naytaArkistointi,
}: {
  tyoId: string;
  naytaArkistointi: boolean;
}) {
  const [kaynnissa, aloita] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={kaynnissa}
        onClick={() =>
          aloita(async () => {
            if (
              !window.confirm(
                "Palautetaanko työ keskeneräiseksi? Kulutettu maali palaa varastoon ja varataan uudelleen työlle."
              )
            ) {
              return;
            }
            try {
              await palautaTyoKeskeneraiseksi(tyoId);
              toast.success("Työ palautettiin keskeneräiseksi - maali varattu uudelleen.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Palautus epäonnistui.");
            }
          })
        }
      >
        <Undo2 className="size-4" />
        Palauta keskeneräiseksi
      </Button>

      {naytaArkistointi && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={kaynnissa}
          onClick={() =>
            aloita(async () => {
              if (
                !window.confirm(
                  "Arkistoidaanko työ? Tiedot säilyvät arkistossa, mutta värisaldoihin ei kosketa."
                )
              ) {
                return;
              }
              try {
                await arkistoiTyo(tyoId);
                toast.success("Työ arkistoitu.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Arkistointi epäonnistui.");
              }
            })
          }
        >
          <Archive className="size-4" />
          Arkistoi
        </Button>
      )}
    </>
  );
}
