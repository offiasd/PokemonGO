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
          <CardTitle>Hälytysraja</CardTitle>
          <CardDescription>
            Väri merkitään vähissä oleviin, kun saldo alittaa rajan. Värikohtainen raja ohittaa
            tämän oletuksen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Asetuslomake>
            <div className="grid gap-2 sm:max-w-xs">
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
          </Asetuslomake>
        </CardContent>
      </Card>
    </>
  );
}
