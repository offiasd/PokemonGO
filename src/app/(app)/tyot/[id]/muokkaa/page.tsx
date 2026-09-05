import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { osanKateprosentit } from "@/lib/hinnat";
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
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const { data: tyo } = await supabase
    .from("tyot")
    .select("id, asiakas, tila, alennus_prosentti, aloitti_id")
    .eq("id", id)
    .single();
  if (!tyo) notFound();
  // Valmiin työn rivit on jo kulutettu varastosta, joten niitä ei muokata.
  if (tyo.tila === "valmis") redirect("/tyot");
  // Kesken oleva työ kuuluu sille joka sen nappasi, ja vastaanotettu adminille.
  const saaMuokata =
    kayttaja.role === "admin" ||
    (tyo.tila === "vaiheessa" && tyo.aloitti_id === kayttaja.id);
  if (!saaMuokata) redirect("/tyot");

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

  // Rivin kolmas ja sitä seuraavat värit haetaan erikseen: ne ovat omassa
  // taulussaan, koska määrä ei ole rajattu.
  const { data: lisavarit } = await supabase
    .from("tyon_rivin_lisavarit")
    .select("rivi_id, vari_id, arvioitu_kulutus_g")
    .in("rivi_id", (rivitVastaus.data ?? []).map((r) => r.id))
    .order("jarjestys");

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
    custom: rivi.custom,
    kommentti: rivi.kommentti,
    lisavarit: (lisavarit ?? [])
      .filter((l) => l.rivi_id === rivi.id)
      .map((l) => ({
        variId: l.vari_id,
        variNimi: varinNimi(l.vari_id) ?? "Tuntematon väri",
        arvioituKulutusG: l.arvioitu_kulutus_g,
      })),
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
            oletusPohjavariId={asetukset.oletus_pohjavari_id}
            oletusLakkaId={asetukset.oletus_lakka_id}
            muokattavaTyo={{
              id: tyo.id,
              asiakas: tyo.asiakas,
              alennusProsentti: tyo.alennus_prosentti,
              rivit: alkuRivit,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
