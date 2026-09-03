"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

import { kirjauduUlosKaikkialta } from "@/app/kirjaudu/actions";

/**
 * Uloskirjaus kaikilta laitteilta. Varmistus kysytään, koska nappi katkaisee
 * myös nykyisen istunnon - myös silloin kun sitä painetaan vahingossa.
 */
export function UloskirjausKaikkialta() {
  const [kaynnissa, aloita] = useTransition();

  return (
    <div className="grid gap-4 sm:max-w-sm">
      <p className="text-sm text-muted-foreground">
        Katkaisee kirjautumisen kaikissa selaimissa ja puhelimissa, myös tässä. Käytä jos laite on
        kadonnut tai jäi kirjautuneena vieraalle koneelle.
      </p>
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={kaynnissa}
          onClick={() => {
            if (!window.confirm("Kirjataanko ulos kaikilta laitteilta? Myös tämä istunto päättyy."))
              return;
            aloita(async () => {
              await kirjauduUlosKaikkialta();
            });
          }}
        >
          <LogOut className="size-4" />
          {kaynnissa ? "Kirjataan ulos..." : "Kirjaa ulos kaikilta laitteilta"}
        </Button>
      </div>
    </div>
  );
}
