import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { osanKateprosentit } from "@/lib/hinnat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TyoVaihe } from "@/lib/supabase/database.types";

import { laskeTyokustannusKerroksittain } from "../../osat/kustannusarvio";
import { TyonLomake } from "../tyon-lomake";

export default async function UusiTyoSivu() {
  await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const [
    osatVastaus,
    varitVastaus,
    kategoriahintaVastaus,
    variKategoriaVastaus,
    tyovaiheetVastaus,
    tuntiveloitusVastaus,
  ] = await Promise.all([
    supabase
      .from("osat")
      .select(
        "id, nimi, lisatiedot, lakkaus_kulutus_g, kate_prosentti, kate_kiintea, manuaalinen_hinta"
      )
      .eq("aktiivinen", true)
      .order("nimi"),
    supabase
      .from("varit")
      .select(
        "id, nimi, alkupera, tyyppi, saldo_g, varattu_g, hintalisa_prosentti, vaatii_lakkauksen"
      )
      .eq("aktiivinen", true)
      .order("nimi"),
    supabase
      .from("osa_kategoriahinnat")
      .select(
        "osa_id, maali_tyyppi, hinta, hinta_lakattu, arvioitu_kulutus_g, toinen_arvioitu_kulutus_g"
      ),
    supabase.from("vari_kategoriat").select("vari_id, maali_tyyppi"),
    supabase
      .from("osa_tyovaiheet")
      .select("osa_id, vaihe, arvioitu_kesto_min")
      .eq("tarvitaan", true),
    supabase.from("tuntiveloitukset").select("vaihe, tuntihinta"),
  ]);

  const tuntiveloitukset = new Map<TyoVaihe, number>();
  for (const t of tuntiveloitusVastaus.data ?? []) {
    if (t.vaihe) tuntiveloitukset.set(t.vaihe, t.tuntihinta);
  }

  // Kiinteän kategoriahinnan puuttuessa asiakashinta lasketaan värin
  // ostohinnasta + katteesta, joten jokaiselle värille haetaan todellinen
  // kokonaishinta ja jokaiselle osalle sen työkustannus + kateasetukset.
  const osat = (osatVastaus.data ?? []).map((osa) => {
    const omatVaiheet = (tyovaiheetVastaus.data ?? []).filter((v) => v.osa_id === osa.id);
    return {
      ...osa,
      tyokustannusKerroksittain: laskeTyokustannusKerroksittain(
        omatVaiheet,
        tuntiveloitukset,
        asetukset.yleinen_tuntihinta
      ),
      kateprosentit: osanKateprosentit(osa, asetukset),
      kateKiintea: osa.kate_kiintea ?? 0,
    };
  });

  const varitHinnoin = await Promise.all(
    (varitVastaus.data ?? []).map(async (vari) => {
      const { data } = await supabase.rpc("vari_kokonaishinta", { p_vari_id: vari.id });
      return { ...vari, kokonaishinta: data ?? 0 };
    })
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Uusi työ</h1>
        <p className="text-muted-foreground">
          Kokoa työhön kuuluvat osat ja värit, ja aloita työ - maali varataan varastosta.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kori</CardTitle>
        </CardHeader>
        <CardContent>
          <TyonLomake
            osat={osat}
            varit={varitHinnoin}
            kategoriahinnat={kategoriahintaVastaus.data ?? []}
            variKategoriat={variKategoriaVastaus.data ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
