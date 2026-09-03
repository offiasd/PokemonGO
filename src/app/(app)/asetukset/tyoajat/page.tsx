import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Asetuslomake } from "../asetuslomake";
import { TuntiveloituksetLomake } from "../tuntiveloitukset-lomake";

export default async function TyoajatSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();
  const [asetukset, tuntiveloituksetVastaus] = await Promise.all([
    haeAsetukset(),
    supabase.from("tuntiveloitukset").select("*"),
  ]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Yleinen tuntihinta</CardTitle>
          <CardDescription>
            Käytetään kaikissa työvaiheissa, joille ei ole omaa veloitusta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Asetuslomake>
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="yleinen_tuntihinta">Tuntihinta (€/h)</Label>
              <Input
                id="yleinen_tuntihinta"
                name="yleinen_tuntihinta"
                type="number"
                step="0.01"
                min="0"
                defaultValue={asetukset.yleinen_tuntihinta}
              />
            </div>
          </Asetuslomake>
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
            yleinenTuntihinta={asetukset.yleinen_tuntihinta}
          />
        </CardContent>
      </Card>
    </>
  );
}
