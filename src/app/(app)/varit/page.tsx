import Link from "next/link";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Button } from "@/components/ui/button";
import { MAALI_TYYPIT, VARISAVYT } from "@/lib/vakiot";
import type { Database, MaaliTyyppi, Varisavy } from "@/lib/supabase/database.types";

import { VarienSuodattimet } from "./varien-suodattimet";
import { VariKortti } from "./vari-kortti";

type VariRow = Database["public"]["Tables"]["varit"]["Row"];

export default async function VaritSivu({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; naytaPoistetut?: string; tyyppi?: string; savy?: string }>;
}) {
  const { q, naytaPoistetut, tyyppi, savy } = await searchParams;
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const naytaHinnat = kayttaja.role === "admin" || asetukset.nayta_hinnat_maalaajalle;
  const tyyppiSuodatin = MAALI_TYYPIT.some((t) => t.arvo === tyyppi)
    ? (tyyppi as MaaliTyyppi)
    : null;
  const savySuodatin = VARISAVYT.some((s) => s.arvo === savy) ? (savy as Varisavy) : null;

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
  if (tyyppiSuodatin) {
    kysely = kysely.eq("tyyppi", tyyppiSuodatin);
  }
  if (savySuodatin) {
    kysely = kysely.eq("varisavy", savySuodatin);
  }

  const { data: varit } = await kysely;

  const ryhmat = new Map<MaaliTyyppi, VariRow[]>();
  for (const vari of varit ?? []) {
    const lista = ryhmat.get(vari.tyyppi) ?? [];
    lista.push(vari);
    ryhmat.set(vari.tyyppi, lista);
  }

  const naytettavatTyypit = tyyppiSuodatin
    ? MAALI_TYYPIT.filter((t) => t.arvo === tyyppiSuodatin)
    : MAALI_TYYPIT;

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

      {(varit ?? []).length === 0 && (
        <p className="text-muted-foreground">Ei värejä hakuehdoilla.</p>
      )}

      <div className="grid gap-8">
        {naytettavatTyypit.map(({ arvo, nimi }) => {
          const ryhmanVarit = ryhmat.get(arvo);
          if (!ryhmanVarit || ryhmanVarit.length === 0) return null;
          return (
            <section key={arvo} className="grid gap-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {nimi}
                <span className="text-sm font-normal text-muted-foreground">
                  ({ryhmanVarit.length})
                </span>
              </h2>
              <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-3">
                {ryhmanVarit.map((vari) => (
                  <VariKortti
                    key={vari.id}
                    vari={vari}
                    oletusHalytysraja={asetukset.oletus_halytysraja_g}
                    naytaHinnat={naytaHinnat}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
