"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { kirjauduUlos } from "../actions";

/**
 * Kirjautumisen toinen vaihe: kertakoodi tunnistussovelluksesta.
 *
 * Tänne ohjataan proxy.ts:stä kun käyttäjällä on vahvistettu tekijä mutta
 * istunto on vasta aal1-tasolla. Onnistunut vahvistus nostaa istunnon
 * aal2:een, jolloin sama proxy päästää eteenpäin.
 */
export function VahvistusLomake() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [koodi, setKoodi] = useState("");
  const [virhe, setVirhe] = useState<string | null>(null);
  const [kaynnissa, aloita] = useTransition();

  function vahvista(e: React.FormEvent) {
    e.preventDefault();
    aloita(async () => {
      setVirhe(null);
      const supabase = createClient();

      const { data: tekijat, error: listausVirhe } = await supabase.auth.mfa.listFactors();
      const tekija = tekijat?.totp?.[0];
      if (listausVirhe || !tekija) {
        setVirhe(listausVirhe?.message ?? "Tunnistussovellusta ei löytynyt.");
        return;
      }

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: tekija.id,
        code: koodi.trim(),
      });
      if (error) {
        setVirhe("Koodi ei kelvannut. Tarkista sovelluksen näyttämä koodi ja yritä uudelleen.");
        setKoodi("");
        return;
      }

      router.replace(next);
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" />
        </div>
        <CardTitle className="text-xl">Vahvista kirjautuminen</CardTitle>
        <CardDescription>
          Syötä tunnistussovelluksen näyttämä kuusinumeroinen kertakoodi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={vahvista} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="koodi">Kertakoodi</Label>
            <Input
              id="koodi"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={koodi}
              onChange={(e) => setKoodi(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {virhe && (
            <p className="text-sm text-destructive" role="alert">
              {virhe}
            </p>
          )}
          <Button type="submit" disabled={kaynnissa || koodi.length !== 6} className="w-full">
            {kaynnissa ? "Vahvistetaan..." : "Vahvista"}
          </Button>
        </form>

        {/* Ulos pääsee aina - muuten väärä tili jumittaisi selaimen tälle sivulle. */}
        <form action={kirjauduUlos} className="mt-4 text-center">
          <Button type="submit" variant="ghost" size="sm">
            Kirjaudu ulos
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
