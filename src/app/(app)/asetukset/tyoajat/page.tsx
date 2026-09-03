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
          <CardTitle>Vastaanotettujen töiden kiireellisyys</CardTitle>
          <CardDescription>
            Vastaanotettu työ näkyy Työt-sivulla väritäplällä: vihreä kun aikaa on, keltainen kun
            työ pitäisi aloittaa ja punainen kun se on myöhässä.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Asetuslomake>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="vastaanotto_varoitus_paivat">Aloitettava viimeistään (vrk)</Label>
                <Input
                  id="vastaanotto_varoitus_paivat"
                  name="vastaanotto_varoitus_paivat"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={asetukset.vastaanotto_varoitus_paivat}
                />
                <p className="text-xs text-muted-foreground">
                  Tämän jälkeen täplä muuttuu keltaiseksi.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vastaanotto_kriittinen_paivat">Myöhässä (vrk)</Label>
                <Input
                  id="vastaanotto_kriittinen_paivat"
                  name="vastaanotto_kriittinen_paivat"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={asetukset.vastaanotto_kriittinen_paivat}
                />
                <p className="text-xs text-muted-foreground">
                  Tämän jälkeen täplä on punainen ja työ nousee jonon kärkeen.
                </p>
              </div>
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
