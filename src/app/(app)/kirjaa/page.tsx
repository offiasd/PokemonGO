import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { KirjaaLomake } from "./kirjaa-lomake";

export default async function KirjaaSivu() {
  await vaaditaanKayttaja();
  const supabase = await createClient();

  const [osatVastaus, varitVastaus, tapahtumatVastaus] = await Promise.all([
    supabase
      .from("osat")
      .select("id, nimi, merkki, malli, arvioitu_kulutus_g")
      .eq("aktiivinen", true)
      .order("nimi"),
    supabase
      .from("varit")
      .select("id, nimi, saldo_g")
      .eq("aktiivinen", true)
      .order("nimi"),
    supabase
      .from("maalaustapahtumat_raportoituna")
      .select("*")
      .order("luotu", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kirjaa maalaus</h1>
        <p className="text-muted-foreground">
          Kirjaa maalaustapahtuma - varastosaldo päivittyy automaattisesti.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uusi tapahtuma</CardTitle>
          <CardDescription>
            Arvioitu kulutus lasketaan automaattisesti osan ja kappalemäärän perusteella. Voit
            korjata toteutuneen kulutuksen ennen tallennusta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KirjaaLomake osat={osatVastaus.data ?? []} varit={varitVastaus.data ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Viimeisimmät tapahtumat</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ajankohta</TableHead>
                <TableHead>Osa</TableHead>
                <TableHead>Väri</TableHead>
                <TableHead>Kpl</TableHead>
                <TableHead>Toteutunut kulutus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tapahtumatVastaus.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(t.luotu).toLocaleString("fi-FI")}
                  </TableCell>
                  <TableCell>{t.osa_nimi}</TableCell>
                  <TableCell>{t.vari_nimi}</TableCell>
                  <TableCell>{t.kappalemaara}</TableCell>
                  <TableCell>{t.toteutunut_kulutus_g.toLocaleString("fi-FI")} g</TableCell>
                </TableRow>
              ))}
              {(tapahtumatVastaus.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Ei vielä tapahtumia.
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
