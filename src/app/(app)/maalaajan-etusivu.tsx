import Link from "next/link";
import { CheckCircle2, Clock, Flame, Layers, Package } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import type { NykyinenKayttaja } from "@/lib/supabase/kayttaja";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KiireellisyysTapla } from "@/components/kiireellisyys-tapla";
import { JAKSOT, OLETUSJAKSO, jaksonAlku, jaksonNimi } from "@/lib/jaksot";

import { JaksoValinta } from "./jakso-valinta";
import { laskeTyoaikaMin, muotoileKesto, muotoileKilot } from "@/lib/vakiot";
import type { TyoVaihe } from "@/lib/supabase/database.types";

import { AloitaTyo } from "./tyot/aloita-tyo";

function Luku({
  otsikko,
  arvo,
  lisatieto,
  ikoni: Ikoni,
}: {
  otsikko: string;
  arvo: string;
  lisatieto: string;
  ikoni: typeof Clock;
}) {
  // Sama ladelma kuin varaston yhteenvedossa: ikoni ja otsikko samalla rivillä,
  // luku sen alla. CardHeader on gridi, joten otsikkorivi tehdään sisällössä.
  return (
    <Card>
      <CardContent className="grid gap-1 py-6">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Ikoni className="size-4" />
          {otsikko}
        </div>
        <p className="text-2xl font-bold">{arvo}</p>
        <p className="text-xs text-muted-foreground">{lisatieto}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Maalaajan etusivu: oma tilanne ja vapaat työt.
 *
 * Yhteenveto lasketaan kirjautuneen omista töistä valitulta jaksolta, jotta
 * oman työn jälki näkyy heti. Vapaat työt ovat vastaanotettuja töitä, joista
 * seuraavan voi poimia suoraan tästä - arvioitu työaika kertoo kerkeääkö sen
 * tehdä.
 */
export async function MaalaajanEtusivu({
  kayttaja,
  jakso,
}: {
  kayttaja: NykyinenKayttaja;
  jakso?: string;
}) {
  const valittuJakso = JAKSOT.some((j) => j.arvo === jakso) ? jakso! : OLETUSJAKSO;
  const alku = jaksonAlku(valittuJakso);

  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const [tyotVastaus, tyovaiheetVastaus, osatVastaus, varitVastaus] = await Promise.all([
    supabase.from("tyot").select("*").order("aloitettu", { ascending: true }),
    supabase
      .from("osa_tyovaiheet")
      .select("osa_id, vaihe, arvioitu_kesto_min")
      .eq("tarvitaan", true),
    supabase.from("osat").select("id, nimi"),
    supabase.from("varit").select("id, nimi"),
  ]);

  const tyot = tyotVastaus.data ?? [];
  const tyovaiheet = tyovaiheetVastaus.data ?? [];
  const osat = osatVastaus.data ?? [];
  const varit = varitVastaus.data ?? [];

  const tyoIdt = tyot.map((t) => t.id);
  const { data: rivitData } = tyoIdt.length
    ? await supabase.from("tyon_rivit").select("*").in("tyo_id", tyoIdt)
    : { data: [] };
  const rivit = rivitData ?? [];

  // Rivillä on joko osa tai oma kuvaus: kertakohteen nimi on rivillä itsellään.
  const rivinNimi = (rivi: { osa_id: string | null; oma_kuvaus: string | null }) =>
    rivi.osa_id
      ? (osat.find((o) => o.id === rivi.osa_id)?.nimi ?? "Tuntematon osa")
      : (rivi.oma_kuvaus ?? "Tuntematon kohde");
  const variNimi = (id: string) => varit.find((v) => v.id === id)?.nimi ?? "Tuntematon väri";
  const rivitTyolle = (tyoId: string) => rivit.filter((r) => r.tyo_id === tyoId);

  // Kertakohteella (osa_id null) ei ole työvaiheita, joten työaika on nolla.
  const osanVaiheet = (osaId: string | null) =>
    tyovaiheet.filter((v) => osaId !== null && v.osa_id === osaId) as {
      vaihe: TyoVaihe;
      arvioitu_kesto_min: number;
    }[];
  const tyonTyoaikaMin = (tyoId: string) =>
    rivitTyolle(tyoId).reduce(
      (summa, r) =>
        summa + laskeTyoaikaMin(osanVaiheet(r.osa_id), r.toinen_vari_id ? 2 : 1) * r.kappalemaara,
      0
    );

  // Omat valmiit työt jaksolta: peli-idea on nähdä oma saldo kasvavan.
  const omatValmiit = tyot.filter(
    (t) =>
      t.tila === "valmis" &&
      t.valmistui_id === kayttaja.id &&
      t.valmistunut !== null &&
      (alku === null || new Date(t.valmistunut) >= alku)
  );
  const omatKesken = tyot.filter((t) => t.tila === "vaiheessa" && t.aloitti_id === kayttaja.id);
  // Kiireellisin ensin: pisimpään odottanut työ on ylimpänä riippumatta siitä
  // missä järjestyksessä kanta ne palauttaa.
  const vapaat = tyot
    .filter((t) => t.tila === "vastaanotettu")
    .sort((a, b) => new Date(a.aloitettu).getTime() - new Date(b.aloitettu).getTime());

  const maalattujaOsia = omatValmiit.reduce(
    (summa, t) => summa + rivitTyolle(t.id).reduce((s, r) => s + r.kappalemaara, 0),
    0
  );
  const kulutettuG = omatValmiit.reduce(
    (summa, t) =>
      summa +
      rivitTyolle(t.id).reduce(
        (s, r) =>
          s +
          (r.toteutunut_kulutus_g ?? r.arvioitu_kulutus_g) +
          (r.toinen_toteutunut_kulutus_g ?? r.toinen_arvioitu_kulutus_g ?? 0),
        0
      ),
    0
  );
  const tehtyTyoaikaMin = omatValmiit.reduce((summa, t) => summa + tyonTyoaikaMin(t.id), 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Moi{kayttaja.fullName ? `, ${kayttaja.fullName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground">
            Oma yhteenvetosi ja vapaat työt, joista voit poimia seuraavan.
          </p>
        </div>
        <JaksoValinta valittu={valittuJakso} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Luku
          otsikko="Valmiita töitä"
          arvo={String(omatValmiit.length)}
          lisatieto={jaksonNimi(valittuJakso)}
          ikoni={CheckCircle2}
        />
        <Luku
          otsikko="Maalattuja osia"
          arvo={String(maalattujaOsia)}
          lisatieto={jaksonNimi(valittuJakso)}
          ikoni={Package}
        />
        <Luku
          otsikko="Maalia kulutettu"
          arvo={muotoileKilot(kulutettuG)}
          lisatieto={jaksonNimi(valittuJakso)}
          ikoni={Flame}
        />
        <Luku
          otsikko="Työaikaa tehty"
          arvo={muotoileKesto(tehtyTyoaikaMin)}
          lisatieto="Arvio työvaiheiden kestoista"
          ikoni={Clock}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4" />
              Vapaat työt ({vapaat.length})
            </CardTitle>
            <CardDescription>
              Vastaanotetut työt odottavat aloitusta. Kiireellisin ensin.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {vapaat.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ei vapaita töitä juuri nyt - kaikki on jo työn alla.
              </p>
            )}
            {vapaat.map((tyo) => (
              <div key={tyo.id} className="grid gap-2 border-b pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{tyo.asiakas ?? "Ei asiakastietoa"}</p>
                    <p className="text-sm text-muted-foreground">
                      {rivitTyolle(tyo.id)
                        .map((r) => `${rivinNimi(r)} (${variNimi(r.vari_id)})`)
                        .join(", ")}
                    </p>
                  </div>
                  <AloitaTyo tyoId={tyo.id} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <KiireellisyysTapla vastaanotettu={tyo.aloitettu} rajat={asetukset} />
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="size-4" />
                    Arvioitu työaika {muotoileKesto(tyonTyoaikaMin(tyo.id))}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4" />
              Omat keskeneräiset ({omatKesken.length})
            </CardTitle>
            <CardDescription>Työt jotka olet aloittanut mutta et vielä päättänyt.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {omatKesken.length === 0 && (
              <p className="text-sm text-muted-foreground">Ei keskeneräisiä töitä.</p>
            )}
            {omatKesken.map((tyo) => (
              <div key={tyo.id} className="grid gap-1 border-b pb-3 last:border-0 last:pb-0">
                <p className="font-medium break-words">{tyo.asiakas ?? "Ei asiakastietoa"}</p>
                <p className="text-sm text-muted-foreground">
                  {rivitTyolle(tyo.id)
                    .map((r) => `${rivinNimi(r)} (${variNimi(r.vari_id)})`)
                    .join(", ")}
                </p>
                <p className="text-sm text-muted-foreground">
                  Aloitettu{" "}
                  {new Date(tyo.tyo_aloitettu ?? tyo.aloitettu).toLocaleDateString("fi-FI")} -
                  arvioitu työaika {muotoileKesto(tyonTyoaikaMin(tyo.id))}
                </p>
              </div>
            ))}
            <div>
              <Button asChild variant="outline" size="sm">
                <Link href="/tyot">Avaa työt</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
