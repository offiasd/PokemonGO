import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { createClient } from "@/lib/supabase/server";
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

import { KutsuLomake } from "./kutsu-lomake";
import { RooliValitsin } from "./rooli-valitsin";

export default async function KayttajatSivu() {
  const kayttaja = await vaaditaanAdmin();
  const supabase = await createClient();

  const { data: profiilit } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Käyttäjät</h1>
        <p className="text-muted-foreground">Hallitse käyttäjärooleja ja kutsu uusia käyttäjiä.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kutsu uusi käyttäjä</CardTitle>
          <CardDescription>
            Lähettää kutsusähköpostin Supabase Authin kautta. Vaatii SUPABASE_SERVICE_ROLE_KEY-
            ja sähköpostiasetukset Supabase-projektissa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KutsuLomake />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Käyttäjät ({profiilit?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nimi</TableHead>
                <TableHead>Rooli</TableHead>
                <TableHead>Liittynyt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profiilit ?? []).map((p) => (
                <TableRow key={p.id}>
                  {/* break-all: nimi on käytännössä sähköpostiosoite, eli yksi
                      katkeamaton sana joka piti taulukon puhelinta leveämpänä. */}
                  <TableCell className="font-medium break-all">{p.full_name ?? "-"}</TableCell>
                  <TableCell>
                    <RooliValitsin
                      kayttajaId={p.id}
                      nykyinenRooli={p.role}
                      omaId={kayttaja.id}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("fi-FI")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
