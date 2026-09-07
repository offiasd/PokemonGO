import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { Card, CardContent } from "@/components/ui/card";

import { KulutValilehdet } from "../../valilehdet";
import { EranTila, type EranKuitti } from "./eran-tila";

/**
 * Yhden latauserän tila.
 *
 * Kahdenkymmenen kuitin latauksen jälkeen pitää nähdä mitä onnistui, joten
 * lataus ryhmitellään eräksi ja erällä on oma sivunsa. Sivu näyttää jokaisen
 * kuitin kohdalla missä luku menee - jonossa, luetaan, valmis vai virhe - ja
 * päivittyy itsestään, koska luku etenee taustalla.
 */
export default async function KuittieraSivu({ params }: { params: Promise<{ id: string }> }) {
  await vaaditaanAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: era } = await supabase
    .from("kuittierat")
    .select("id, tiedostoja, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!era) notFound();

  const { data: kuitit } = await supabase
    .from("kuitit")
    .select("id, toimittaja, paivays, loppusumma_eur, tila, poiminnan_tila, poiminnan_virhe")
    .eq("era_id", id)
    .order("created_at");

  const eranKuitit: EranKuitti[] = (kuitit ?? []).map((k) => ({
    id: k.id,
    toimittaja: k.toimittaja,
    paivays: k.paivays,
    loppusummaEur: k.loppusumma_eur,
    tila: k.tila,
    poiminnanTila: k.poiminnan_tila,
    poiminnanVirhe: k.poiminnan_virhe,
  }));

  return (
    <div className="grid gap-4">
      <KulutValilehdet />

      <Card>
        <CardContent>
          <EranTila
            eraId={era.id}
            tiedostoja={era.tiedostoja}
            luotu={era.created_at}
            kuitit={eranKuitit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
