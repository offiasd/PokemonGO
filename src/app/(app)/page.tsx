import Link from "next/link";
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Hourglass,
  Package,
  Paintbrush,
  Wrench,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaldoPalkki } from "@/components/saldo-palkki";
import { KiireellisyysTapla } from "@/components/kiireellisyys-tapla";
import {
  KUUKAUDEN_NIMI,
  Vuosigraafi,
  type GraafinKuukausi,
  type GraafinMittari,
} from "@/components/vuosigraafi";
import { JAKSOT, OLETUSJAKSO, jaksonAlku, jaksonNimi } from "@/lib/jaksot";
import { cn } from "@/lib/utils";
import {
  kiireellisyys,
  muotoileEuro,
  muotoileKilot,
  muotoileProsentti,
  odotusPaivat,
} from "@/lib/vakiot";

import { MaalaajanEtusivu } from "./maalaajan-etusivu";
import { JaksoValinta } from "./jakso-valinta";
import { GraafinValinnat } from "./graafin-valinnat";

/** Yhteenvedon yksittäinen luku. Sama ladelma kuin maalaajan etusivulla. */
function Luku({
  otsikko,
  arvo,
  lisatieto,
  ikoni: Ikoni,
  korosta,
}: {
  otsikko: string;
  arvo: string;
  lisatieto: string;
  ikoni: typeof Clock;
  korosta?: boolean;
}) {
  return (
    <Card className={cn(korosta && "border-destructive/50")}>
      <CardContent className="grid gap-1 py-6">
        <div
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium",
            korosta ? "text-destructive" : "text-muted-foreground"
          )}
        >
          <Ikoni className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{otsikko}</span>
        </div>
        <p className={cn("text-2xl font-bold", korosta && "text-destructive")}>{arvo}</p>
        <p className="text-xs text-muted-foreground">{lisatieto}</p>
      </CardContent>
    </Card>
  );
}

/** Talousyhteenvedon rivi: otsikko pienellä, luku sen alla. */
function Summa({ otsikko, arvo, lisatieto }: { otsikko: string; arvo: string; lisatieto?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <p className="text-xs text-muted-foreground">{otsikko}</p>
      <p className="truncate text-lg font-semibold tabular-nums">{arvo}</p>
      {lisatieto && <p className="text-xs text-muted-foreground">{lisatieto}</p>}
    </div>
  );
}

export default async function EtusivuSivu({
  searchParams,
}: {
  searchParams: Promise<{ jakso?: string; vuosi?: string; graafi?: string }>;
}) {
  const kayttaja = await vaaditaanKayttaja();
  const parametrit = await searchParams;

  // Maalaajalle etusivu on oma työnäkymä: omat työt ja vapaat työt, joista voi
  // poimia seuraavan. Adminin näkymä on koko maalaamon tilannekuva.
  if (kayttaja.role !== "admin") {
    return <MaalaajanEtusivu kayttaja={kayttaja} jakso={parametrit.jakso} />;
  }

  const valittuJakso = JAKSOT.some((j) => j.arvo === parametrit.jakso)
    ? parametrit.jakso!
    : OLETUSJAKSO;
  const alku = jaksonAlku(valittuJakso);
  const mittari: GraafinMittari = parametrit.graafi === "euroa" ? "euroa" : "tyot";

  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const nykyinenVuosi = new Date().getUTCFullYear();
  const pyydettyVuosi = Number(parametrit.vuosi);
  const vuosi =
    Number.isInteger(pyydettyVuosi) && pyydettyVuosi >= 2000 && pyydettyVuosi <= nykyinenVuosi
      ? pyydettyVuosi
      : nykyinenVuosi;

  // Graafi ja jakson yhteenveto ovat eri rajauksia samasta näkymästä, joten ne
  // haetaan erikseen eikä koko työhistoriaa vedetä sivulle.
  const jaksonKysely = supabase.from("tyojen_talous").select("*");
  const [
    tyotVastaus,
    profiilitVastaus,
    jaksonTalousVastaus,
    vuodenTalousVastaus,
    vanhinVastaus,
    halytyksetVastaus,
    kaytetyinVastaus,
    variMaaraVastaus,
    osaMaaraVastaus,
  ] = await Promise.all([
    supabase.from("tyot").select("*").neq("tila", "valmis").order("aloitettu"),
    supabase.from("profiles").select("id, full_name"),
    alku ? jaksonKysely.gte("ajankohta", alku.toISOString()) : jaksonKysely,
    supabase
      .from("tyojen_talous")
      .select("kuukausi, loppusumma_eur")
      .gte("ajankohta", `${vuosi}-01-01T00:00:00Z`)
      .lt("ajankohta", `${vuosi + 1}-01-01T00:00:00Z`),
    supabase.from("tyojen_talous").select("ajankohta").order("ajankohta").limit(1),
    supabase
      .from("varit_halytykset")
      .select(
        "id, nimi, saldo_g, varattu_g, halytysraja_g, taysiraja_g, efektiivinen_halytysraja_g"
      )
      .order("saldo_g", { ascending: true }),
    supabase.rpc("kuukauden_kaytetyin_vari"),
    supabase.from("varit").select("id", { count: "exact", head: true }).eq("aktiivinen", true),
    supabase.from("osat").select("id", { count: "exact", head: true }).eq("aktiivinen", true),
  ]);

  const kesken = tyotVastaus.data ?? [];
  const profiilit = profiilitVastaus.data ?? [];
  const jaksonTyot = jaksonTalousVastaus.data ?? [];
  const halytykset = halytyksetVastaus.data ?? [];
  const kaytetyin = kaytetyinVastaus.data?.[0] ?? null;

  const profiiliNimi = (id: string | null) =>
    profiilit.find((p) => p.id === id)?.full_name ?? "Ei tekijää";

  // Kesken olevat työt tulevat samasta kyselystä, joten lista on aina samassa
  // järjestyksessä kuin Työt-sivulla: vanhin ensin eli kiireellisin ensin.
  const odottaa = kesken.filter((t) => t.tila === "vastaanotettu");
  const kaynnissa = kesken.filter((t) => t.tila === "vaiheessa");

  // Myöhässä lasketaan vastaanottohetkestä myös keskeneräisille: asiakkaan
  // odotus alkaa siitä kun osa tuotiin, ei siitä kun maalaus alkoi.
  const onMyohassa = (tyo: { aloitettu: string }) =>
    kiireellisyys(odotusPaivat(tyo.aloitettu), asetukset) === "myohassa";
  const myohassa = kesken.filter(onMyohassa);
  const vanhinOdottava = odottaa[0] ?? null;

  const summa = (haku: (t: (typeof jaksonTyot)[number]) => number) =>
    jaksonTyot.reduce((s, t) => s + haku(t), 0);
  const laskutus = summa((t) => t.loppusumma_eur);
  const alennukset = summa((t) => t.alennus_eur);
  const maalikustannus = summa((t) => t.maalikustannus_eur);
  const kate = laskutus - maalikustannus;
  const kulutusG = summa((t) => t.kulutus_g);
  const kateProsentti = laskutus > 0 ? (kate / laskutus) * 100 : 0;

  // Graafi näyttää aina kaikki 12 kuukautta, myös tyhjät - muuten vuoden
  // hiljaiset kuukaudet eivät erotu siitä, ettei niitä ole piirretty.
  const kuukaudet: GraafinKuukausi[] = Array.from({ length: 12 }, (_, i) => ({
    kuukausi: i,
    tyot: 0,
    euroa: 0,
  }));
  for (const rivi of vuodenTalousVastaus.data ?? []) {
    const kuukausi = new Date(rivi.kuukausi).getUTCMonth();
    kuukaudet[kuukausi].tyot += 1;
    kuukaudet[kuukausi].euroa += rivi.loppusumma_eur;
  }
  const kiireisin = [...kuukaudet].sort((a, b) => b.tyot - a.tyot)[0];

  const vanhinAjankohta = vanhinVastaus.data?.[0]?.ajankohta;
  const pieninVuosi = vanhinAjankohta
    ? Math.min(new Date(vanhinAjankohta).getUTCFullYear(), nykyinenVuosi)
    : nykyinenVuosi;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Etusivu</h1>
          <p className="text-muted-foreground">
            Maalaamon tilanne: työjono, laskutus ja värivarasto.
          </p>
        </div>
        <JaksoValinta valittu={valittuJakso} />
      </div>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Työt juuri nyt</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Luku
            otsikko="Aloittamatta"
            arvo={String(odottaa.length)}
            lisatieto={
              vanhinOdottava
                ? `Vanhin odottanut ${odotusPaivat(vanhinOdottava.aloitettu)} vrk`
                : "Jono on tyhjä"
            }
            ikoni={Hourglass}
          />
          <Luku
            otsikko="Käynnissä"
            arvo={String(kaynnissa.length)}
            lisatieto={
              kaynnissa.length === 0
                ? "Kukaan ei maalaa nyt"
                : `${new Set(kaynnissa.map((t) => t.aloitti_id)).size} tekijällä`
            }
            ikoni={Paintbrush}
          />
          <Luku
            otsikko="Myöhässä"
            arvo={String(myohassa.length)}
            lisatieto={`Yli ${asetukset.vastaanotto_kriittinen_paivat} vrk vastaanotosta`}
            ikoni={AlertTriangle}
            korosta={myohassa.length > 0}
          />
          <Luku
            otsikko="Valmistunut"
            arvo={String(jaksonTyot.length)}
            lisatieto={jaksonNimi(valittuJakso)}
            ikoni={CheckCircle2}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Laskutus ja kulutus</CardTitle>
          <CardDescription>
            Valmistuneet työt - {jaksonNimi(valittuJakso).toLowerCase()}. Arkistoidut työt ovat
            mukana.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
          <Summa
            otsikko="Asiakkailta laskutettu"
            arvo={muotoileEuro(laskutus)}
            lisatieto={alennukset > 0 ? `Alennuksia ${muotoileEuro(alennukset)}` : undefined}
          />
          <Summa otsikko="Maalikustannus" arvo={muotoileEuro(maalikustannus)} />
          <Summa
            otsikko="Kate maalin jälkeen"
            arvo={muotoileEuro(kate)}
            lisatieto={laskutus > 0 ? muotoileProsentti(kateProsentti) : undefined}
          />
          <Summa otsikko="Maalia kulunut" arvo={muotoileKilot(kulutusG)} />
          <Summa
            otsikko="Keskihinta / työ"
            arvo={jaksonTyot.length > 0 ? muotoileEuro(laskutus / jaksonTyot.length) : "-"}
            lisatieto={`${jaksonTyot.length} työtä`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-muted-foreground" />
              Vuosi kuukausittain
            </CardTitle>
            <CardDescription>
              {kiireisin.tyot > 0
                ? `Kiireisin kuukausi oli ${KUUKAUDEN_NIMI[kiireisin.kuukausi].toLowerCase()} - ${kiireisin.tyot} valmistunutta työtä.`
                : "Milloin on ollut kiireisintä - tammikuusta joulukuuhun."}
            </CardDescription>
          </div>
          <GraafinValinnat
            vuosi={vuosi}
            mittari={mittari}
            suurinVuosi={nykyinenVuosi}
            pieninVuosi={pieninVuosi}
          />
        </CardHeader>
        <CardContent>
          <Vuosigraafi
            kuukaudet={kuukaudet}
            mittari={mittari}
            korostaKuukausi={vuosi === nykyinenVuosi ? new Date().getUTCMonth() : undefined}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paintbrush className="size-4 text-primary" />
              Käynnissä olevat työt
            </CardTitle>
            <CardDescription>Kuka maalaa mitäkin juuri nyt.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {kaynnissa.length === 0 && (
              <p className="text-sm text-muted-foreground">Yksikään työ ei ole työn alla.</p>
            )}
            {kaynnissa.map((tyo) => (
              <Link
                key={tyo.id}
                href="/tyot"
                className="grid gap-0.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{tyo.asiakas ?? "Ei asiakasta"}</span>
                  <Badge variant={onMyohassa(tyo) ? "destructive" : "secondary"} className="shrink-0">
                    {odotusPaivat(tyo.aloitettu)} vrk
                  </Badge>
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  Tekijä: {profiiliNimi(tyo.aloitti_id)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4 text-muted-foreground" />
              Odottaa aloitusta
            </CardTitle>
            <CardDescription>Vastaanotetut työt, pisimpään odottanut ensin.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {odottaa.length === 0 && (
              <p className="text-sm text-muted-foreground">Ei aloittamattomia töitä.</p>
            )}
            {odottaa.slice(0, 5).map((tyo) => (
              <Link
                key={tyo.id}
                href="/tyot"
                className="grid gap-0.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
              >
                <span className="truncate font-medium">{tyo.asiakas ?? "Ei asiakasta"}</span>
                <KiireellisyysTapla vastaanotettu={tyo.aloitettu} rajat={asetukset} />
              </Link>
            ))}
            {odottaa.length > 5 && (
              <Link href="/tyot" className="text-sm text-primary hover:underline">
                Katso kaikki {odottaa.length} työtä
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-warning" />
              Värivarastohälytykset
            </CardTitle>
            <CardDescription>Värit joiden saldo on hälytysrajalla tai sen alle.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {halytykset.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ei hälytyksiä juuri nyt - kaikki saldot ovat riittävät.
              </p>
            )}
            {halytykset.map((vari) => (
              <Link key={vari.id} href={`/varit/${vari.id}`} className="grid gap-1">
                <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{vari.nimi}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {vari.saldo_g.toLocaleString("fi-FI")} g / hälytys{" "}
                    {vari.efektiivinen_halytysraja_g.toLocaleString("fi-FI")} g
                  </span>
                </div>
                <SaldoPalkki
                  saldoG={vari.saldo_g}
                  varattuG={vari.varattu_g}
                  halytysrajaG={vari.halytysraja_g}
                  taysirajaG={vari.taysiraja_g}
                  oletusHalytysG={asetukset.oletus_halytysraja_g}
                  oletusTaysiG={asetukset.oletus_taysiraja_g}
                />
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="size-4 text-primary" />
                Kuukauden käytetyin väri
              </CardTitle>
              <CardDescription>Eniten kulutettu väri kuluvana kuukautena.</CardDescription>
            </CardHeader>
            <CardContent>
              {!kaytetyin && (
                <p className="text-sm text-muted-foreground">
                  Ei vielä maalaustapahtumia tältä kuukaudelta.
                </p>
              )}
              {kaytetyin && (
                <div className="grid gap-3">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xl font-semibold">
                      {kaytetyin.vari_nimi}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {kaytetyin.tapahtumia} tapahtumaa
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Yhteensä{" "}
                    <span className="font-medium text-foreground">
                      {muotoileKilot(kaytetyin.yhteensa_g)}
                    </span>{" "}
                    käytetty
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Luku
              otsikko="Aktiiviset värit"
              arvo={String(variMaaraVastaus.count ?? 0)}
              lisatieto="Käytettävissä"
              ikoni={Paintbrush}
            />
            <Luku
              otsikko="Aktiiviset osat"
              arvo={String(osaMaaraVastaus.count ?? 0)}
              lisatieto="Hinnastossa"
              ikoni={Wrench}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
