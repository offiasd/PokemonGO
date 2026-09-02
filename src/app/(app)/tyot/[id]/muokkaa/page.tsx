import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TyoVaihe } from "@/lib/supabase/database.types";

import { laskeTyokustannusKerroksittain } from "../../../osat/kustannusarvio";
import { TyonLomake, type KoriRivi } from "../../tyon-lomake";

export default async function MuokkaaTyotaSivu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const { data: tyo } = await supabase
    .from("tyot")
    .select("id, asiakas, tila")
    .eq("id", id)
    .single();
  if (!tyo) notFound();
  // Valmiin työn rivit on jo kulutettu varastosta, joten niitä ei muokata.
  if (tyo.tila === "valmis") redirect("/tyot");

  const [
    rivitVastaus,
    osatVastaus,
    varitVastaus,
    kategoriahintaVastaus,
    variKategoriaVastaus,
    tyovaiheetVastaus,
    tuntiveloitusVastaus,
  ] = await Promise.all([
    supabase.from("tyon_rivit").select("*").eq("tyo_id", id),
    supabase
      .from("osat")
      .select(
        "id, nimi, merkki, malli, lakkaus_kulutus_g, kate_prosentti, kate_kiintea, manuaalinen_hinta"
      )
      .eq("aktiivinen", true)
      .order("nimi"),
    supabase
      .from("varit")
      .select("id, nimi, tyyppi, saldo_g, varattu_g, hintalisa_prosentti, vaatii_lakkauksen")
      .eq("aktiivinen", true)
      .order("nimi"),
    supabase
      .from("osa_kategoriahinnat")
      .select("osa_id, maali_tyyppi, arvioitu_kulutus_g, toinen_arvioitu_kulutus_g"),
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

  const osat = (osatVastaus.data ?? []).map((osa) => {
    const omatVaiheet = (tyovaiheetVastaus.data ?? []).filter((v) => v.osa_id === osa.id);
    return {
      ...osa,
      tyokustannusKerroksittain: laskeTyokustannusKerroksittain(
        omatVaiheet,
        tuntiveloitukset,
        asetukset.yleinen_tuntihinta
      ),
      kateProsentti: osa.kate_prosentti ?? asetukset.kate_prosentti_oletus,
      kateKiintea: osa.kate_kiintea ?? 0,
    };
  });

  const varitHinnoin = await Promise.all(
    (varitVastaus.data ?? []).map(async (vari) => {
      const { data } = await supabase.rpc("vari_kokonaishinta", { p_vari_id: vari.id });
      return { ...vari, kokonaishinta: data ?? 0 };
    })
  );

  // Nimet haetaan erikseen: työn rivi voi viitata myös poistettuun osaan tai
  // väriin, jotka eivät ole yllä olevissa aktiivisten listoissa.
  const [kaikkiOsat, kaikkiVarit] = await Promise.all([
    supabase.from("osat").select("id, nimi"),
    supabase.from("varit").select("id, nimi"),
  ]);
  const osanNimi = (osaId: string) =>
    kaikkiOsat.data?.find((o) => o.id === osaId)?.nimi ?? "Tuntematon osa";
  const varinNimi = (variId: string | null) =>
    variId ? (kaikkiVarit.data?.find((v) => v.id === variId)?.nimi ?? "Tuntematon väri") : null;

  const alkuRivit: KoriRivi[] = (rivitVastaus.data ?? []).map((rivi, i) => ({
    avain: String(i),
    osaId: rivi.osa_id,
    osaNimi: osanNimi(rivi.osa_id),
    variId: rivi.vari_id,
    variNimi: varinNimi(rivi.vari_id) ?? "Tuntematon väri",
    arvioituKulutusG: rivi.arvioitu_kulutus_g,
    yksikkohintaEur: rivi.yksikkohinta_eur,
    toinenVariId: rivi.toinen_vari_id,
    toinenVariNimi: varinNimi(rivi.toinen_vari_id),
    toinenVariRooli: rivi.toinen_vari_rooli,
    toinenArvioituKulutusG: rivi.toinen_arvioitu_kulutus_g,
  }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Muokkaa työtä</h1>
        <p className="text-muted-foreground">
          Lisää tai poista osia ja vaihda värejä. Tallennuksen jälkeen varaukset vastaavat uusia
          rivejä: poistetun tai vaihdetun värin varaus vapautuu varastoon.
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
            muokattavaTyo={{ id: tyo.id, asiakas: tyo.asiakas, rivit: alkuRivit }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
