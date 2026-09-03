import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { AjoneuvotyypitLomake } from "../ajoneuvotyypit-lomake";

export default async function AjoneuvotyypitSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const [tyyppiVastaus, osienTyypitVastaus] = await Promise.all([
    supabase.from("ajoneuvotyypit").select("*").order("jarjestys").order("nimi"),
    // Poisto sallitaan vain käyttämättömälle tyypille, joten haetaan osien
    // tyypit ja lasketaan käyttömäärät tässä - erillistä laskuria ei tarvita.
    supabase.from("osat").select("ajoneuvotyyppi"),
  ]);

  const tyypit = (tyyppiVastaus.data ?? []).map((t) => ({
    avain: t.avain,
    nimi: t.nimi,
    osia: (osienTyypitVastaus.data ?? []).filter((o) => o.ajoneuvotyyppi === t.avain).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajoneuvotyypit</CardTitle>
        <CardDescription>
          Osalle valittavat tyypit. Käytössä olevaa tyyppiä ei voi poistaa, mutta sen voi nimetä
          uudelleen - osien viittaukset eivät muutu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AjoneuvotyypitLomake tyypit={tyypit} />
      </CardContent>
    </Card>
  );
}
