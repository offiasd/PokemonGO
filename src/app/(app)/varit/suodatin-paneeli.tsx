"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";

import { VarienSuodattimet, laskeValitutSuodattimet } from "./varien-suodattimet";

/**
 * Suodattimet puhelimessa: kelluva nappi oikeassa alareunassa, josta paneeli
 * liukuu oikealta näkyviin.
 *
 * Työpöydällä suodattimet ovat omana sivupalkkinaan, joten koko tämä
 * komponentti piilotetaan lg-koosta ylöspäin. Paneeli peittää 80 % ruudun
 * leveydestä: värilista jää reunasta näkyviin, jolloin näkee heti mihin
 * valinta vaikuttaa ja paneelin saa suljettua koskettamalla listaa.
 */
export function SuodatinPaneeli({ naytaPoistetutValinta }: { naytaPoistetutValinta: boolean }) {
  const [auki, setAuki] = useState(false);
  const searchParams = useSearchParams();
  const valittuja = laskeValitutSuodattimet(searchParams);

  return (
    <DialogPrimitive.Root open={auki} onOpenChange={setAuki}>
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          size="lg"
          className="fixed right-4 bottom-4 z-40 rounded-full shadow-lg lg:hidden"
        >
          <SlidersHorizontal className="size-4" />
          Suodattimet
          {valittuja > 0 && (
            <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-primary-foreground text-xs font-semibold text-primary">
              {valittuja}
            </span>
          )}
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
        <DialogPrimitive.Content
          // Paneelissa ei ole erillistä kuvausta, joten Radixin varoitus
          // puuttuvasta Descriptionista vaimennetaan tarkoituksella.
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-4/5 max-w-sm flex-col gap-4 border-l bg-background p-4 shadow-lg duration-300 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right lg:hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">Suodattimet</DialogTitle>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Sulje suodattimet">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Paneeli jää auki valintojen ajaksi: monivalinnassa on tavallista
              napsauttaa useaa peräkkäin, ja lista päivittyy taustalla. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <VarienSuodattimet naytaPoistetutValinta={naytaPoistetutValinta} kehys={false} />
          </div>

          <DialogPrimitive.Close asChild>
            <Button type="button" className="w-full">
              Näytä tulokset
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
