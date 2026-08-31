import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ajoneuvotyypinNimi, muotoileEuro, tyoVaiheenNimi, variTyypinNimi } from "@/lib/vakiot";

import { paivitaOsa } from "../actions";
import { OsaLomake } from "../osa-lomake";
import { PoistaPalautaOsa } from "./poista-palauta-osa";

export default async function OsaSivu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const [osaVastaus, tyovaiheetVastaus, variVastaus, kategoriahintaVastaus] = await Promise.all([
    supabase.from("osat").select("*").eq("id", id).single(),
    supabase.from("osa_tyovaiheet").select("*").eq("osa_id", id),
    supabase.from("varit").select("id, nimi").eq("aktiivinen", true).order("nimi"),
    supabase.from("osa_kategoriahinnat").select("*").eq("osa_id", id),
  ]);

  const osa = osaVastaus.data;
  if (!osa) notFound();

  const tyovaiheet = (tyovaiheetVastaus.data ?? []).filter((v) => v.tarvitaan);
  const naytaHinnat = kayttaja.role === "admin" || asetukset.nayta_hinnat_maalaajalle;

  let tyoaikaMin = 0;
  let tyokustannus = 0;
  let variKustannukset: {
    variId: string;
    nimi: string;
    kustannusarvio: number;
    suositushinta: number;
  }[] = [];

  if (naytaHinnat) {
    const [tyoaikaVastaus, tyokustannusVastaus] = await Promise.all([
      supabase.rpc("osa_tyoaika_min", { p_osa_id: id }),
      supabase.rpc("osa_tyokustannus", { p_osa_id: id }),
    ]);
    tyoaikaMin = tyoaikaVastaus.data ?? 0;
    tyokustannus = tyokustannusVastaus.data ?? 0;

    variKustannukset = await Promise.all(
      (variVastaus.data ?? []).map(async (vari) => {
        const [kustannusVastaus, hintaVastaus] = await Promise.all([
          supabase.rpc("osa_kustannusarvio", { p_osa_id: id, p_vari_id: vari.id }),
          supabase.rpc("osa_suositushinta", { p_osa_id: id, p_vari_id: vari.id }),
        ]);
        return {
          variId: vari.id,
          nimi: vari.nimi,
          kustannusarvio: kustannusVastaus.data ?? 0,
          suositushinta: hintaVastaus.data ?? 0,
        };
      })
    );
  }

  if (kayttaja.role !== "admin") {
    return (
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{osa.nimi}</h1>
            <p className="text-muted-foreground">
              {[osa.merkki, osa.malli].filter(Boolean).join(" ") || "Merkki/malli tuntematon"}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{ajoneuvotyypinNimi(osa.ajoneuvotyyppi)}</Badge>
            <Badge variant="outline">{variTyypinNimi(osa.vari_tyyppi)}</Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {osa.kuva_url && (
            <Card>
              <CardHeader>
                <CardTitle>Kuva</CardTitle>
              </CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={osa.kuva_url}
                  alt={osa.nimi}
                  className="max-h-64 rounded-md border object-contain"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Työvaiheet</CardTitle>
            </CardHeader>
            <CardContent>
              {tyovaiheet.length === 0 && (
                <p className="text-sm text-muted-foreground">Ei määriteltyjä työvaiheita.</p>
              )}
              <ul className="grid gap-1 text-sm">
                {tyovaiheet.map((v) => (
                  <li key={v.id} className="flex justify-between">
                    <span>{tyoVaiheenNimi(v.vaihe)}</span>
                    <span className="text-muted-foreground">{v.arvioitu_kesto_min} min</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted-foreground">
                Arvioitu maalinkulutus: {osa.arvioitu_kulutus_g.toLocaleString("fi-FI")} g
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{osa.nimi}</h1>
          <p className="text-muted-foreground">
            {[osa.merkki, osa.malli].filter(Boolean).join(" ") || "Merkki/malli tuntematon"}
          </p>
        </div>
        <PoistaPalautaOsa osaId={osa.id} aktiivinen={osa.aktiivinen} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kustannusarvio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1 text-sm sm:max-w-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kokonaistyöaika</span>
              <span>{tyoaikaMin} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Työkustannus</span>
              <span>{muotoileEuro(tyokustannus)}</span>
            </div>
            {osa.manuaalinen_hinta && (
              <div className="flex justify-between font-medium">
                <span>Manuaalinen hinta (ohittaa laskennan)</span>
                <span>{muotoileEuro(osa.manuaalinen_hinta)}</span>
              </div>
            )}
          </div>

          {variKustannukset.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Väri</TableHead>
                  <TableHead>Kustannusarvio (maali + työ)</TableHead>
                  <TableHead>Suositushinta asiakkaalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variKustannukset.map((v) => (
                  <TableRow key={v.variId}>
                    <TableCell className="font-medium">{v.nimi}</TableCell>
                    <TableCell>{muotoileEuro(v.kustannusarvio)}</TableCell>
                    <TableCell>{muotoileEuro(v.suositushinta)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {variKustannukset.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ei aktiivisia värejä kustannusarvion laskentaan.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Muokkaa osan tietoja</CardTitle>
        </CardHeader>
        <CardContent>
          <OsaLomake
            osa={osa}
            tyovaiheet={tyovaiheetVastaus.data ?? []}
            kategoriahinnat={kategoriahintaVastaus.data ?? []}
            formAction={paivitaOsa.bind(null, osa.id)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
