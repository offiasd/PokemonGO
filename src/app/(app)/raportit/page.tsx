import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { muotoileEuro } from "@/lib/vakiot";

import { RaportinSuodattimet } from "./raportin-suodattimet";

type Jakso = "paiva" | "viikko" | "kuukausi" | "vuosi";

function muotoileJakso(jakso: Jakso, iso: string) {
  const pvm = new Date(iso);
  if (jakso === "paiva") return pvm.toLocaleDateString("fi-FI");
  if (jakso === "viikko")
    return `Viikko alkaen ${pvm.toLocaleDateString("fi-FI")}`;
  if (jakso === "kuukausi")
    return pvm.toLocaleDateString("fi-FI", { month: "long", year: "numeric" });
  return pvm.toLocaleDateString("fi-FI", { year: "numeric" });
}

export default async function RaportitSivu({
  searchParams,
}: {
  searchParams: Promise<{
    jakso?: string;
    variId?: string;
    osaId?: string;
    alkaen?: string;
    paattyen?: string;
  }>;
}) {
  const { jakso: jaksoParam, variId, osaId, alkaen, paattyen } = await searchParams;
  const jakso = (jaksoParam as Jakso) ?? "kuukausi";

  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();
  const naytaHinnat = kayttaja.role === "admin" || asetukset.nayta_hinnat_maalaajalle;

  const [varitVastaus, osatVastaus, kaytetyinVastaus] = await Promise.all([
    supabase.from("varit").select("id, nimi").order("nimi"),
    supabase.from("osat").select("id, nimi").order("nimi"),
    supabase.rpc("kuukauden_kaytetyin_vari"),
  ]);

  let kysely = supabase.from("maalaustapahtumat_raportoituna").select("*");
  if (variId) kysely = kysely.eq("vari_id", variId);
  if (osaId) kysely = kysely.eq("osa_id", osaId);
  if (alkaen) kysely = kysely.gte("luotu", new Date(alkaen).toISOString());
  if (paattyen) {
    const loppu = new Date(paattyen);
    loppu.setDate(loppu.getDate() + 1);
    kysely = kysely.lt("luotu", loppu.toISOString());
  }

  const { data: tapahtumat } = await kysely.order("luotu", { ascending: false });

  const ryhmat = new Map<string, { kg: number; eur: number; tapahtumia: number }>();
  for (const t of tapahtumat ?? []) {
    const avain = t[jakso] as string;
    const nykyinen = ryhmat.get(avain) ?? { kg: 0, eur: 0, tapahtumia: 0 };
    nykyinen.kg += t.toteutunut_kulutus_kg;
    nykyinen.eur += t.maalikustannus_eur;
    nykyinen.tapahtumia += 1;
    ryhmat.set(avain, nykyinen);
  }
  const rivit = [...ryhmat.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const yhteensaKg = rivit.reduce((s, [, v]) => s + v.kg, 0);
  const yhteensaEur = rivit.reduce((s, [, v]) => s + v.eur, 0);

  const kaytetyin = kaytetyinVastaus.data?.[0] ?? null;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Raportit</h1>
        <p className="text-muted-foreground">
          Maalikulutus (kg{naytaHinnat ? " ja €" : ""}) suodatettuna ajanjakson, värin tai osan
          mukaan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Kuukauden käytetyin väri
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!kaytetyin && (
            <p className="text-sm text-muted-foreground">Ei tapahtumia tältä kuukaudelta.</p>
          )}
          {kaytetyin && (
            <div className="flex items-center justify-between">
              <span className="text-xl font-semibold">{kaytetyin.vari_nimi}</span>
              <Badge variant="secondary">
                {kaytetyin.yhteensa_kg.toLocaleString("fi-FI", { maximumFractionDigits: 2 })} kg -{" "}
                {kaytetyin.tapahtumia} tapahtumaa
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <RaportinSuodattimet varit={varitVastaus.data ?? []} osat={osatVastaus.data ?? []} />

      <Card>
        <CardHeader>
          <CardTitle>Kulutus jaksoittain</CardTitle>
          <CardDescription>
            Yhteensä {yhteensaKg.toLocaleString("fi-FI", { maximumFractionDigits: 2 })} kg
            {naytaHinnat && ` - ${muotoileEuro(yhteensaEur)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ajanjakso</TableHead>
                <TableHead>Tapahtumia</TableHead>
                <TableHead>Kulutus (kg)</TableHead>
                {naytaHinnat && <TableHead>Maalikustannus</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rivit.map(([avain, arvot]) => (
                <TableRow key={avain}>
                  <TableCell className="font-medium">{muotoileJakso(jakso, avain)}</TableCell>
                  <TableCell>{arvot.tapahtumia}</TableCell>
                  <TableCell>
                    {arvot.kg.toLocaleString("fi-FI", { maximumFractionDigits: 2 })}
                  </TableCell>
                  {naytaHinnat && <TableCell>{muotoileEuro(arvot.eur)}</TableCell>}
                </TableRow>
              ))}
              {rivit.length === 0 && (
                <TableRow>
                  <TableCell colSpan={naytaHinnat ? 4 : 3} className="text-center text-muted-foreground">
                    Ei tapahtumia hakuehdoilla.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
