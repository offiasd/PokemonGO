import Link from "next/link";
import { ClipboardList } from "lucide-react";

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
import { Button } from "@/components/ui/button";

import { KaksivaiheinenNappi } from "./kaksivaiheinen-nappi";
import { KutsuLomake } from "./kutsu-lomake";
import { RooliValitsin } from "./rooli-valitsin";

export default async function KayttajatSivu() {
  const kayttaja = await vaaditaanAdmin();
  const supabase = await createClient();

  // Tekijät ovat auth-skeemassa, johon PostgREST ei yllä. Kannan funktio lukee
  // ne adminille - aiemmin tila luettiin listUsers()-vastauksesta, joka ei
  // palauta tekijöitä lainkaan, joten sarake näytti "Ei käytössä" kaikille.
  const [{ data: profiilit }, { data: kaksivaiheisetData }, { data: tyot }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: true }),
    supabase.rpc("kaksivaiheiset_kayttajat"),
    supabase.from("tyot").select("vastaanotti_id, aloitti_id, valmistui_id"),
  ]);
  const kaksivaiheiset = new Set<string>(kaksivaiheisetData ?? []);

  // Sama työ voi olla vastaanotettu, aloitettu ja valmistettu eri henkilöiden
  // toimesta, joten jokainen rooli laskee - mutta oma työ vain kerran.
  const tyomaarat = new Map<string, number>();
  for (const tyo of tyot ?? []) {
    for (const id of new Set(
      [tyo.vastaanotti_id, tyo.aloitti_id, tyo.valmistui_id].filter(Boolean) as string[]
    )) {
      tyomaarat.set(id, (tyomaarat.get(id) ?? 0) + 1);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Käyttäjät</h1>
        <p className="text-muted-foreground">
          Hallitse käyttäjärooleja, kutsu uusia käyttäjiä ja katso työntekijöiden töitä.
        </p>
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
                <TableHead>Työt</TableHead>
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
                  <TableCell>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/kayttajat/${p.id}`}>
                        <ClipboardList className="size-4" />
                        {tyomaarat.get(p.id) ?? 0}
                      </Link>
                    </Button>
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
