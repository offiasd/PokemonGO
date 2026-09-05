"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface OletusvarinVaihtoehto {
  id: string;
  nimi: string;
}

/** Tyhjää arvoa ei voi antaa SelectItemille, joten "ei esitäyttöä" saa oman avaimen. */
const EI_VALINTAA = "ei";

function Valinta({
  kentta,
  otsikko,
  ohje,
  vaihtoehdot,
  alkuarvo,
}: {
  kentta: string;
  otsikko: string;
  ohje: string;
  vaihtoehdot: OletusvarinVaihtoehto[];
  alkuarvo: string | null;
}) {
  const [arvo, setArvo] = useState(alkuarvo ?? EI_VALINTAA);

  return (
    <div className="grid gap-2">
      {/* Select ei lähetä lomakekenttää, joten arvo kulkee piilokentässä -
          sama kaava kuin värilomakkeen valintakytkimillä. */}
      <input type="hidden" name={kentta} value={arvo === EI_VALINTAA ? "" : arvo} />
      <Label htmlFor={kentta}>{otsikko}</Label>
      <Select value={arvo} onValueChange={setArvo}>
        <SelectTrigger id={kentta} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EI_VALINTAA}>Ei esitäyttöä</SelectItem>
          {vaihtoehdot.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.nimi}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{ohje}</p>
    </div>
  );
}

/**
 * Monikerrostöiden esitäytetyt värit.
 *
 * Candy vaatii aina pohjavärin ja illusion aina lakan, ja käytännössä valinta
 * on joka kerta sama väri. Esitäyttö säästää sen valinnan jokaisesta työstä,
 * mutta jää ehdotukseksi: Uusi työ -lomakkeella värin voi aina vaihtaa.
 */
export function OletusvaritLomake({
  pohjavarit,
  lakat,
  oletusPohjavariId,
  oletusLakkaId,
}: {
  pohjavarit: OletusvarinVaihtoehto[];
  lakat: OletusvarinVaihtoehto[];
  oletusPohjavariId: string | null;
  oletusLakkaId: string | null;
}) {
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <Valinta
        kentta="oletus_pohjavari_id"
        otsikko="Oletuspohjaväri"
        ohje="Esitäytetään candy-töille."
        vaihtoehdot={pohjavarit}
        alkuarvo={oletusPohjavariId}
      />
      <Valinta
        kentta="oletus_lakka_id"
        otsikko="Oletuslakka"
        ohje="Esitäytetään illusion-töille ja lakattavalle metallicille."
        vaihtoehdot={lakat}
        alkuarvo={oletusLakkaId}
      />
    </div>
  );
}
