import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { muotoileEuro, muotoileGrammat } from "@/lib/vakiot";

import { ViimesteleEra } from "./viimeistele-era";

function kilohinta(arvo: number | null): string {
  if (arvo === null) return "-";
  return `${arvo.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kg`;
}

export default async function EratSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();

  // Kesken olevat ensin: ne odottavat tullauspäätöstä, ja odottava erä
  // unohtuu jos se on kymmenen valmiin alapuolella.
  const { data: erat } = await supabase
    .from("maalierat")
    .select("*")
    .order("tila", { ascending: true })
    .order("paivays", { ascending: false });

  const eraIdt = (erat ?? []).map((e) => e.id);
  const { data: rivit } = eraIdt.length
    ? await supabase
        .from("varin_erahistoria")
        .select("era_id, vari_id, maara_g, tavara_eur, hankintahinta_per_kg, keskihinta_jalkeen_per_kg")
        .in("era_id", eraIdt)
    : { data: [] };

  const variIdt = [...new Set((rivit ?? []).map((r) => r.vari_id))];
  const { data: varit } = variIdt.length
    ? await supabase.from("varit").select("id, nimi").in("id", variIdt)
    : { data: [] };
  const nimet = new Map((varit ?? []).map((v) => [v.id, v.nimi]));

  const keskenerat = (erat ?? []).filter((e) => e.tila === "kesken");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Maalierät</h1>
          <p className="text-sm text-muted-foreground">
            Erän kulut jaetaan riveille, ja värin hinta on varaston liukuva keskihinta.
          </p>
        </div>
        <Button asChild>
          <Link href="/varit/erat/uusi">
            <Plus className="size-4" />
            Uusi erä
          </Link>
        </Button>
      </div>

      {keskenerat.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
          <AlertTriangle className="size-4 shrink-0" />
          {keskenerat.length === 1
            ? "Yksi erä odottaa tullauspäätöstä"
            : `${keskenerat.length} erää odottaa tullauspäätöstä`}
          : niiden kilohinta on arvio.
        </p>
      )}

      {(erat ?? []).length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Ei kirjattuja eriä. Ensimmäinen erä muuttaa värin hinnan viimeisimmästä ostohinnasta
            varaston keskihinnaksi.
          </CardContent>
        </Card>
      )}

      {(erat ?? []).map((era) => {
        const eranRivit = (rivit ?? []).filter((r) => r.era_id === era.id);
        const kulut = era.tavara_eur + era.rahti_eur + era.tulli_eur + era.tuonti_alv_eur;

        return (
          <Card key={era.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid min-w-0 flex-1 gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base wrap-anywhere">
                    {era.toimittaja ?? "Toimittaja puuttuu"}
                    {era.tila === "kesken" && (
                      <Badge variant="outline" className="text-tila-keltainen-teksti">
                        Kesken
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {new Date(era.paivays).toLocaleDateString("fi-FI")} · tavara{" "}
                    {muotoileEuro(era.tavara_eur)} · rahti {muotoileEuro(era.rahti_eur)} · tulli{" "}
                    {muotoileEuro(era.tulli_eur)} · tuonti-ALV {muotoileEuro(era.tuonti_alv_eur)} ·
                    yhteensä {muotoileEuro(kulut)}
                    {era.tila === "kesken" ? " (tulli ja ALV arvioita)" : ""}
                  </CardDescription>
                </div>
                {era.tila === "kesken" && (
                  <ViimesteleEra
                    eraId={era.id}
                    toimittaja={era.toimittaja}
                    arvioTulli={era.tulli_eur}
                    arvioAlv={era.tuonti_alv_eur}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {eranRivit.map((rivi) => (
                <div
                  key={`${rivi.era_id}-${rivi.vari_id}-${rivi.maara_g}`}
                  className="grid gap-1 border-t pt-2 text-sm first:border-t-0 first:pt-0 sm:flex sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2"
                >
                  {/* Värien nimet ovat pitkiä katkeamattomia merkkijonoja, ja
                      luvut omalla rivillään pysyvät luettavina puhelimellakin. */}
                  <span className="min-w-0 font-medium wrap-anywhere">
                    {nimet.get(rivi.vari_id) ?? "Poistettu väri"}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {muotoileGrammat(rivi.maara_g)} · {muotoileEuro(rivi.tavara_eur ?? 0)} tavaraa ·{" "}
                    <span className="font-medium text-foreground">
                      {kilohinta(rivi.hankintahinta_per_kg)}
                    </span>{" "}
                    · keskihinnaksi {kilohinta(rivi.keskihinta_jalkeen_per_kg)}
                  </span>
                </div>
              ))}
              {era.muistiinpano && (
                <p className="text-sm text-muted-foreground">{era.muistiinpano}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
