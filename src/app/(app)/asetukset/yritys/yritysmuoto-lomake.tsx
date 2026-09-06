"use client";

import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Asetuslomake } from "../asetuslomake";

/**
 * Yritysmuoto, työntekijät ja ALV-rekisteröinti.
 *
 * Kolme asetusta, jotka ohjaavat kuittien luokittelua. Ne ovat asetuksia
 * eivätkä kovakoodattuja oletuksia, koska yrityksen tilanne muuttuu.
 */
export function YritysmuotoLomake({
  yritysmuoto: alkuYritysmuoto,
  tyontekijoita: alkuTyontekijoita,
  alvRekisterissa,
}: {
  yritysmuoto: "toiminimi" | "oy";
  tyontekijoita: boolean;
  alvRekisterissa: boolean;
}) {
  const [yritysmuoto, setYritysmuoto] = useState(alkuYritysmuoto);
  const [tyontekijoita, setTyontekijoita] = useState(alkuTyontekijoita);

  // Muutos vaikuttaa jo tallennettuihin riveihin, joten varoitus näytetään
  // ennen tallennusta eikä vasta sen jälkeen.
  const tarjoiluPoistuu =
    alkuTyontekijoita && !tyontekijoita && yritysmuoto !== "oy";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yritysmuoto ja verotus</CardTitle>
        <CardDescription>
          Nämä ohjaavat kuittien luokittelua: mitkä käyttötarkoitukset ovat valittavissa ja
          näytetäänkö ALV-tiedot.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Asetuslomake>
          {/* Piilokenttä kertoo palvelimelle että kytkimet olivat tällä
              lomakkeella: pois päältä oleva kytkin ei lähetä mitään. */}
          <input type="hidden" name="yritysmuoto_lomakkeella" value="1" />

          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="yritysmuoto">Yritysmuoto</Label>
            <Select
              name="yritysmuoto"
              value={yritysmuoto}
              onValueChange={(v) => setYritysmuoto(v as "toiminimi" | "oy")}
            >
              <SelectTrigger id="yritysmuoto" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toiminimi">Toiminimi</SelectItem>
                <SelectItem value="oy">Osakeyhtiö</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="tyontekijoita"
              name="tyontekijoita"
              checked={tyontekijoita}
              onCheckedChange={setTyontekijoita}
            />
            <div className="grid gap-1">
              <Label htmlFor="tyontekijoita" className="font-normal">
                Yrityksellä on työntekijöitä
              </Label>
              <p className="text-xs text-muted-foreground">
                Vasta työntekijöiden kanssa henkilökunnan tarjoilu on mahdollinen
                käyttötarkoitus. Toiminimiyrittäjä ei ole oman itsensä työnantaja: omat
                työpäivän ateriat ovat elantomenoja ja rahan ottaminen omaan käyttöön
                yksityisotto.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="alv_rekisterissa"
              name="alv_rekisterissa"
              defaultChecked={alvRekisterissa}
            />
            <div className="grid gap-1">
              <Label htmlFor="alv_rekisterissa" className="font-normal">
                Yritys on ALV-rekisterissä
              </Label>
              <p className="text-xs text-muted-foreground">
                Vaikuttaa vain siihen näytetäänkö ALV-sarakkeet. Tiedot poimitaan ja
                tallennetaan joka tapauksessa: täsmäytys nojaa niihin, ja rekisteröitymisen
                tullessa ajankohtaiseksi historia on valmiina.
              </p>
            </div>
          </div>

          {tarjoiluPoistuu && (
            <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
              Henkilökunnan tarjoiluksi merkityt kuittirivit palautuvat yksityisotoiksi, kun
              tallennat: luokkaa ei enää ole olemassa.
            </p>
          )}
        </Asetuslomake>
      </CardContent>
    </Card>
  );
}
