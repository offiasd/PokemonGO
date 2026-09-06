import Link from "next/link";
import { Clock, History, Layers, Lock, Pencil, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { haeAjoneuvotyypit } from "@/lib/supabase/ajoneuvotyypit";
import { KiireellisyysTapla } from "@/components/kiireellisyys-tapla";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ajoneuvotyypinNimi,
  laskeTyoaikaMin,
  muotoileEuro,
  muotoileGrammat,
  muotoileKesto,
  odotusPaivat,
} from "@/lib/vakiot";
import type { Database, ToinenVariRooli, TyoVaihe } from "@/lib/supabase/database.types";

import { AloitaTyo } from "./aloita-tyo";
import { MerkitseValmiiksi } from "./merkitse-valmiiksi";
import { Summat } from "./summat";
import { PeruTyo } from "./peru-tyo";
import { ValmiinTyonToiminnot } from "./valmiin-tyon-toiminnot";

type TyonRiviRow = Database["public"]["Tables"]["tyon_rivit"]["Row"];

const ROOLIN_NIMI: Record<ToinenVariRooli, string> = {
  pohjavari: "Pohjaväri",
  lakka: "Lakka",
};

export default async function TyotSivu() {
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const [ajoneuvotyypit, asetukset] = await Promise.all([haeAjoneuvotyypit(), haeAsetukset()]);

  const [tyotVastaus, profiilitVastaus] = await Promise.all([
    supabase.from("tyot").select("*").order("aloitettu", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const tyot = tyotVastaus.data ?? [];
  const profiilit = profiilitVastaus.data ?? [];
  const tyoIdt = tyot.map((t) => t.id);

  const [rivitVastaus, osatVastaus, varitVastaus, tyovaiheetVastaus] = await Promise.all([
    tyoIdt.length > 0
      ? supabase.from("tyon_rivit").select("*").in("tyo_id", tyoIdt)
      : Promise.resolve({ data: [] as TyonRiviRow[] }),
    supabase.from("osat").select("id, nimi, ajoneuvotyyppi"),
    supabase.from("varit").select("id, nimi"),
    supabase
      .from("osa_tyovaiheet")
      .select("osa_id, vaihe, arvioitu_kesto_min")
      .eq("tarvitaan", true),
  ]);

  const rivit = rivitVastaus.data ?? [];

  // Custom-työn kolmas ja sitä seuraavat värit ovat omassa taulussaan, koska
  // niiden määrää ei ole rajattu.
  const { data: lisavaritData } =
    rivit.length > 0
      ? await supabase
          .from("tyon_rivin_lisavarit")
          .select("rivi_id, vari_id")
          .in("rivi_id", rivit.map((r) => r.id))
          .order("jarjestys")
      : { data: [] };
  const lisavarit = lisavaritData ?? [];
  const osat = osatVastaus.data ?? [];
  const varit = varitVastaus.data ?? [];
  const tyovaiheet = tyovaiheetVastaus.data ?? [];

  // Arvioitu työaika kootaan osan työvaiheista: maalaus ja teippaus tehdään
  // jokaiselle värikerrokselle erikseen, joten kaksivärinen rivi maksaa
  // enemmän aikaa kuin yksivärinen.
  // Kertakohteella (osa_id null) ei ole työvaiheita, joten sen arvioitu
  // työaika on nolla - vaiheet ovat nimenomaan osalle määriteltyä tietoa.
  const osanVaiheet = (osaId: string | null) =>
    tyovaiheet.filter((v) => osaId !== null && v.osa_id === osaId) as {
      vaihe: TyoVaihe;
      arvioitu_kesto_min: number;
    }[];
  const rivinTyoaikaMin = (rivi: TyonRiviRow) =>
    laskeTyoaikaMin(osanVaiheet(rivi.osa_id), rivi.toinen_vari_id ? 2 : 1) * rivi.kappalemaara;

  const profiiliNimi = (id: string | null) =>
    profiilit.find((p) => p.id === id)?.full_name ?? "-";
  // Rivillä on joko osa tai oma kuvaus: kertaluontoisen kohteen nimi on
  // rivillä itsellään, koska osaluetteloon ei tallenneta mitään.
  const rivinNimi = (rivi: { osa_id: string | null; oma_kuvaus: string | null }) =>
    rivi.osa_id
      ? (osat.find((o) => o.id === rivi.osa_id)?.nimi ?? "Tuntematon osa")
      : (rivi.oma_kuvaus ?? "Tuntematon kohde");
  const osanAjoneuvotyyppi = (id: string | null) => {
    const tyyppi = id ? osat.find((o) => o.id === id)?.ajoneuvotyyppi : null;
    return tyyppi ? ajoneuvotyypinNimi(tyyppi, ajoneuvotyypit) : null;
  };
  const variNimi = (id: string) => varit.find((v) => v.id === id)?.nimi ?? "Tuntematon väri";

  const rivitTyolle = (tyoId: string) => rivit.filter((r) => r.tyo_id === tyoId);

  // Alennus on työn oma prosentti, ei riveille hierottu hinta, joten se
  // lasketaan vasta näytettäessä rivien summasta.
  function tyonSummat(tyo: { id: string; alennus_prosentti: number }) {
    const valisumma = rivitTyolle(tyo.id).reduce(
      (s, r) => s + r.yksikkohinta_eur * r.kappalemaara,
      0
    );
    const alennusEur = Math.round(valisumma * (tyo.alennus_prosentti / 100) * 100) / 100;
    return {
      valisumma,
      alennusEur,
      loppusumma: Math.round((valisumma - alennusEur) * 100) / 100,
    };
  }

  const vastaanotetut = tyot
    .filter((t) => t.tila === "vastaanotettu")
    // Vanhin ensin: pisimpään odottanut työ on kiireellisin.
    .sort((a, b) => new Date(a.aloitettu).getTime() - new Date(b.aloitettu).getTime());
  const keskenerraiset = tyot.filter((t) => t.tila === "vaiheessa");
  const valmistuneet = tyot.filter((t) => t.tila === "valmis");

  const tyonTyoaikaMin = (tyoId: string) =>
    rivitTyolle(tyoId).reduce((summa, r) => summa + rivinTyoaikaMin(r), 0);

  // Maalausjono väreittäin: laitteistossa on kerrallaan vain yksi väri, joten
  // saman värin osat kannattaa ajaa peräkkäin. Mukaan tulevat sekä
  // vastaanotetut että keskeneräiset työt, ja myös rivin toinen väri
  // (pohjaväri tai lakka) on oma ajonsa.
  const jonoKartta = new Map<
    string,
    { variId: string; osia: number; grammat: number; vanhin: string }
  >();
  for (const tyo of [...vastaanotetut, ...keskenerraiset]) {
    for (const rivi of rivitTyolle(tyo.id)) {
      const osuudet: [string | null, number][] = [
        [rivi.vari_id, rivi.arvioitu_kulutus_g],
        [rivi.toinen_vari_id, rivi.toinen_arvioitu_kulutus_g ?? 0],
      ];
      for (const [variId, grammat] of osuudet) {
        if (!variId) continue;
        const nykyinen = jonoKartta.get(variId) ?? {
          variId,
          osia: 0,
          grammat: 0,
          vanhin: tyo.aloitettu,
        };
        nykyinen.osia += rivi.kappalemaara;
        nykyinen.grammat += grammat * rivi.kappalemaara;
        if (new Date(tyo.aloitettu) < new Date(nykyinen.vanhin)) nykyinen.vanhin = tyo.aloitettu;
        jonoKartta.set(variId, nykyinen);
      }
    }
  }
  const maalausjono = [...jonoKartta.values()].sort(
    (a, b) => new Date(a.vanhin).getTime() - new Date(b.vanhin).getTime()
  );

  // Kesken oleva työ kuuluu sille joka sen nappasi. Admin näkee ja hallinnoi
  // kaikkia töitä, maalaaja vain omaansa - napit piilotetaan sen mukaan, ja
  // sama sääntö on rivitason käytännöissä kannassa.
  const onAdmin = kayttaja.role === "admin";
  const saaKasitella = (tyo: { tila: string; aloitti_id: string | null }) =>
    onAdmin || (tyo.tila === "vaiheessa" && tyo.aloitti_id === kayttaja.id);

  function riviteksti(rivi: TyonRiviRow) {
    let teksti = `${rivinNimi(rivi)} - ${variNimi(rivi.vari_id)}`;
    if (rivi.toinen_vari_id && rivi.toinen_vari_rooli) {
      teksti += ` + ${ROOLIN_NIMI[rivi.toinen_vari_rooli]}: ${variNimi(rivi.toinen_vari_id)}`;
    }
    // Custom-työn lisävärit ja selite kertovat mitä rivillä oikeasti tehdään -
    // pelkkä pääväri antaisi monivärityöstä väärän kuvan.
    const lisat = lisavarit.filter((l) => l.rivi_id === rivi.id);
    if (lisat.length > 0) {
      teksti += ` + ${lisat.map((l) => variNimi(l.vari_id)).join(" + ")}`;
    }
    if (rivi.kommentti) {
      teksti += ` (${rivi.kommentti})`;
    }
    return teksti;
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        {/* Historia on sivun yläkulmassa: perutut ja arkistoidut ovat harvoin
            tarvittavaa taustatietoa, joten se ei kilpaile Uusi työ -napin
            kanssa vaan pysyy poissa tieltä. */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Työt</h1>
          <Button asChild variant="ghost" size="sm" className="-mt-1 shrink-0">
            <Link href="/tyot/historia">
              <History className="size-4" />
              Historia
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground">
          {onAdmin
            ? "Kokoa osat ja värit työksi - maali varataan jo vastaanotettaessa ja kuluu oikeasti kun työ merkitään valmiiksi."
            : "Ota vastaanotettu työ itsellesi ja merkitse se valmiiksi kun se on maalattu."}
        </p>
        {onAdmin && (
          <div>
            <Button asChild>
              <Link href="/tyot/uusi">
                <Plus className="size-4" />
                Uusi työ
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="vastaanotettu" className="min-w-0">
        {/* Kolme välilehteä lukumäärineen vaativat noin 345 px, mikä venytti
            koko sivun 320 px:n näytöllä gridin min-width: auto -säännön kautta.
            w-full pitää listan sarakkeen levyisenä ja rivitys näyttää kaikki
            välilehdet myös kapeimmalla puhelimella - vaakavieritys jättäisi
            viimeisen piiloon. */}
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="vastaanotettu">Vastaanotetut ({vastaanotetut.length})</TabsTrigger>
          <TabsTrigger value="keskenerainen">Keskeneräiset ({keskenerraiset.length})</TabsTrigger>
          <TabsTrigger value="valmis">Valmistuneet ({valmistuneet.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="vastaanotettu" className="grid gap-4">
          {maalausjono.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="size-4" />
                  Maalausjono väreittäin
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Laitteistossa on kerrallaan yksi väri, joten saman värin osat kannattaa ajaa
                  peräkkäin. Mukana vastaanotetut ja keskeneräiset työt, kiireellisin ensin.
                </p>
              </CardHeader>
              <CardContent className="grid gap-2">
                {maalausjono.map((rivi) => (
                  <div
                    key={rivi.variId}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b pb-2 text-sm last:border-0 last:pb-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <KiireellisyysTapla
                        vastaanotettu={rivi.vanhin}
                        rajat={asetukset}
                        naytaTeksti={false}
                      />
                      <span className="min-w-0 break-words">{variNimi(rivi.variId)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {rivi.osia} {rivi.osia === 1 ? "osa" : "osaa"} -{" "}
                      {muotoileGrammat(rivi.grammat)} - odottanut{" "}
                      {odotusPaivat(rivi.vanhin)} vrk
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {vastaanotetut.length === 0 && (
            <p className="text-muted-foreground">
              {onAdmin
                ? "Ei vastaanotettuja töitä - lisää työ Uusi työ -napista."
                : "Ei vastaanotettuja töitä juuri nyt."}
            </p>
          )}
          {vastaanotetut.map((tyo) => {
            const tyonRivit = rivitTyolle(tyo.id);
            return (
              <Card key={tyo.id}>
                <CardHeader className="gap-2 space-y-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">
                        {tyo.asiakas ?? "Ei asiakastietoa"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Vastaanotti {profiiliNimi(tyo.vastaanotti_id ?? tyo.aloitti_id)} -{" "}
                        {new Date(tyo.aloitettu).toLocaleString("fi-FI")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {onAdmin && (
                        <>
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/tyot/${tyo.id}/muokkaa`}>
                              <Pencil className="size-4" />
                              Muokkaa
                            </Link>
                          </Button>
                          <PeruTyo tyoId={tyo.id} />
                        </>
                      )}
                      <AloitaTyo tyoId={tyo.id} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <KiireellisyysTapla vastaanotettu={tyo.aloitettu} rajat={asetukset} />
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="size-4" />
                      Arvioitu työaika {muotoileKesto(tyonTyoaikaMin(tyo.id))}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <ul className="grid gap-1 text-sm">
                    {tyonRivit.map((rivi) => (
                      <li key={rivi.id} className="flex justify-between gap-4">
                        <span className="min-w-0 break-words">{riviteksti(rivi)}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {muotoileEuro(rivi.yksikkohinta_eur * rivi.kappalemaara)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Summat tyo={tyo} summat={tyonSummat(tyo)} />
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="keskenerainen" className="grid gap-4">
          {keskenerraiset.length === 0 && (
            <p className="text-muted-foreground">Ei keskeneräisiä töitä.</p>
          )}
          {keskenerraiset.map((tyo) => {
            const tyonRivit = rivitTyolle(tyo.id);
            return (
              <Card key={tyo.id}>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="text-base">
                      {tyo.asiakas ?? "Ei asiakastietoa"}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Aloitti {profiiliNimi(tyo.aloitti_id)} -{" "}
                      {new Date(tyo.tyo_aloitettu ?? tyo.aloitettu).toLocaleString("fi-FI")}
                    </p>
                  </div>
                  {/* Työ on sen hallussa joka sen nappasi. Muille näytetään
                      tekijä ilman nappeja, jottei kaksi ihmistä tee samaa työtä
                      - kanta estää sen joka tapauksessa. */}
                  {saaKasitella(tyo) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/tyot/${tyo.id}/muokkaa`}>
                          <Pencil className="size-4" />
                          Muokkaa
                        </Link>
                      </Button>
                      <PeruTyo tyoId={tyo.id} />
                      <MerkitseValmiiksi
                        tyoId={tyo.id}
                        rivit={tyonRivit.map((r) => ({
                          id: r.id,
                          osaNimi: rivinNimi(r),
                          variNimi: variNimi(r.vari_id),
                          arvioituKulutusG: r.arvioitu_kulutus_g,
                          toinenVariNimi: r.toinen_vari_id ? variNimi(r.toinen_vari_id) : null,
                          toinenVariRooli: r.toinen_vari_rooli,
                          toinenArvioituKulutusG: r.toinen_arvioitu_kulutus_g,
                        }))}
                      />
                    </div>
                  ) : (
                    <Badge variant="outline" className="shrink-0 gap-1.5">
                      <Lock className="size-3" />
                      {profiiliNimi(tyo.aloitti_id)}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="grid gap-2">
                  <ul className="grid gap-1 text-sm">
                    {tyonRivit.map((rivi) => (
                      <li key={rivi.id} className="flex justify-between">
                        <span>{riviteksti(rivi)}</span>
                        <span className="text-muted-foreground">
                          {muotoileEuro(rivi.yksikkohinta_eur * rivi.kappalemaara)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Summat tyo={tyo} summat={tyonSummat(tyo)} />
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="valmis" className="grid gap-3">
          {valmistuneet.length === 0 && (
            <p className="text-muted-foreground">Ei vielä valmistuneita töitä.</p>
          )}
          {valmistuneet.map((tyo) => (
            <Card key={tyo.id}>
              <CardHeader className="gap-1 space-y-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{tyo.asiakas ?? "Ei asiakastietoa"}</CardTitle>
                  <div className="flex flex-wrap items-center gap-1">
                    <ValmiinTyonToiminnot
                      tyoId={tyo.id}
                      naytaArkistointi={kayttaja.role === "admin"}
                    />
                    {kayttaja.role === "admin" && <PeruTyo tyoId={tyo.id} valmis />}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Valmistui {profiiliNimi(tyo.valmistui_id)} -{" "}
                  {tyo.valmistunut ? new Date(tyo.valmistunut).toLocaleString("fi-FI") : "-"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Aloitti {profiiliNimi(tyo.aloitti_id)} -{" "}
                  {new Date(tyo.tyo_aloitettu ?? tyo.aloitettu).toLocaleString("fi-FI")}
                </p>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rivitTyolle(tyo.id).map((rivi) => (
                    <div
                      key={rivi.id}
                      className="flex min-w-0 flex-col gap-3 rounded-md border p-3"
                    >
                      <p className="text-center text-base font-semibold break-words">
                        {rivinNimi(rivi)}
                      </p>
                      <div className="grid gap-0.5 text-center text-sm">
                        <span className="break-words">{variNimi(rivi.vari_id)}</span>
                        {rivi.toinen_vari_id && rivi.toinen_vari_rooli && (
                          <span className="text-muted-foreground break-words">
                            {ROOLIN_NIMI[rivi.toinen_vari_rooli]}: {variNimi(rivi.toinen_vari_id)}
                          </span>
                        )}
                      </div>
                      <div className="mt-auto flex items-end justify-between gap-2">
                        <span className="min-w-0 text-xs text-muted-foreground break-words">
                          {osanAjoneuvotyyppi(rivi.osa_id) ?? "-"}
                        </span>
                        <span className="shrink-0 text-sm">
                          {muotoileEuro(rivi.yksikkohinta_eur * rivi.kappalemaara)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <Summat tyo={tyo} summat={tyonSummat(tyo)} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

      </Tabs>
    </div>
  );
}
