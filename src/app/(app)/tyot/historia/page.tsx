import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { muotoileEuro, peruutuksenSyynNimi, TOINEN_VARI_ROOLIN_NIMI } from "@/lib/vakiot";

import { Summat } from "../summat";

/**
 * Historiarivi: suljettuna pelkkä asiakas ja päivämäärä, avattuna koko työ.
 *
 * Tehty details-elementillä eikä omalla tilallaan, jotta avaus toimii ilman
 * JavaScriptiä ja rivit pysyvät palvelimella renderöitävinä.
 */
function Rivi({
  otsikko,
  aika,
  children,
}: {
  otsikko: string;
  aika: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 font-medium break-words">{otsikko}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {aika}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid gap-2 border-t p-3 text-sm">{children}</div>
    </details>
  );
}

export default async function TyonHistoriaSivu() {
  await vaaditaanKayttaja();
  const supabase = await createClient();

  const [peruutuksetVastaus, arkistoVastaus, arkistoRivitVastaus, profiilitVastaus, osatVastaus, varitVastaus] =
    await Promise.all([
      supabase.from("tyon_peruutukset").select("*").order("peruttu", { ascending: false }),
      supabase.from("arkistoidut_tyot").select("*").order("valmistunut", { ascending: false }),
      supabase.from("arkistoidut_tyon_rivit").select("*"),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("osat").select("id, nimi"),
      supabase.from("varit").select("id, nimi"),
    ]);

  const peruutukset = peruutuksetVastaus.data ?? [];
  const arkistoidut = arkistoVastaus.data ?? [];
  const arkistoRivit = arkistoRivitVastaus.data ?? [];
  const profiilit = profiilitVastaus.data ?? [];
  const osat = osatVastaus.data ?? [];
  const varit = varitVastaus.data ?? [];

  const profiiliNimi = (id: string | null) => profiilit.find((p) => p.id === id)?.full_name ?? "-";
  const osaNimi = (id: string) => osat.find((o) => o.id === id)?.nimi ?? "Tuntematon osa";
  const variNimi = (id: string) => varit.find((v) => v.id === id)?.nimi ?? "Tuntematon väri";

  const arkistonRivit = (tyoId: string) => arkistoRivit.filter((r) => r.tyo_id === tyoId);
  const arkistonHinta = (tyo: { id: string; alennus_prosentti: number }) => {
    const valisumma = arkistonRivit(tyo.id).reduce(
      (s, r) => s + r.yksikkohinta_eur * r.kappalemaara,
      0
    );
    const alennusEur = Math.round(valisumma * (tyo.alennus_prosentti / 100) * 100) / 100;
    return { valisumma, alennusEur, loppusumma: Math.round((valisumma - alennusEur) * 100) / 100 };
  };

  const paiva = (aika: string | null) =>
    aika ? new Date(aika).toLocaleDateString("fi-FI") : "-";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Historia</h1>
          <p className="text-muted-foreground">
            Perutut ja arkistoidut työt. Avaa rivi nähdäksesi mitä työhön kuului.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/tyot">
            <ArrowLeft className="size-4" />
            Takaisin töihin
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="arkisto" className="min-w-0">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="arkisto">Arkistoidut ({arkistoidut.length})</TabsTrigger>
          <TabsTrigger value="peruttu">Perutut ({peruutukset.length})</TabsTrigger>
        </TabsList>

        {/* Arkisto on lukunäkymä: työ on tehty ja maali kulutettu, joten
            saldoihin ei enää kosketa eikä työtä voi muokata. */}
        <TabsContent value="arkisto">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Arkistoidut työt</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {arkistoidut.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Ei arkistoituja töitä. Valmiit työt arkistoituvat itsestään 12 kuukauden kuluttua
                  valmistumisesta.
                </p>
              )}
              {arkistoidut.map((tyo) => (
                <Rivi
                  key={tyo.id}
                  otsikko={tyo.asiakas ?? "Ei asiakastietoa"}
                  aika={paiva(tyo.valmistunut)}
                >
                  <p className="text-muted-foreground">
                    Valmistui {profiiliNimi(tyo.valmistui_id)} -{" "}
                    {tyo.valmistunut ? new Date(tyo.valmistunut).toLocaleString("fi-FI") : "-"}
                  </p>
                  <p className="text-muted-foreground">
                    Arkistoitu {new Date(tyo.arkistoitu).toLocaleString("fi-FI")}
                    {tyo.automaattinen
                      ? " (automaattisesti)"
                      : ` - ${profiiliNimi(tyo.arkistoi_id)}`}
                  </p>
                  <ul className="grid gap-1">
                    {arkistonRivit(tyo.id).map((rivi) => (
                      <li key={rivi.id} className="flex justify-between gap-4">
                        <span className="min-w-0 break-words">
                          {osaNimi(rivi.osa_id)} - {variNimi(rivi.vari_id)}
                          {rivi.toinen_vari_id && rivi.toinen_vari_rooli && (
                            <>
                              {" "}
                              + {TOINEN_VARI_ROOLIN_NIMI[rivi.toinen_vari_rooli]}:{" "}
                              {variNimi(rivi.toinen_vari_id)}
                            </>
                          )}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {muotoileEuro(rivi.yksikkohinta_eur * rivi.kappalemaara)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Summat tyo={tyo} summat={arkistonHinta(tyo)} />
                </Rivi>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="peruttu">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perutut työt</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {peruutukset.length === 0 && (
                <p className="text-sm text-muted-foreground">Ei peruttuja töitä.</p>
              )}
              {peruutukset.map((peruutus) => (
                <Rivi
                  key={peruutus.id}
                  otsikko={peruutus.asiakas ?? "Ei asiakastietoa"}
                  aika={paiva(peruutus.peruttu)}
                >
                  <p className="text-muted-foreground">
                    Perui {profiiliNimi(peruutus.perui_id)} -{" "}
                    {new Date(peruutus.peruttu).toLocaleString("fi-FI")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Syy: </span>
                    {peruutuksenSyynNimi(peruutus.syy)}
                  </p>
                  {peruutus.tarkennus && <p className="break-words">{peruutus.tarkennus}</p>}
                </Rivi>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
