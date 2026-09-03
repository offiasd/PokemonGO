import Link from "next/link";
import { AlertTriangle, Award, Paintbrush, Wrench } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaldoPalkki } from "@/components/saldo-palkki";

import { MaalaajanEtusivu } from "./maalaajan-etusivu";

export default async function EtusivuSivu({
  searchParams,
}: {
  searchParams: Promise<{ jakso?: string }>;
}) {
  const kayttaja = await vaaditaanKayttaja();

  // Maalaajalle etusivu on oma työnäkymä: omat työt ja vapaat työt, joista voi
  // poimia seuraavan. Adminin näkymä on varaston yleiskuva kuten ennenkin.
  if (kayttaja.role !== "admin") {
    return <MaalaajanEtusivu kayttaja={kayttaja} jakso={(await searchParams).jakso} />;
  }

  const supabase = await createClient();

  const [halytyksetVastaus, kaytetyinVastaus, variMaaraVastaus, osaMaaraVastaus] =
    await Promise.all([
      supabase
        .from("varit_halytykset")
        .select("id, nimi, saldo_g, efektiivinen_halytysraja_g")
        .order("saldo_g", { ascending: true }),
      supabase.rpc("kuukauden_kaytetyin_vari"),
      supabase.from("varit").select("id", { count: "exact", head: true }).eq("aktiivinen", true),
      supabase.from("osat").select("id", { count: "exact", head: true }).eq("aktiivinen", true),
    ]);

  const halytykset = halytyksetVastaus.data ?? [];
  const kaytetyin = kaytetyinVastaus.data?.[0] ?? null;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Etusivu</h1>
        <p className="text-muted-foreground">Yleiskuva värivarastosta ja kulutuksesta.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aktiiviset värit
            </CardTitle>
            <Paintbrush className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{variMaaraVastaus.count ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aktiiviset osat
            </CardTitle>
            <Wrench className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{osaMaaraVastaus.count ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Hälytysrajalla
            </CardTitle>
            <AlertTriangle className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{halytykset.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              Värivarastohälytykset
            </CardTitle>
            <CardDescription>Värit joiden saldo on hälytysrajalla tai sen alle.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {halytykset.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ei hälytyksiä juuri nyt - kaikki saldot ovat riittävät.
              </p>
            )}
            {halytykset.map((vari) => (
              <Link key={vari.id} href={`/varit/${vari.id}`} className="grid gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{vari.nimi}</span>
                  <span className="text-muted-foreground">
                    {vari.saldo_g.toLocaleString("fi-FI")} g / hälytys{" "}
                    {vari.efektiivinen_halytysraja_g.toLocaleString("fi-FI")} g
                  </span>
                </div>
                <SaldoPalkki saldoG={vari.saldo_g} halytysrajaG={vari.efektiivinen_halytysraja_g} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="size-4 text-primary" />
              Kuukauden käytetyin väri
            </CardTitle>
            <CardDescription>Eniten kulutettu väri kuluvana kuukautena.</CardDescription>
          </CardHeader>
          <CardContent>
            {!kaytetyin && (
              <p className="text-sm text-muted-foreground">
                Ei vielä maalaustapahtumia tältä kuukaudelta.
              </p>
            )}
            {kaytetyin && (
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold">{kaytetyin.vari_nimi}</span>
                  <Badge variant="secondary">{kaytetyin.tapahtumia} tapahtumaa</Badge>
                </div>
                <p className="text-muted-foreground">
                  Yhteensä{" "}
                  <span className="font-medium text-foreground">
                    {kaytetyin.yhteensa_kg.toLocaleString("fi-FI", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    kg
                  </span>{" "}
                  käytetty
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
