"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ShieldOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { poistaKaksivaiheinen } from "./actions";

/**
 * Adminin hätäuloskäynti: kaksivaiheisen tunnistuksen poisto toiselta
 * käyttäjältä. Ilman tätä kadonnut puhelin lukitsisi käyttäjän ulos pysyvästi,
 * koska TOTP:ssä ei ole varakoodeja.
 */
export function KaksivaiheinenNappi({
  kayttajaId,
  nimi,
  kaytossa,
}: {
  kayttajaId: string;
  nimi: string;
  kaytossa: boolean;
}) {
  const [kaynnissa, aloita] = useTransition();

  if (!kaytossa) {
    return <span className="text-sm text-muted-foreground">Ei käytössä</span>;
  }

  function poista() {
    if (
      !window.confirm(
        `Poistetaanko kaksivaiheinen tunnistus käyttäjältä ${nimi}? ` +
          "Käyttäjä kirjautuu sisään pelkällä salasanalla kunnes ottaa sen uudelleen käyttöön."
      )
    ) {
      return;
    }
    aloita(async () => {
      try {
        await poistaKaksivaiheinen(kayttajaId);
        toast.success("Kaksivaiheinen tunnistus poistettu.");
      } catch (virhe) {
        toast.error(virhe instanceof Error ? virhe.message : "Poisto epäonnistui.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">Käytössä</Badge>
      <Button type="button" variant="outline" size="sm" disabled={kaynnissa} onClick={poista}>
        <ShieldOff className="size-4" />
        Poista
      </Button>
    </div>
  );
}
