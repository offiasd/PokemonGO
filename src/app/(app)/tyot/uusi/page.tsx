import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { TyonLomake } from "../tyon-lomake";

export default async function UusiTyoSivu() {
  await vaaditaanKayttaja();
  const supabase = await createClient();

  const [osatVastaus, varitVastaus, kategoriahintaVastaus, variKategoriaVastaus] =
    await Promise.all([
      supabase
        .from("osat")
        .select("id, nimi, merkki, malli, lakkaus_lisahinta, lakkaus_kulutus_g")
        .eq("aktiivinen", true)
        .order("nimi"),
      supabase
        .from("varit")
        .select("id, nimi, tyyppi, saldo_g, varattu_g, hintalisa_prosentti")
        .eq("aktiivinen", true)
        .order("nimi"),
      supabase
        .from("osa_kategoriahinnat")
        .select("osa_id, maali_tyyppi, hinta, arvioitu_kulutus_g, toinen_arvioitu_kulutus_g"),
      supabase.from("vari_kategoriat").select("vari_id, maali_tyyppi"),
    ]);

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
            osat={osatVastaus.data ?? []}
            varit={varitVastaus.data ?? []}
            kategoriahinnat={kategoriahintaVastaus.data ?? []}
            variKategoriat={variKategoriaVastaus.data ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
