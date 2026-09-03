"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { paivitaAsetukset, type AsetuksetTila } from "./actions";

const alkutila: AsetuksetTila = { virhe: null, viesti: null };

/**
 * Kääre asetuslomakkeille.
 *
 * Asetukset ovat yhdessä kantarivissä mutta useassa lomakkeessa eri
 * välilehdillä, joten palvelinfunktio tallentaa vain lähetetyt kentät. Tämä
 * komponentti hoitaa yhteisen tilan, virheen, kuittauksen ja napin.
 */
export function Asetuslomake({
  children,
  nappi = "Tallenna",
}: {
  children: React.ReactNode;
  nappi?: string;
}) {
  const [tila, formAction, kaynnissa] = useActionState(paivitaAsetukset, alkutila);

  return (
    <form action={formAction} className="grid gap-6">
      {children}

      {tila.virhe && (
        <p className="text-sm text-destructive" role="alert">
          {tila.virhe}
        </p>
      )}
      {tila.viesti && <p className="text-sm text-success">{tila.viesti}</p>}

      <div>
        <Button type="submit" disabled={kaynnissa}>
          {kaynnissa ? "Tallennetaan..." : nappi}
        </Button>
      </div>
    </form>
  );
}
