import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Kaksivaiheinen } from "./kaksivaiheinen";
import { SalasananVaihto } from "./salasanan-vaihto";

export default async function SuojausSivu() {
  const kayttaja = await vaaditaanKayttaja();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Salasana</CardTitle>
          <CardDescription>
            Vaihtaminen vaatii nykyisen salasanan, joten auki jäänyt istunto ei riitä.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SalasananVaihto sahkoposti={kayttaja.email ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kaksivaiheinen tunnistus</CardTitle>
          <CardDescription>
            Kertakoodi tunnistussovelluksesta salasanan lisäksi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Kaksivaiheinen />
        </CardContent>
      </Card>
    </>
  );
}
