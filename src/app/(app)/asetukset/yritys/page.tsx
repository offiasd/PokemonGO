import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Asetuslomake } from "../asetuslomake";

export default async function YritysSivu() {
  await vaaditaanAdmin();
  const asetukset = await haeAsetukset();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yrityksen tiedot</CardTitle>
        <CardDescription>
          Toimitusosoite näkyy värien tilausohjeissa, kun jauhetta tilataan myyjältä.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Asetuslomake>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="yrityksen_osoite">Toimitusosoite</Label>
            <Textarea
              id="yrityksen_osoite"
              name="yrityksen_osoite"
              rows={4}
              defaultValue={asetukset.yrityksen_osoite ?? ""}
            />
          </div>
        </Asetuslomake>
      </CardContent>
    </Card>
  );
}
