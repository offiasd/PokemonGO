import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

import { KaksivaiheinenNappi } from "./kaksivaiheinen-nappi";
import { KutsuLomake } from "./kutsu-lomake";
import { RooliValitsin } from "./rooli-valitsin";

/**
 * Kenellä kaksivaiheinen tunnistus on käytössä. Tieto on auth-skeemassa, johon
 * pääsee vain service role -avaimella; ilman avainta sarake näyttää tyhjää
 * eikä sivu kaadu.
 */
async function haeKaksivaiheiset(): Promise<Set<string>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) return new Set();
    return new Set(
      (data?.users ?? [])
        .filter((k) => (k.factors ?? []).some((t) => t.status === "verified"))
        .map((k) => k.id)
    );
  } catch {
    return new Set();
  }
}

export default async function KayttajatSivu() {
  const kayttaja = await vaaditaanAdmin();
  const supabase = await createClient();

  const [{ data: profiilit }, kaksivaiheiset] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: true }),
    haeKaksivaiheiset(),
  ]);

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
                <TableHead>
                  <span className="sm:hidden">2FA</span>
                  <span className="hidden sm:inline">Kaksivaiheinen</span>
                </TableHead>
                {/* Liittymispäivä on nice-to-know: puhelimessa se veisi tilan
                    sarakkeilta joilla oikeasti tehdään jotain. */}
                <TableHead className="hidden sm:table-cell">Liittynyt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profiilit ?? []).map((p) => (
                <TableRow key={p.id}>
                  {/* break-all: nimi on käytännössä sähköpostiosoite, eli yksi
                      katkeamaton sana joka piti taulukon puhelinta leveämpänä. */}
                  <TableCell className="min-w-28 font-medium break-all">
                    {p.full_name ?? "-"}
                  </TableCell>
                  <TableCell>
                    <RooliValitsin
                      kayttajaId={p.id}
                      nykyinenRooli={p.role}
                      omaId={kayttaja.id}
                    />
                  </TableCell>
                  <TableCell>
                    <KaksivaiheinenNappi
                      kayttajaId={p.id}
                      nimi={p.full_name ?? "käyttäjä"}
                      kaytossa={kaksivaiheiset.has(p.id)}
                    />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
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
