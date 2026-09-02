import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { AjoneuvotyypitLomake } from "./ajoneuvotyypit-lomake";
import { AsetuksetLomake } from "./asetukset-lomake";
import { TuntiveloituksetLomake } from "./tuntiveloitukset-lomake";
import { VarastoYhteenveto } from "./varasto-yhteenveto";

export default async function AsetuksetSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const [asetuksetVastaus, tuntiveloituksetVastaus, varitVastaus, ajoneuvotyyppiVastaus, osienTyypitVastaus] =
    await Promise.all([
    supabase.from("asetukset").select("*").single(),
    supabase.from("tuntiveloitukset").select("*"),
    // Varaston arvo lasketaan JS:ssä asetusten arvoilla, joten haetaan
    // hinnanlaskennan tarvitsemat sarakkeet eikä valmista summaa.
    supabase
      .from("varit")
      .select(
        "saldo_g, ostohinta_per_kg, alkupera, tullimaksu_prosentti, alv_prosentti, toimituskulu_per_kg"
      )
      .eq("aktiivinen", true),
    supabase.from("ajoneuvotyypit").select("*").order("jarjestys").order("nimi"),
    // Poisto sallitaan vain käyttämättömälle tyypille, joten haetaan osien
    // tyypit ja lasketaan käyttömäärät tässä - erillistä laskuria ei tarvita.
    supabase.from("osat").select("ajoneuvotyyppi"),
  ]);

  const ajoneuvotyypit = (ajoneuvotyyppiVastaus.data ?? []).map((t) => ({
    avain: t.avain,
    nimi: t.nimi,
    osia: (osienTyypitVastaus.data ?? []).filter((o) => o.ajoneuvotyyppi === t.avain).length,
  }));

  if (!asetuksetVastaus.data) {
    return <p className="text-destructive">Asetuksia ei löytynyt.</p>;
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Asetukset</h1>
        <p className="text-muted-foreground">
          Globaalit oletusarvot: tulli/ALV, hälytysraja, kate ja hinnoittelunäkyvyys.
        </p>
      </div>

      <VarastoYhteenveto varit={varitVastaus.data ?? []} asetukset={asetuksetVastaus.data} />

      <Card>
        <CardHeader>
          <CardTitle>Yleiset asetukset</CardTitle>
          <CardDescription>
            Väri- ja osakohtaiset ylikirjoitukset ohittavat nämä oletukset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AsetuksetLomake asetukset={asetuksetVastaus.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ajoneuvotyypit</CardTitle>
          <CardDescription>
            Osalle valittavat tyypit. Käytössä olevaa tyyppiä ei voi poistaa, mutta sen voi
            nimetä uudelleen - osien viittaukset eivät muutu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AjoneuvotyypitLomake tyypit={ajoneuvotyypit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vaihekohtainen tuntiveloitus</CardTitle>
          <CardDescription>
            Jätä tyhjäksi käyttääksesi yleistä tuntihintaa kyseiselle vaiheelle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TuntiveloituksetLomake
            tuntiveloitukset={tuntiveloituksetVastaus.data ?? []}
            yleinenTuntihinta={asetuksetVastaus.data.yleinen_tuntihinta}
          />
        </CardContent>
      </Card>
    </div>
  );
}
