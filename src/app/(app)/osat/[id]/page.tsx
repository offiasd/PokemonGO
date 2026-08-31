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
import {
  ajoneuvotyypinNimi,
  muotoileEuro,
  muotoileValiEuro,
  tyoVaiheenNimi,
  variTyypinNimi,
} from "@/lib/vakiot";

import { paivitaOsa } from "../actions";
import { OsaLomake } from "../osa-lomake";
import { laskeKategoriaKustannukset } from "../kustannusarvio";
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

  const [osaVastaus, tyovaiheetVastaus, variVastaus, kategoriahintaVastaus, variKategoriaVastaus] =
    await Promise.all([
      supabase.from("osat").select("*").eq("id", id).single(),
      supabase.from("osa_tyovaiheet").select("*").eq("osa_id", id),
      supabase.from("varit").select("id, nimi").eq("aktiivinen", true).order("nimi"),
      supabase.from("osa_kategoriahinnat").select("*").eq("osa_id", id),
      supabase.from("vari_kategoriat").select("vari_id, maali_tyyppi"),
    ]);

  const osa = osaVastaus.data;
  if (!osa) notFound();

  const tyovaiheet = (tyovaiheetVastaus.data ?? []).filter((v) => v.tarvitaan);
  const naytaHinnat = kayttaja.role === "admin" || asetukset.nayta_hinnat_maalaajalle;

  let tyoaikaMin = 0;
  let tyokustannus = 0;
  let kategoriaKustannukset: ReturnType<typeof laskeKategoriaKustannukset> = [];

  if (naytaHinnat) {
    const [tyoaikaVastaus, tyokustannusVastaus] = await Promise.all([
      supabase.rpc("osa_tyoaika_min", { p_osa_id: id }),
      supabase.rpc("osa_tyokustannus", { p_osa_id: id }),
    ]);
    tyoaikaMin = tyoaikaVastaus.data ?? 0;
    tyokustannus = tyokustannusVastaus.data ?? 0;

    const varitHinnoin = await Promise.all(
      (variVastaus.data ?? []).map(async (vari) => {
        const { data } = await supabase.rpc("vari_kokonaishinta", { p_vari_id: vari.id });
        return { id: vari.id, nimi: vari.nimi, kokonaishinta: data ?? 0 };
      })
    );

    kategoriaKustannukset = laskeKategoriaKustannukset({
      osa,
      asetukset,
      tyokustannus,
      kategoriahinnat: kategoriahintaVastaus.data ?? [],
      varit: varitHinnoin,
      variKategoriat: variKategoriaVastaus.data ?? [],
    });
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
            </CardContent>
          </Card>

          {naytaHinnat && (
            <Card>
              <CardHeader>
                <CardTitle>Suositushinta kategorioittain</CardTitle>
              </CardHeader>
              <CardContent>
                {kategoriaKustannukset.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Ei hinnoiteltuja kategorioita.
                  </p>
                )}
                <ul className="grid gap-1 text-sm">
                  {kategoriaKustannukset.map((k) => (
                    <li key={k.avain} className="flex justify-between">
                      <span>{k.nimi}</span>
                      <span className="text-muted-foreground">
                        {muotoileValiEuro(k.suositusMin, k.suositusMax)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
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

          {kategoriaKustannukset.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Kustannusarvio (maali + työ)</TableHead>
                  <TableHead>Suositushinta asiakkaalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kategoriaKustannukset.map((k) => (
                  <TableRow key={k.avain}>
                    <TableCell className="font-medium">{k.nimi}</TableCell>
                    <TableCell>{muotoileValiEuro(k.kustannusMin, k.kustannusMax)}</TableCell>
                    <TableCell>{muotoileValiEuro(k.suositusMin, k.suositusMax)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {kategoriaKustannukset.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ei hinnoiteltuja kategorioita tai värejä kustannusarvion laskentaan.
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
