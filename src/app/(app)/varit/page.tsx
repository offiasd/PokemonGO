import Link from "next/link";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaldoPalkki } from "@/components/saldo-palkki";
import { muotoileEuro, muotoileGrammat } from "@/lib/vakiot";

import { VarienSuodattimet } from "./varien-suodattimet";

export default async function VaritSivu({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; naytaPoistetut?: string }>;
}) {
  const { q, naytaPoistetut } = await searchParams;
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const naytaHinnat = kayttaja.role === "admin" || asetukset.nayta_hinnat_maalaajalle;

  let kysely = supabase
    .from("varit")
    .select("*")
    .order("nimi", { ascending: true });

  if (!(naytaPoistetut === "1" && kayttaja.role === "admin")) {
    kysely = kysely.eq("aktiivinen", true);
  }
  if (q) {
    kysely = kysely.or(`nimi.ilike.%${q}%,valmistaja.ilike.%${q}%`);
  }

  const { data: varit } = await kysely;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Värit</h1>
          <p className="text-muted-foreground">Värivaraston hallinta ja saldot.</p>
        </div>
        {kayttaja.role === "admin" && (
          <Button asChild>
            <Link href="/varit/uusi">
              <Plus className="size-4" />
              Lisää väri
            </Link>
          </Button>
        )}
      </div>

      <VarienSuodattimet naytaPoistetutValinta={kayttaja.role === "admin"} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(varit ?? []).map((vari) => (
          <Link key={vari.id} href={`/varit/${vari.id}`}>
            <Card
              className={
                !vari.aktiivinen ? "opacity-60" : "transition-shadow hover:shadow-md"
              }
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{vari.nimi}</CardTitle>
                    <CardDescription>{vari.valmistaja ?? "Valmistaja tuntematon"}</CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline">{vari.alkupera}</Badge>
                    {!vari.aktiivinen && <Badge variant="secondary">Poistettu</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Saldo</span>
                    <span className="font-medium">{muotoileGrammat(vari.saldo_g)}</span>
                  </div>
                  <SaldoPalkki
                    saldoG={vari.saldo_g}
                    halytysrajaG={vari.halytysraja_g ?? asetukset.oletus_halytysraja_g}
                  />
                </div>
                {naytaHinnat && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ostohinta</span>
                    <span className="font-medium">{muotoileEuro(vari.ostohinta_per_kg)}/kg</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
        {(varit ?? []).length === 0 && (
          <p className="text-muted-foreground">Ei värejä hakuehdoilla.</p>
        )}
      </div>
    </div>
  );
}
