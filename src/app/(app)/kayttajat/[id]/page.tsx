import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { muotoileEuro, TYON_TILAN_NIMI } from "@/lib/vakiot";
import type { Database, ToinenVariRooli, TyonTila } from "@/lib/supabase/database.types";

import { Summat } from "../../tyot/summat";

type TyoRow = Database["public"]["Tables"]["tyot"]["Row"];

const ROOLIN_NIMI: Record<ToinenVariRooli, string> = {
  pohjavari: "Pohjaväri",
  lakka: "Lakka",
};

/**
 * Miten työntekijä liittyy työhön. Sama työ voi näkyä usealla roolilla, mutta
 * listalla riittää kertoa mikä hänen osuutensa oli.
 */
function osuus(tyo: TyoRow, kayttajaId: string) {
  const roolit: string[] = [];
  if (tyo.vastaanotti_id === kayttajaId) roolit.push("vastaanotti");
  if (tyo.aloitti_id === kayttajaId) roolit.push("aloitti");
  if (tyo.valmistui_id === kayttajaId) roolit.push("valmisti");
  return roolit.join(" - ");
}

export default async function KayttajanTyotSivu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { data: profiili } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", id)
    .single();
  if (!profiili) notFound();

  // Työ kuuluu työntekijälle jos hän on vastaanottanut, aloittanut tai
  // valmistanut sen - kaikki kolme kertovat tehdystä työstä.
  const { data: tyotData } = await supabase
    .from("tyot")
    .select("*")
    .or(`vastaanotti_id.eq.${id},aloitti_id.eq.${id},valmistui_id.eq.${id}`)
    .order("aloitettu", { ascending: false });
  const tyot = tyotData ?? [];

  const tyoIdt = tyot.map((t) => t.id);
  const [rivitVastaus, osatVastaus, varitVastaus] = await Promise.all([
    tyoIdt.length > 0
      ? supabase.from("tyon_rivit").select("*").in("tyo_id", tyoIdt)
      : Promise.resolve({ data: [] }),
    supabase.from("osat").select("id, nimi"),
    supabase.from("varit").select("id, nimi"),
  ]);
  const rivit = rivitVastaus.data ?? [];

  const { data: lisavaritData } =
    rivit.length > 0
      ? await supabase
          .from("tyon_rivin_lisavarit")
          .select("rivi_id, vari_id")
          .in(
            "rivi_id",
            rivit.map((r) => r.id)
          )
          .order("jarjestys")
      : { data: [] };
  const lisavarit = lisavaritData ?? [];

  const osaNimi = (osaId: string) =>
    osatVastaus.data?.find((o) => o.id === osaId)?.nimi ?? "Tuntematon osa";
  const variNimi = (variId: string | null) =>
    variId ? (varitVastaus.data?.find((v) => v.id === variId)?.nimi ?? "Tuntematon väri") : "-";

  const tyonRivit = (tyoId: string) => rivit.filter((r) => r.tyo_id === tyoId);
  const summat = (tyo: TyoRow) => {
    const valisumma = tyonRivit(tyo.id).reduce(
      (s, r) => s + r.yksikkohinta_eur * r.kappalemaara,
      0
    );
    const alennusEur = Math.round(valisumma * (tyo.alennus_prosentti / 100) * 100) / 100;
    return { valisumma, alennusEur, loppusumma: Math.round((valisumma - alennusEur) * 100) / 100 };
  };

  const ryhmat: { tila: TyonTila; tyot: TyoRow[] }[] = (
    ["vastaanotettu", "vaiheessa", "valmis"] as TyonTila[]
  ).map((tila) => ({ tila, tyot: tyot.filter((t) => t.tila === tila) }));

  return (
    <div className="grid gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/kayttajat">
            <ArrowLeft className="size-4" />
            Käyttäjät
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold break-all">{profiili.full_name ?? "Käyttäjä"}</h1>
          <Badge variant="outline">{profiili.role === "admin" ? "Admin" : "Maalaaja"}</Badge>
        </div>
        <p className="text-muted-foreground">
          {tyot.length === 0
            ? "Ei töitä."
            : `${tyot.length} työtä - vastaanotetut, aloitetut ja valmistetut.`}
        </p>
      </div>

      {ryhmat.map(({ tila, tyot: ryhmanTyot }) => (
        <Card key={tila}>
          <CardHeader>
            <CardTitle className="text-base">
              {TYON_TILAN_NIMI[tila]} ({ryhmanTyot.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {ryhmanTyot.length === 0 && (
              <p className="text-sm text-muted-foreground">Ei töitä tässä tilassa.</p>
            )}
            {ryhmanTyot.map((tyo) => (
              <div key={tyo.id} className="grid gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      {tyo.asiakas ?? "Ei asiakastietoa"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tyo.aloitettu).toLocaleDateString("fi-FI")} - {osuus(tyo, id)}
                    </p>
                  </div>
                  {/* Valmiin työn rivejä ei voi muokata, joten nappi näkyy vain
                      keskeneräisillä - sama sääntö kuin Työt-sivulla. */}
                  {tyo.tila !== "valmis" && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/tyot/${tyo.id}/muokkaa`}>
                        <Pencil className="size-4" />
                        Muokkaa
                      </Link>
                    </Button>
                  )}
                </div>
                <ul className="grid gap-1 text-sm">
                  {tyonRivit(tyo.id).map((rivi) => (
                    <li key={rivi.id} className="flex justify-between gap-4">
                      <span className="min-w-0 break-words">
                        {osaNimi(rivi.osa_id)} - {variNimi(rivi.vari_id)}
                        {rivi.toinen_vari_id && rivi.toinen_vari_rooli && (
                          <>
                            {" "}
                            + {ROOLIN_NIMI[rivi.toinen_vari_rooli]}:{" "}
                            {variNimi(rivi.toinen_vari_id)}
                          </>
                        )}
                        {lisavarit
                          .filter((l) => l.rivi_id === rivi.id)
                          .map((l) => (
                            <span key={l.vari_id}> + {variNimi(l.vari_id)}</span>
                          ))}
                        {rivi.kommentti && (
                          <span className="block text-xs text-muted-foreground italic">
                            {rivi.kommentti}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {muotoileEuro(rivi.yksikkohinta_eur * rivi.kappalemaara)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Summat tyo={tyo} summat={summat(tyo)} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
