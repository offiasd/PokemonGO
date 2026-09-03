"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Uuden salasanan vähimmäispituus. Sama vaatimus on Supabasen asetuksissa. */
const VAHIMMAISPITUUS = 10;

/**
 * Tarkistaa salasanan koskematta nykyiseen istuntoon. Onnistunut kutsu luo
 * uuden istunnon, joka suljetaan heti - muuten kannalle jäisi roikkumaan
 * käyttämätön istunto joka vaihdosta.
 */
async function salasanaTaysmaa(sahkoposti: string, salasana: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const vastaus = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey },
    body: JSON.stringify({ email: sahkoposti, password: salasana }),
  });
  if (!vastaus.ok) return false;

  const { access_token } = (await vastaus.json()) as { access_token?: string };
  if (access_token) {
    await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey, Authorization: `Bearer ${access_token}` },
    }).catch(() => {});
  }
  return true;
}

export function SalasananVaihto({ sahkoposti }: { sahkoposti: string }) {
  const [nykyinen, setNykyinen] = useState("");
  const [uusi, setUusi] = useState("");
  const [toistettu, setToistettu] = useState("");
  const [kaynnissa, aloita] = useTransition();

  const virhe =
    uusi && uusi.length < VAHIMMAISPITUUS
      ? `Salasanan pitää olla vähintään ${VAHIMMAISPITUUS} merkkiä.`
      : toistettu && uusi !== toistettu
        ? "Salasanat eivät täsmää."
        : null;

  function vaihda() {
    aloita(async () => {
      // Nykyinen salasana tarkistetaan erillisellä kirjautumiskutsulla:
      // Supabase ei vaadi sitä salasanan vaihdossa, joten ilman tarkistusta
      // auki jäänyt istunto riittäisi salasanan vaihtamiseen. Kutsu tehdään
      // suoraan rajapintaan eikä kirjastolla, koska kirjaston kirjautuminen
      // korvaisi nykyisen istunnon uudella - ja kaksivaiheisen tunnistuksen
      // kanssa pudottaisi sen takaisin koodia odottavalle tasolle.
      if (!(await salasanaTaysmaa(sahkoposti, nykyinen))) {
        toast.error("Nykyinen salasana on väärin.");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: uusi });
      if (error) {
        toast.error(error.message);
        return;
      }
      setNykyinen("");
      setUusi("");
      setToistettu("");
      toast.success("Salasana vaihdettu.");
    });
  }

  return (
    <div className="grid gap-4 sm:max-w-sm">
      <div className="grid gap-2">
        <Label htmlFor="nykyinen_salasana">Nykyinen salasana</Label>
        <Input
          id="nykyinen_salasana"
          type="password"
          autoComplete="current-password"
          value={nykyinen}
          onChange={(e) => setNykyinen(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="uusi_salasana">Uusi salasana</Label>
        <Input
          id="uusi_salasana"
          type="password"
          autoComplete="new-password"
          value={uusi}
          onChange={(e) => setUusi(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="uusi_salasana_toisto">Uusi salasana uudelleen</Label>
        <Input
          id="uusi_salasana_toisto"
          type="password"
          autoComplete="new-password"
          value={toistettu}
          onChange={(e) => setToistettu(e.target.value)}
        />
      </div>

      {virhe && (
        <p className="text-sm text-destructive" role="alert">
          {virhe}
        </p>
      )}

      <div>
        <Button
          type="button"
          onClick={vaihda}
          disabled={
            kaynnissa || Boolean(virhe) || !nykyinen || uusi.length < VAHIMMAISPITUUS || !toistettu
          }
        >
          {kaynnissa ? "Vaihdetaan..." : "Vaihda salasana"}
        </Button>
      </div>
    </div>
  );
}
