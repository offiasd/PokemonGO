import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SaldoPalkki } from "@/components/saldo-palkki";
import { muotoileGrammat } from "@/lib/vakiot";

export default async function HalytyksetSivu() {
  await vaaditaanKayttaja();
  const supabase = await createClient();

  const { data: halytykset } = await supabase
    .from("varit_halytykset")
    .select("*")
    .order("saldo_g", { ascending: true });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Värivarastohälytykset</h1>
        <p className="text-muted-foreground">
          Värit joiden saldo on hälytysrajalla tai sen alle (globaali oletus tai värikohtainen
          ylikirjoitus).
        </p>
      </div>

      {(halytykset ?? []).length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <AlertTriangle className="size-5" />
            Ei hälytyksiä juuri nyt - kaikki värisaldot ovat riittävät.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(halytykset ?? []).map((vari) => (
          <Link key={vari.id} href={`/varit/${vari.id}`}>
            <Card className="border-destructive/30 transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {vari.nimi}
                  <AlertTriangle className="size-4 text-warning" />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo</span>
                  <span className="font-medium">{muotoileGrammat(vari.saldo_g)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Hälytysraja</span>
                  <span>{muotoileGrammat(vari.efektiivinen_halytysraja_g)}</span>
                </div>
                <SaldoPalkki saldoG={vari.saldo_g} halytysrajaG={vari.efektiivinen_halytysraja_g} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
