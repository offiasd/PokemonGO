import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { muotoileEuro } from "@/lib/vakiot";
import { ALV_REKISTEROINNIN_RAJA_EUR } from "@/lib/kulut";

import { Asetuslomake } from "../asetuslomake";
import { YritysmuotoLomake } from "./yritysmuoto-lomake";

export default async function YritysSivu() {
  await vaaditaanAdmin();
  const asetukset = await haeAsetukset();
  const supabase = await createClient();

  // Liikevaihto kuluvalta tilikaudelta. Tilikausi on kalenterivuosi.
  const vuosi = new Date().getUTCFullYear();
  const { data: tyot } = await supabase
    .from("tyojen_talous")
    .select("loppusumma_eur")
    .gte("ajankohta", `${vuosi}-01-01T00:00:00Z`)
    .lt("ajankohta", `${vuosi + 1}-01-01T00:00:00Z`);
  const liikevaihto = (tyot ?? []).reduce((summa, t) => summa + t.loppusumma_eur, 0);
  const osuusRajasta = Math.min(1, liikevaihto / ALV_REKISTEROINNIN_RAJA_EUR);

  return (
    <>
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

      <YritysmuotoLomake
        yritysmuoto={asetukset.yritysmuoto}
        tyontekijoita={asetukset.tyontekijoita}
        alvRekisterissa={asetukset.alv_rekisterissa}
      />

      <Card>
        <CardHeader>
          <CardTitle>Liikevaihto {vuosi}</CardTitle>
          <CardDescription>
            Kuluvan tilikauden laskutus suhteessa {muotoileEuro(ALV_REKISTEROINNIN_RAJA_EUR)}{" "}
            rajaan, jonka ylittyessä ALV-rekisteröinti tulee pakolliseksi.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold tabular-nums">
              {muotoileEuro(liikevaihto)}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              / {muotoileEuro(ALV_REKISTEROINNIN_RAJA_EUR)}
            </span>
          </div>
          <Progress value={osuusRajasta * 100} />
          <p className="text-xs text-muted-foreground">
            Luku perustuu valmistuneisiin töihin. Arkistoidut työt ovat mukana.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
