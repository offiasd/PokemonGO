import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { Asetuslomake } from "../asetuslomake";
import { ResendAvain } from "./resend-avain";

export default async function IlmoituksetSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const [asetukset, avainVastaus, lokiVastaus] = await Promise.all([
    haeAsetukset(),
    supabase.rpc("resend_avain_asetettu"),
    supabase.rpc("halytys_ilmoitusten_loki"),
  ]);
  const loki = lokiVastaus.data ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Hälytyssähköpostit</CardTitle>
          <CardDescription>
            Viesti lähtee kerran vuorokaudessa aamulla, kun väri on mennyt hälytysrajan alle.
            Samasta väristä ilmoitetaan vain kerran - uudelleen vasta jos saldo käy rajan yllä ja
            putoaa takaisin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Asetuslomake>
            {/* Piilokenttä kertoo palvelimelle että kytkin oli tällä lomakkeella:
                pois päältä oleva kytkin ei lähetä mitään. */}
            <input type="hidden" name="halytys_ilmoitukset_lomakkeella" value="1" />
            <div className="flex items-center gap-3">
              <Switch
                id="halytys_ilmoitukset_kaytossa"
                name="halytys_ilmoitukset_kaytossa"
                defaultChecked={asetukset.halytys_ilmoitukset_kaytossa}
              />
              <Label htmlFor="halytys_ilmoitukset_kaytossa" className="font-normal">
                Lähetä sähköposti hälytysrajan alituksista
              </Label>
            </div>

            <div className="grid gap-4 sm:max-w-md">
              <div className="grid gap-2">
                <Label htmlFor="halytys_ilmoitus_sahkoposti">Vastaanottajat</Label>
                <Input
                  id="halytys_ilmoitus_sahkoposti"
                  name="halytys_ilmoitus_sahkoposti"
                  type="text"
                  placeholder="nimi@esimerkki.fi, toinen@esimerkki.fi"
                  defaultValue={asetukset.halytys_ilmoitus_sahkoposti ?? ""}
                />
                <p className="text-xs text-muted-foreground">Useampi osoite pilkulla eroteltuna.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="halytys_ilmoitus_lahettaja">Lähettäjä</Label>
                <Input
                  id="halytys_ilmoitus_lahettaja"
                  name="halytys_ilmoitus_lahettaja"
                  type="text"
                  placeholder="Jauhemaalaamo <onboarding@resend.dev>"
                  defaultValue={asetukset.halytys_ilmoitus_lahettaja ?? ""}
                />
                <p className="text-xs text-muted-foreground">
                  Tyhjänä käytetään Resendin testiosoitetta, joka lähettää vain omaan
                  Resend-tiliisi. Omaan verkkotunnukseen tarvitaan Resendissä vahvistettu domain.
                </p>
              </div>
            </div>
          </Asetuslomake>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sähköpostipalvelu</CardTitle>
          <CardDescription>
            Viestit lähetetään Resendin kautta. Luo ilmainen tili osoitteessa resend.com, tee
            API-avain ja liitä se tähän.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResendAvain asetettu={avainVastaus.data === true} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Viimeisimmät lähetykset</CardTitle>
          <CardDescription>
            Tila haetaan lähetyshetkeltä, joten vanhemmilta riveiltä se puuttuu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loki.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ei vielä lähetyksiä.</p>
          ) : (
            <ul className="grid gap-3 text-sm">
              {loki.map((rivi) => (
                <li key={rivi.luotu} className="grid gap-1 border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {rivi.tyyppi === "testi" ? "Testiviesti" : `${rivi.varien_maara} väriä`}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(rivi.luotu).toLocaleString("fi-FI")}
                    </span>
                  </div>
                  <span className="break-all text-muted-foreground">{rivi.vastaanottaja}</span>
                  <span>{rivi.tila}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
