import Link from "next/link";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ajoneuvotyypinNimi, variTyypinNimi } from "@/lib/vakiot";
import type { AjoneuvoTyyppi, VariTyyppi } from "@/lib/supabase/database.types";

import { OsienSuodattimet } from "./osien-suodattimet";

interface Hakuparametrit {
  q?: string;
  ajoneuvotyyppi?: string;
  variTyyppi?: string;
  naytaPoistetut?: string;
}

export default async function OsatSivu({
  searchParams,
}: {
  searchParams: Promise<Hakuparametrit>;
}) {
  const { q, ajoneuvotyyppi, variTyyppi, naytaPoistetut } = await searchParams;
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();

  let kysely = supabase.from("osat").select("*").order("nimi", { ascending: true });

  if (!(naytaPoistetut === "1" && kayttaja.role === "admin")) {
    kysely = kysely.eq("aktiivinen", true);
  }
  if (ajoneuvotyyppi) {
    kysely = kysely.eq("ajoneuvotyyppi", ajoneuvotyyppi as AjoneuvoTyyppi);
  }
  if (variTyyppi) {
    kysely = kysely.eq("vari_tyyppi", variTyyppi as VariTyyppi);
  }
  if (q) {
    kysely = kysely.or(`nimi.ilike.%${q}%,merkki.ilike.%${q}%,malli.ilike.%${q}%`);
  }

  const { data: osat } = await kysely;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Osat</h1>
          <p className="text-muted-foreground">
            Maalattavat osat: autot, mopot ja moottoripyörät.
          </p>
        </div>
        {kayttaja.role === "admin" && (
          <Button asChild>
            <Link href="/osat/uusi">
              <Plus className="size-4" />
              Lisää osa
            </Link>
          </Button>
        )}
      </div>

      <OsienSuodattimet naytaPoistetutValinta={kayttaja.role === "admin"} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(osat ?? []).map((osa) => (
          <Link key={osa.id} href={`/osat/${osa.id}`}>
            <Card
              className={!osa.aktiivinen ? "opacity-60" : "transition-shadow hover:shadow-md"}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{osa.nimi}</CardTitle>
                    <CardDescription>
                      {[osa.merkki, osa.malli].filter(Boolean).join(" ") || "Merkki/malli tuntematon"}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline">{ajoneuvotyypinNimi(osa.ajoneuvotyyppi)}</Badge>
                    {!osa.aktiivinen && <Badge variant="secondary">Poistettu</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Väri-/pintatyyppi</span>
                  <span>{variTyypinNimi(osa.vari_tyyppi)}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(osat ?? []).length === 0 && (
          <p className="text-muted-foreground">Ei osia hakuehdoilla.</p>
        )}
      </div>
    </div>
  );
}
