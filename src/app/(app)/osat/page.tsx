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
import { ajoneuvotyypinNimi, muotoileValiEuro } from "@/lib/vakiot";
import type { AjoneuvoTyyppi, TyoVaihe } from "@/lib/supabase/database.types";

import { OsienSuodattimet } from "./osien-suodattimet";
import { laskeKategoriaKustannukset, laskeTyokustannus } from "./kustannusarvio";

interface Hakuparametrit {
  q?: string;
  ajoneuvotyyppi?: string;
  naytaPoistetut?: string;
}

export default async function OsatSivu({
  searchParams,
}: {
  searchParams: Promise<Hakuparametrit>;
}) {
  const { q, ajoneuvotyyppi, naytaPoistetut } = await searchParams;
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  let kysely = supabase.from("osat").select("*").order("nimi", { ascending: true });

  if (!(naytaPoistetut === "1" && kayttaja.role === "admin")) {
    kysely = kysely.eq("aktiivinen", true);
  }
  if (ajoneuvotyyppi) {
    kysely = kysely.eq("ajoneuvotyyppi", ajoneuvotyyppi as AjoneuvoTyyppi);
  }
  if (q) {
    kysely = kysely.or(`nimi.ilike.%${q}%,merkki.ilike.%${q}%,malli.ilike.%${q}%`);
  }

  const [
    osatVastaus,
    variVastaus,
    variKategoriaVastaus,
    kategoriahintaVastaus,
    tyovaiheetVastaus,
    tuntiveloitusVastaus,
  ] = await Promise.all([
    kysely,
    supabase.from("varit").select("id, nimi").eq("aktiivinen", true).order("nimi"),
    supabase.from("vari_kategoriat").select("vari_id, maali_tyyppi"),
    supabase.from("osa_kategoriahinnat").select("*"),
    supabase
      .from("osa_tyovaiheet")
      .select("osa_id, vaihe, arvioitu_kesto_min")
      .eq("tarvitaan", true),
    supabase.from("tuntiveloitukset").select("vaihe, tuntihinta"),
  ]);

  const osat = osatVastaus.data ?? [];

  // Näytetään korteissa asiakashinta-asteikko (halvin-kallein sellinen kategoria)
  // kaikille käyttäjärooleille - kyseessä on asiakkaalle näkyvä hinta, ei
  // sisäinen kustannustieto. Samalla laskentaperusteella kuin osan omalla
  // sivulla, mutta työkustannus lasketaan tässä JS:ssä RPC-kutsujen sijaan,
  // jotta listasivu ei tee erillistä tietokantakutsua jokaiselle osalle.
  const hintaskaalat = new Map<string, { min: number; max: number }>();
  if (osat.length > 0) {
    const varitHinnoin = await Promise.all(
      (variVastaus.data ?? []).map(async (vari) => {
        const { data } = await supabase.rpc("vari_kokonaishinta", { p_vari_id: vari.id });
        return { id: vari.id, nimi: vari.nimi, kokonaishinta: data ?? 0 };
      })
    );

    const tuntiveloitukset = new Map<TyoVaihe, number>();
    for (const t of tuntiveloitusVastaus.data ?? []) {
      if (t.vaihe) tuntiveloitukset.set(t.vaihe, t.tuntihinta);
    }

    for (const osa of osat) {
      const omatVaiheet = (tyovaiheetVastaus.data ?? []).filter((v) => v.osa_id === osa.id);
      const tyokustannus = laskeTyokustannus(
        omatVaiheet,
        tuntiveloitukset,
        asetukset.yleinen_tuntihinta
      );
      const omatKategoriahinnat = (kategoriahintaVastaus.data ?? []).filter(
        (k) => k.osa_id === osa.id
      );

      const rivit = laskeKategoriaKustannukset({
        osa,
        asetukset,
        tyokustannus,
        kategoriahinnat: omatKategoriahinnat,
        varit: varitHinnoin,
        variKategoriat: variKategoriaVastaus.data ?? [],
      });

      // Admin voi asettaa kategorialle kiinteän hinnan, joka ohittaa listan
      // hintanäytössä automaattisen (väri + kate -pohjaisen) suositushinnan.
      if (rivit.length > 0) {
        const rajat = rivit.map((r) => {
          const kiinteaHinta = omatKategoriahinnat.find((k) => k.maali_tyyppi === r.avain)?.hinta;
          return kiinteaHinta != null
            ? { min: kiinteaHinta, max: kiinteaHinta }
            : { min: r.suositusMin, max: r.suositusMax };
        });
        hintaskaalat.set(osa.id, {
          min: Math.min(...rajat.map((r) => r.min)),
          max: Math.max(...rajat.map((r) => r.max)),
        });
      }
    }
  }

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
        {osat.map((osa) => {
          const hinta = hintaskaalat.get(osa.id);
          return (
            <Link key={osa.id} href={`/osat/${osa.id}`}>
              <Card
                className={
                  !osa.aktiivinen ? "opacity-60" : "transition-shadow hover:shadow-md"
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{osa.nimi}</CardTitle>
                  <CardDescription>
                    {[osa.merkki, osa.malli].filter(Boolean).join(" ") || "Merkki/malli tuntematon"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    {osa.kuva_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={osa.kuva_url}
                        alt={osa.nimi}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                        Ei kuvaa
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                      <Badge variant="outline" className="bg-background/90">
                        {ajoneuvotyypinNimi(osa.ajoneuvotyyppi)}
                      </Badge>
                      {!osa.aktiivinen && <Badge variant="secondary">Poistettu</Badge>}
                    </div>
                    {hinta && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 py-2 text-center">
                        <span className="text-sm font-semibold text-white">
                          {muotoileValiEuro(hinta.min, hinta.max)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {osat.length === 0 && (
          <p className="text-muted-foreground">Ei osia hakuehdoilla.</p>
        )}
      </div>
    </div>
  );
}
