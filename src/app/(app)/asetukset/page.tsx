import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { AsetuksetLomake } from "./asetukset-lomake";
import { TuntiveloituksetLomake } from "./tuntiveloitukset-lomake";

export default async function AsetuksetSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const [asetuksetVastaus, tuntiveloituksetVastaus] = await Promise.all([
    supabase.from("asetukset").select("*").single(),
    supabase.from("tuntiveloitukset").select("*"),
  ]);

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
