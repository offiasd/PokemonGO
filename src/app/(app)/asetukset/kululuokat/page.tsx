import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { KululuokatLomake } from "./kululuokat-lomake";

export default async function KululuokatSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const [luokatVastaus, rivitVastaus] = await Promise.all([
    supabase.from("kululuokat").select("*").order("jarjestys").order("nimi"),
    // Poisto sallitaan vain käyttämättömälle luokalle, joten käyttömäärät
    // lasketaan tässä - erillistä laskuria ei tarvita.
    supabase.from("kuitin_rivit").select("kululuokka_id"),
  ]);

  const luokat = (luokatVastaus.data ?? []).map((l) => ({
    id: l.id,
    nimi: l.nimi,
    aktiivinen: l.aktiivinen,
    rivit: (rivitVastaus.data ?? []).filter((r) => r.kululuokka_id === l.id).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kululuokat</CardTitle>
        <CardDescription>
          Oma seuranta, erillään käyttötarkoituksesta: käyttötarkoitus kertoo mihin ostos meni,
          kululuokka mitä se oli. Polttoainetta ei ole listalla tarkoituksella - ajoneuvo on
          yksityisvarallisuutta, joten polttoainekuitit ovat yksityisottoja.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <KululuokatLomake luokat={luokat} />
      </CardContent>
    </Card>
  );
}
