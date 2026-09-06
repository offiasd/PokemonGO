import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Asetuslomake } from "../asetuslomake";
import { VarastoYhteenveto } from "../varasto-yhteenveto";

export default async function VarastoSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();
  const [asetukset, varitVastaus] = await Promise.all([
    haeAsetukset(),
    // Varaston arvo lasketaan JS:ssä asetusten arvoilla, joten haetaan
    // hinnanlaskennan tarvitsemat sarakkeet eikä valmista summaa.
    supabase
      .from("varit")
      .select(
        "saldo_g, ostohinta_per_kg, alkupera, tullimaksu_prosentti, alv_prosentti, toimituskulu_per_kg"
      )
      .eq("aktiivinen", true),
  ]);

  return (
    <>
      <VarastoYhteenveto varit={varitVastaus.data ?? []} asetukset={asetukset} />

      <Card>
        <CardHeader>
          <CardTitle>Saldon rajat</CardTitle>
          <CardDescription>
            Väri merkitään vähissä oleviin, kun saldo alittaa hälytysrajan. Täysiraja on
            saldopalkin asteikon yläpää: taso jolla väri katsotaan täydeksi. Värikohtaiset rajat
            ohittavat nämä oletukset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Asetuslomake>
            <div className="grid gap-4 sm:max-w-lg sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="oletus_halytysraja_g">Oletushälytysraja (g)</Label>
                <Input
                  id="oletus_halytysraja_g"
                  name="oletus_halytysraja_g"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={asetukset.oletus_halytysraja_g}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="oletus_taysiraja_g">Oletustäysiraja (g)</Label>
                <Input
                  id="oletus_taysiraja_g"
                  name="oletus_taysiraja_g"
                  type="number"
                  step="1"
                  min="1"
                  defaultValue={asetukset.oletus_taysiraja_g}
                />
                <p className="text-xs text-muted-foreground">
                  Vaikuttaa vain saldopalkin asteikkoon, ei hälytyksiin.
                </p>
              </div>
            </div>
          </Asetuslomake>
        </CardContent>
      </Card>
    </>
  );
}
