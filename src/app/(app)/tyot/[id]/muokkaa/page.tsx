import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { haeAjoneuvotyypit } from "@/lib/supabase/ajoneuvotyypit";
import { oletusKateprosentit } from "@/lib/hinnat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TyoVaihe } from "@/lib/supabase/database.types";
import { TYON_RIVI_SARAKKEET } from "@/lib/supabase/sarakkeet";

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
  const ajoneuvotyypit = await haeAjoneuvotyypit();

  const { data: tyo } = await supabase
    .from("tyot")
    .select("id, asiakas, tila, alennus_prosentti, alennus_summa_eur, aloitti_id")
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
    lisatyoVastaus,
    tyovaiheetVastaus,
    tuntiveloitusVastaus,
    muutTyotVastaus,
  ] = await Promise.all([
    supabase.from("tyon_rivit").select(TYON_RIVI_SARAKKEET).eq("tyo_id", id),
    supabase
      .from("osat")
      .select(
        "id, nimi, lisatiedot, ajoneuvotyyppi, kuva_url, kuva_x, kuva_y, kuva_zoom, lakkaus_kulutus_g"
      )
      .eq("aktiivinen", true)
      .order("nimi"),
    supabase
      .from("varit")
      .select(
        "id, nimi, alkupera, tyyppi, saldo_g, varattu_g, vaatii_lakkauksen, vaatii_pohjavarin, kiiltotaso, kuva_url"
      )
      .eq("aktiivinen", true)
      .order("nimi"),
    supabase
      .from("osa_kategoriahinnat")
      .select(
        "osa_id, maali_tyyppi, hinta, hinta_lakattu, arvioitu_kulutus_g, toinen_arvioitu_kulutus_g"
      ),
    supabase.from("vari_kategoriat").select("vari_id, maali_tyyppi"),
    // Osien rastitut lisätyöt yhdellä kutsulla: periytymissääntö pysyy
    // kannassa eikä lomake kysy samaa 34 kertaa erikseen.
    supabase.rpc("osien_lisatyot"),
    supabase
      .from("osa_tyovaiheet")
      .select("osa_id, vaihe, arvioitu_kesto_min")
      .eq("tarvitaan", true),
    supabase.from("tuntiveloitukset").select("vaihe, tuntihinta"),
    supabase
      .from("tyon_muut_tyot")
      .select("id, kuvaus, hinta_eur")
      .eq("tyo_id", id)
      .order("jarjestys"),
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
      kateprosentit: oletusKateprosentit(asetukset),
    };
  });

  // Hinnan laskenta tarvitsee värin ostohinnan ja tuntiveloitukset, joihin
  // maalaajalla ei ole pääsyä. Maalaaja voi silti muokata omaa keskeneräistä
  // työtään: hinta tulee silloin kiinteästä kategoriahinnasta tai kirjoitetaan
  // käsin.
  const laskettuHinnoittelu = kayttaja.role === "admin";

  const varitHinnoin = laskettuHinnoittelu
    ? await Promise.all(
        (varitVastaus.data ?? []).map(async (vari) => {
          const { data } = await supabase.rpc("vari_kokonaishinta", { p_vari_id: vari.id });
          return { ...vari, kokonaishinta: data ?? 0 };
        })
      )
    : (varitVastaus.data ?? []).map((vari) => ({ ...vari, kokonaishinta: 0 }));

  // Nimet haetaan erikseen: työn rivi voi viitata myös poistettuun osaan tai
  // väriin, jotka eivät ole yllä olevissa aktiivisten listoissa.
  const [kaikkiOsat, kaikkiVarit] = await Promise.all([
    supabase.from("osat").select("id, nimi"),
    supabase.from("varit").select("id, nimi"),
  ]);
  // Rivillä on joko osa tai oma kuvaus: kertakohteen nimi on rivillä itsellään.
  const rivinNimi = (osaId: string | null, omaKuvaus: string | null) =>
    osaId
      ? (kaikkiOsat.data?.find((o) => o.id === osaId)?.nimi ?? "Tuntematon osa")
      : (omaKuvaus ?? "Tuntematon kohde");
  const varinNimi = (variId: string | null) =>
    variId ? (kaikkiVarit.data?.find((v) => v.id === variId)?.nimi ?? "Tuntematon väri") : null;

  // Rivin kolmas ja sitä seuraavat värit haetaan erikseen: ne ovat omassa
  // taulussaan, koska määrä ei ole rajattu.
  const { data: lisavarit } = await supabase
    .from("tyon_rivin_lisavarit")
    .select("rivi_id, vari_id, arvioitu_kulutus_g")
    .in("rivi_id", (rivitVastaus.data ?? []).map((r) => r.id))
    .order("jarjestys");

  // Lisätyöt lukittuine arvoineen. Ajat jätetään hakematta: ne eivät ole
  // maalaajan luettavissa, ja lomake tarvitsee vain kulutuksen ja hinnan.
  // Nimi tulee katalogista, automaattiselta riviltä lisatyo_id on null.
  const { data: rivinLisatyot } = await supabase
    .from("tyon_rivin_lisatyot")
    .select("id, tyon_rivi_id, lisatyo_id, vari_id, maara, osuus_prosentti, kulutus_g, hinta_eur, automaattinen, lahde_rivi_id, lakkaus_laajuus")
    .in("tyon_rivi_id", (rivitVastaus.data ?? []).map((r) => r.id))
    .order("jarjestys");

  // Nimi tulee jo haetusta katalogista: rivillä on vain lisatyo_id.
  const lisatyonNimi = (lisatyoId: string | null, automaattinen: string | null) =>
    lisatyoId
      ? (lisatyoVastaus.data?.find((l) => l.lisatyo_id === lisatyoId)?.nimi ?? "Lisätyö")
      : automaattinen === "lakka"
        ? "Lakkaus (koko osa)"
        : "Pohjaväri";

  const alkuRivit: KoriRivi[] = (rivitVastaus.data ?? []).map((rivi, i) => ({
    avain: String(i),
    osaId: rivi.osa_id,
    omaKuvaus: rivi.oma_kuvaus,
    osaNimi: rivinNimi(rivi.osa_id, rivi.oma_kuvaus),
    variId: rivi.vari_id,
    variNimi: varinNimi(rivi.vari_id) ?? "Tuntematon väri",
    arvioituKulutusG: rivi.arvioitu_kulutus_g,
    yksikkohintaEur: rivi.yksikkohinta_eur,
    // Vanhan rivin pohjaväri ja lakka olivat työrivin omia kenttiä. Ne
    // näytetään ja tallennetaan nyt lisätyörivinä kuten uusillakin riveillä,
    // jolloin sama kerros ei ole kannassa kahdessa eri muodossa. Mitään ei
    // migroida etukäteen: muoto vaihtuu vasta kun työtä muokataan.
    toinenVariId: null,
    toinenVariNimi: null,
    toinenVariRooli: null,
    toinenArvioituKulutusG: null,
    custom: rivi.custom,
    kommentti: rivi.kommentti,
    lisavarit: (lisavarit ?? [])
      .filter((l) => l.rivi_id === rivi.id)
      .map((l) => ({
        variId: l.vari_id,
        variNimi: varinNimi(l.vari_id) ?? "Tuntematon väri",
        arvioituKulutusG: l.arvioitu_kulutus_g,
      })),
    lisatyot: [
      // Muunnettu vanha kerros ensimmäisenä: se kuuluu päävärin alle tai
      // päälle, ei lisätöiden sekaan.
      ...(rivi.toinen_vari_id && rivi.toinen_vari_rooli
        ? [
            {
              avain: `vanha-toinen-${rivi.id}`,
              lahdeAvain: null,
              lakkausLaajuus:
                rivi.toinen_vari_rooli === "lakka" ? ("koko_osa" as const) : null,
              lahdeKuvaus: null,
              lisatyoId: null,
              nimi: rivi.toinen_vari_rooli === "lakka" ? "Lakkaus" : "Pohjaväri",
              variId: rivi.toinen_vari_id,
              variNimi: varinNimi(rivi.toinen_vari_id) ?? "Tuntematon väri",
              maara: 1,
              osuusProsentti: null,
              kulutusG: rivi.toinen_arvioitu_kulutus_g ?? 0,
              // Kerros sisältyi rivin hintaan jo ennenkin: se ei saa lisätä
              // hintaa muodon vaihtuessa.
              hintaEur: 0,
              automaattinen: rivi.toinen_vari_rooli,
            },
          ]
        : []),
      ...(rivinLisatyot ?? [])
        .filter((l) => l.tyon_rivi_id === rivi.id)
        .map((l) => ({
          // Avaimena kannan id, jolloin lähdeviittaus säilyy muokkauksen yli.
          avain: l.id,
          lahdeAvain: l.lahde_rivi_id,
          lakkausLaajuus: l.lakkaus_laajuus,
          lahdeKuvaus: null,
          lisatyoId: l.lisatyo_id,
          nimi: lisatyonNimi(l.lisatyo_id, l.automaattinen),
          variId: l.vari_id ?? "",
          variNimi: varinNimi(l.vari_id) ?? "Tuntematon väri",
          maara: l.maara,
          osuusProsentti: l.osuus_prosentti,
          kulutusG: l.kulutus_g ?? 0,
          hintaEur: l.hinta_eur ?? 0,
          automaattinen: l.automaattinen,
        })),
    ],
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
            ajoneuvotyypit={ajoneuvotyypit}
            osienLisatyot={lisatyoVastaus.data ?? []}
            oletusKateprosentit={{
              eu: asetukset.kate_prosentti_oletus,
              eiEu: asetukset.kate_prosentti_ei_eu_oletus,
            }}
            oletusPohjavariId={asetukset.oletus_pohjavari_id}
            oletusLakkaId={asetukset.oletus_lakka_id}
            laskettuHinnoittelu={laskettuHinnoittelu}
            muokattavaTyo={{
              id: tyo.id,
              asiakas: tyo.asiakas,
              alennusProsentti: tyo.alennus_prosentti,
              alennusSummaEur: tyo.alennus_summa_eur,
              rivit: alkuRivit,
              muutTyot: (muutTyotVastaus.data ?? []).map((t) => ({
                avain: t.id,
                kuvaus: t.kuvaus,
                hintaEur: t.hinta_eur,
              })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
