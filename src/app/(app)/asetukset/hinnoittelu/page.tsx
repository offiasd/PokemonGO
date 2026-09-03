import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { Asetuslomake } from "../asetuslomake";

export default async function HinnoitteluSivu() {
  await vaaditaanAdmin();
  const asetukset = await haeAsetukset();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Kate ja verot</CardTitle>
          <CardDescription>
            Oletukset osan suositushinnalle ja värin ostohinnan laskentaan. Väri- ja osakohtaiset
            arvot ohittavat nämä.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Asetuslomake>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="kate_prosentti_oletus">Kate-% (EU-maalit)</Label>
                <Input
                  id="kate_prosentti_oletus"
                  name="kate_prosentti_oletus"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={asetukset.kate_prosentti_oletus}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kate_prosentti_ei_eu_oletus">Kate-% (ei-EU-maalit)</Label>
                <Input
                  id="kate_prosentti_ei_eu_oletus"
                  name="kate_prosentti_ei_eu_oletus"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={asetukset.kate_prosentti_ei_eu_oletus}
                />
                <p className="text-xs text-muted-foreground">
                  Käytetään kun työn väri on EU:n ulkopuolelta (USA/muu). Jos työssä on kaksi
                  väriä ja jompikumpi on ei-EU, käytetään tätä.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tullimaksu_prosentti_oletus">Tullimaksu-% (ei-EU)</Label>
                <Input
                  id="tullimaksu_prosentti_oletus"
                  name="tullimaksu_prosentti_oletus"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={asetukset.tullimaksu_prosentti_oletus}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="alv_prosentti_oletus">ALV-% (ei-EU tuonti)</Label>
                <Input
                  id="alv_prosentti_oletus"
                  name="alv_prosentti_oletus"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={asetukset.alv_prosentti_oletus}
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-md border p-4">
              <div>
                <h2 className="font-medium">Toimituskuluarviot</h2>
                <p className="text-sm text-muted-foreground">
                  Arvioidut kulut alkuperittäin. Käytetään kun väriltä puuttuu oma ylikirjoitus.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="toimituskulu_per_kg_eu_oletus">€/kg (EU)</Label>
                  <Input
                    id="toimituskulu_per_kg_eu_oletus"
                    name="toimituskulu_per_kg_eu_oletus"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={asetukset.toimituskulu_per_kg_eu_oletus}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="toimituskulu_per_kg_usa_oletus">€/kg (USA)</Label>
                  <Input
                    id="toimituskulu_per_kg_usa_oletus"
                    name="toimituskulu_per_kg_usa_oletus"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={asetukset.toimituskulu_per_kg_usa_oletus}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="toimituskulu_per_kg_muu_oletus">€/kg (muu)</Label>
                  <Input
                    id="toimituskulu_per_kg_muu_oletus"
                    name="toimituskulu_per_kg_muu_oletus"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={asetukset.toimituskulu_per_kg_muu_oletus}
                  />
                </div>
              </div>
            </div>

            {/* Piilokenttä kertoo palvelimelle että kytkin oli tällä lomakkeella:
                pois päältä oleva kytkin ei lähetä mitään. */}
            <input type="hidden" name="nayta_hinnat_maalaajalle_lomakkeella" value="1" />
            <div className="flex items-center gap-3">
              <Switch
                id="nayta_hinnat_maalaajalle"
                name="nayta_hinnat_maalaajalle"
                defaultChecked={asetukset.nayta_hinnat_maalaajalle}
              />
              <Label htmlFor="nayta_hinnat_maalaajalle" className="font-normal">
                Näytä kilohinnat ja tuntiveloitukset myös maalaaja-roolille
              </Label>
            </div>
          </Asetuslomake>
        </CardContent>
      </Card>
    </>
  );
}
