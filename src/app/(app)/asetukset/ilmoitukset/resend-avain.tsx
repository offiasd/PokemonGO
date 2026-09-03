"use client";

import { useActionState, useTransition, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { lahetaTestiviesti, tallennaResendAvain, type AsetuksetTila } from "../actions";

const alkutila: AsetuksetTila = { virhe: null, viesti: null };

export function ResendAvain({ asetettu }: { asetettu: boolean }) {
  const [tila, formAction, tallennetaan] = useActionState(tallennaResendAvain, alkutila);
  const [lahetetaan, aloita] = useTransition();
  const [avain, setAvain] = useState("");

  return (
    <div className="grid gap-6">
      <form action={formAction} className="grid gap-4 sm:max-w-md">
        <div className="grid gap-2">
          <Label htmlFor="resend_avain" className="flex items-center gap-2">
            <KeyRound className="size-4" />
            Resendin API-avain
            {asetettu && <Badge variant="secondary">Tallennettu</Badge>}
          </Label>
          <Input
            id="resend_avain"
            name="resend_avain"
            type="password"
            autoComplete="off"
            placeholder={asetettu ? "Tallennettu - kirjoita uusi vaihtaaksesi" : "re_..."}
            value={avain}
            onChange={(e) => setAvain(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Avain tallennetaan salattuna tietokantaan eikä sitä näytetä enää tallennuksen jälkeen.
          </p>
        </div>

        {tila.virhe && (
          <p className="text-sm text-destructive" role="alert">
            {tila.virhe}
          </p>
        )}
        {tila.viesti && <p className="text-sm text-success">{tila.viesti}</p>}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={tallennetaan || avain.trim() === ""}>
            {tallennetaan ? "Tallennetaan..." : "Tallenna avain"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={lahetetaan}
            onClick={() =>
              aloita(async () => {
                try {
                  toast.info(await lahetaTestiviesti());
                } catch (virhe) {
                  toast.error(virhe instanceof Error ? virhe.message : "Lähetys epäonnistui.");
                }
              })
            }
          >
            <Send className="size-4" />
            {lahetetaan ? "Lähetetään..." : "Lähetä testiviesti"}
          </Button>
        </div>
      </form>
    </div>
  );
}
