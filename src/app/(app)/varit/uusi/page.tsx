import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { luoVari } from "../actions";
import { VariLomake } from "../vari-lomake";

export default async function UusiVariSivu() {
  await vaaditaanAdmin();
  const asetukset = await haeAsetukset();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Lisää väri</h1>
        <p className="text-muted-foreground">Uuden jauhemaalivärin tiedot.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Värin tiedot</CardTitle>
        </CardHeader>
        <CardContent>
          <VariLomake
            formAction={luoVari}
            asetuksetOletusHalytysraja={asetukset.oletus_halytysraja_g}
          />
        </CardContent>
      </Card>
    </div>
  );
}
