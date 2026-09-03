import Link from "next/link";
import { Pencil, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAjoneuvotyypit } from "@/lib/supabase/ajoneuvotyypit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ajoneuvotyypinNimi,
  muotoileEuro,
  muotoileProsentti,
  peruutuksenSyynNimi,
} from "@/lib/vakiot";
import type { Database, ToinenVariRooli } from "@/lib/supabase/database.types";

import { MerkitseValmiiksi } from "./merkitse-valmiiksi";
import { PeruTyo } from "./peru-tyo";
import { ValmiinTyonToiminnot } from "./valmiin-tyon-toiminnot";

type TyonRiviRow = Database["public"]["Tables"]["tyon_rivit"]["Row"];

const ROOLIN_NIMI: Record<ToinenVariRooli, string> = {
  pohjavari: "Pohjaväri",
  lakka: "Lakka",
};

/**
 * Työn loppusumma. Alennusrivi näytetään vain kun alennus on annettu, jotta
 * tavallinen työ ei saa turhaa "Alennus 0 %" -riviä.
 */
function Summat({
  tyo,
  summat,
}: {
  tyo: { alennus_prosentti: number };
  summat: { valisumma: number; alennusEur: number; loppusumma: number };
}) {
  return (
    <div className="grid gap-1 border-t pt-2 text-sm">
      {tyo.alennus_prosentti > 0 && (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Välisumma</span>
            <span>{muotoileEuro(summat.valisumma)}</span>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Alennus {muotoileProsentti(tyo.alennus_prosentti)}</span>
            <span>-{muotoileEuro(summat.alennusEur)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between gap-4 font-medium">
        <span>Yhteensä</span>
        <span>{muotoileEuro(summat.loppusumma)}</span>
      </div>
    </div>
  );
}

export default async function TyotSivu() {
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const ajoneuvotyypit = await haeAjoneuvotyypit();

  const [tyotVastaus, profiilitVastaus, peruutuksetVastaus, arkistoVastaus, arkistoRivitVastaus] =
    await Promise.all([
      supabase.from("tyot").select("*").order("aloitettu", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("tyon_peruutukset").select("*").order("peruttu", { ascending: false }),
      supabase.from("arkistoidut_tyot").select("*").order("valmistunut", { ascending: false }),
      supabase.from("arkistoidut_tyon_rivit").select("*"),
    ]);

  const tyot = tyotVastaus.data ?? [];
  const profiilit = profiilitVastaus.data ?? [];
  const peruutukset = peruutuksetVastaus.data ?? [];
  const arkistoidut = arkistoVastaus.data ?? [];
  const arkistoRivit = arkistoRivitVastaus.data ?? [];
  const tyoIdt = tyot.map((t) => t.id);

  const [rivitVastaus, osatVastaus, varitVastaus] = await Promise.all([
    tyoIdt.length > 0
      ? supabase.from("tyon_rivit").select("*").in("tyo_id", tyoIdt)
      : Promise.resolve({ data: [] as TyonRiviRow[] }),
    supabase.from("osat").select("id, nimi, ajoneuvotyyppi"),
    supabase.from("varit").select("id, nimi"),
  ]);

  const rivit = rivitVastaus.data ?? [];
  const osat = osatVastaus.data ?? [];
  const varit = varitVastaus.data ?? [];

  const profiiliNimi = (id: string | null) =>
    profiilit.find((p) => p.id === id)?.full_name ?? "-";
  const osaNimi = (id: string) => osat.find((o) => o.id === id)?.nimi ?? "Tuntematon osa";
  const osanAjoneuvotyyppi = (id: string) => {
    const tyyppi = osat.find((o) => o.id === id)?.ajoneuvotyyppi;
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

  const arkistonRivit = (tyoId: string) => arkistoRivit.filter((r) => r.tyo_id === tyoId);
  const arkistonHinta = (tyo: { id: string; alennus_prosentti: number }) => {
    const valisumma = arkistonRivit(tyo.id).reduce(
      (s, r) => s + r.yksikkohinta_eur * r.kappalemaara,
      0
    );
    const alennusEur = Math.round(valisumma * (tyo.alennus_prosentti / 100) * 100) / 100;
    return { valisumma, alennusEur, loppusumma: Math.round((valisumma - alennusEur) * 100) / 100 };
  };

  const keskenerraiset = tyot.filter((t) => t.tila === "vaiheessa");
  const valmistuneet = tyot.filter((t) => t.tila === "valmis");

  function riviteksti(rivi: TyonRiviRow) {
    let teksti = `${osaNimi(rivi.osa_id)} - ${variNimi(rivi.vari_id)}`;
    if (rivi.toinen_vari_id && rivi.toinen_vari_rooli) {
      teksti += ` + ${ROOLIN_NIMI[rivi.toinen_vari_rooli]}: ${variNimi(rivi.toinen_vari_id)}`;
    }
    return teksti;
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Työt</h1>
          <p className="text-muted-foreground">
            Kokoa osat ja värit työksi - maali varataan aloitettaessa ja kuluu oikeasti kun työ
            merkitään valmiiksi.
          </p>
        </div>
        <Button asChild>
          <Link href="/tyot/uusi">
            <Plus className="size-4" />
            Uusi työ
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="keskenerainen" className="min-w-0">
        {/* Kolme välilehteä lukumäärineen vaativat noin 345 px, mikä venytti
            koko sivun 320 px:n näytöllä gridin min-width: auto -säännön kautta.
            w-full pitää listan sarakkeen levyisenä ja rivitys näyttää kaikki
            välilehdet myös kapeimmalla puhelimella - vaakavieritys jättäisi
            viimeisen piiloon. */}
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="keskenerainen">Keskeneräiset ({keskenerraiset.length})</TabsTrigger>
          <TabsTrigger value="valmis">Valmistuneet ({valmistuneet.length})</TabsTrigger>
          <TabsTrigger value="peruttu">Perutut ({peruutukset.length})</TabsTrigger>
          <TabsTrigger value="arkisto">Arkistoidut ({arkistoidut.length})</TabsTrigger>
        </TabsList>

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
                      {new Date(tyo.aloitettu).toLocaleString("fi-FI")}
                    </p>
                  </div>
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
                        osaNimi: osaNimi(r.osa_id),
                        variNimi: variNimi(r.vari_id),
                        arvioituKulutusG: r.arvioitu_kulutus_g,
                        toinenVariNimi: r.toinen_vari_id ? variNimi(r.toinen_vari_id) : null,
                        toinenVariRooli: r.toinen_vari_rooli,
                        toinenArvioituKulutusG: r.toinen_arvioitu_kulutus_g,
                      }))}
                    />
                  </div>
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
                  {new Date(tyo.aloitettu).toLocaleString("fi-FI")}
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
                        {osaNimi(rivi.osa_id)}
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

        <TabsContent value="peruttu" className="grid gap-3">
          {peruutukset.length === 0 && <p className="text-muted-foreground">Ei peruttuja töitä.</p>}
          {peruutukset.map((peruutus) => (
            <Card key={peruutus.id}>
              <CardHeader className="gap-1 space-y-0">
                <CardTitle className="text-base">
                  {peruutus.asiakas ?? "Ei asiakastietoa"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Perui {profiiliNimi(peruutus.perui_id)} -{" "}
                  {new Date(peruutus.peruttu).toLocaleString("fi-FI")}
                </p>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Syy: </span>
                  {peruutuksenSyynNimi(peruutus.syy)}
                </p>
                {peruutus.tarkennus && <p className="break-words">{peruutus.tarkennus}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Arkisto on lukunäkymä: työ on tehty ja maali kulutettu, joten
            saldoihin ei enää kosketa eikä työtä voi muokata. */}
        <TabsContent value="arkisto" className="grid gap-3">
          {arkistoidut.length === 0 && (
            <p className="text-muted-foreground">
              Ei arkistoituja töitä. Valmiit työt arkistoituvat itsestään 12 kuukauden kuluttua
              valmistumisesta.
            </p>
          )}
          {arkistoidut.map((tyo) => {
            const summat = arkistonHinta(tyo);
            return (
              <Card key={tyo.id}>
                <CardHeader className="gap-1 space-y-0">
                  <CardTitle className="text-base">{tyo.asiakas ?? "Ei asiakastietoa"}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Valmistui {profiiliNimi(tyo.valmistui_id)} -{" "}
                    {tyo.valmistunut ? new Date(tyo.valmistunut).toLocaleString("fi-FI") : "-"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Arkistoitu {new Date(tyo.arkistoitu).toLocaleString("fi-FI")}
                    {tyo.automaattinen ? " (automaattisesti)" : ` - ${profiiliNimi(tyo.arkistoi_id)}`}
                  </p>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <ul className="grid gap-1 text-sm">
                    {arkistonRivit(tyo.id).map((rivi) => (
                      <li key={rivi.id} className="flex justify-between gap-4">
                        <span className="min-w-0 break-words">
                          {osaNimi(rivi.osa_id)} - {variNimi(rivi.vari_id)}
                          {rivi.toinen_vari_id && rivi.toinen_vari_rooli && (
                            <> + {ROOLIN_NIMI[rivi.toinen_vari_rooli]}: {variNimi(rivi.toinen_vari_id)}</>
                          )}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {muotoileEuro(rivi.yksikkohinta_eur * rivi.kappalemaara)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Summat tyo={tyo} summat={summat} />
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
