import Link from "next/link";
import { AlertTriangle, PackageCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { euromaaraPuuttuu, muotoileEuro, KUUKAUDEN_NIMI } from "@/lib/vakiot";
import {
  kuluinaYhteensa,
  laskePienhankinnat,
  PIENHANKINNAN_RAJA_EUR,
  PIENHANKINTAKATTO_EUR,
  riviteYhteensa,
  tarkistaTasmays,
} from "@/lib/kulut";

import { KuitinLisays } from "./kuitin-lisays";
import { Kuittilista, type KuittiListalla } from "./kuittilista";
import { KuukaudenValinta } from "./kuukauden-valinta";
import { KulutValilehdet } from "./valilehdet";

export default async function KulutSivu({
  searchParams,
}: {
  searchParams: Promise<{ kk?: string; vuosi?: string }>;
}) {
  // Kuitit ovat yrityksen taloustietoa, joten ne ovat adminin näkymässä samoin
  // kuin hinnoittelu ja katteet.
  await vaaditaanAdmin();
  const parametrit = await searchParams;
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const nyt = new Date();
  const vuosi = Number(parametrit.vuosi) || nyt.getUTCFullYear();
  const kuukausi = Number.isInteger(Number(parametrit.kk))
    ? Math.min(Math.max(Number(parametrit.kk), 0), 11)
    : nyt.getUTCMonth();

  const alku = `${vuosi}-${String(kuukausi + 1).padStart(2, "0")}-01`;
  const loppu =
    kuukausi === 11 ? `${vuosi + 1}-01-01` : `${vuosi}-${String(kuukausi + 2).padStart(2, "0")}-01`;

  // Rivit haetaan omalla kyselyllään eikä upotettuna: kuitin ja rivin suhde ei
  // ole tyypityksessä, ja erillinen haku on sama määrä kutsuja.
  const [kuititVastaus, vuodenKuititVastaus, luokatVastaus] = await Promise.all([
    supabase
      .from("kuitit")
      .select("*")
      .gte("paivays", alku)
      .lt("paivays", loppu)
      .order("paivays", { ascending: false }),
    // Pienhankintojen katto on vuosikohtainen, joten se lasketaan koko vuodesta
    // eikä valitusta kuukaudesta.
    supabase
      .from("kuitit")
      .select("id, mitatoity_at, valuutta, kurssin_lahde")
      .gte("paivays", `${vuosi}-01-01`)
      .lt("paivays", `${vuosi + 1}-01-01`),
    supabase.from("kululuokat").select("id, nimi").eq("aktiivinen", true).order("jarjestys"),
  ]);

  const kuititIlmanRiveja = kuititVastaus.data ?? [];
  // Mitätöity kuitti näkyy listassa mutta ei summissa: se on jo luovutettu ja
  // korjattu, joten sen rivit eivät kuulu kuluihin.
  //
  // Sama koskee vieraan valuutan kuittia, jonka euromäärää ei ole vahvistettu:
  // sen euroluku on nolla, ja nolla summassa näyttäisi siltä että kuitti on
  // huomioitu. Puuttuva kerrotaan erikseen, ei piiloteta summaan.
  const vuodenKuitit = vuodenKuititVastaus.data ?? [];
  const vuodenIdt = vuodenKuitit.map((k) => k.id);
  const summiinIdt = new Set(
    vuodenKuitit
      .filter((k) => k.mitatoity_at === null && !euromaaraPuuttuu(k.valuutta, k.kurssin_lahde))
      .map((k) => k.id)
  );
  const { data: vuodenRivit } = vuodenIdt.length
    ? await supabase
        .from("kuitin_rivit")
        .select(
          "kuitti_id, teksti, brutto_eur, brutto_valuutassa, verokanta, kayttotarkoitus, kululuokka_id, jarjestys"
        )
        .in("kuitti_id", vuodenIdt)
    : { data: [] };

  // Tammikuussa muistutetaan, jos juuri päättyneeltä tilikaudelta ei otettu
  // varastotilannekuvaa. Sitä ei saa jälkikäteen: saldot ovat jo muuttuneet
  // vuoden ensimmäisistä töistä, eikä liukuva keskihinta kerro mikä se oli
  // joulukuussa.
  const edellinenTilikausi = nyt.getUTCFullYear() - 1;
  const { data: edellinenTilannekuva } =
    nyt.getUTCMonth() === 0
      ? await supabase
          .from("varastotilannekuvat")
          .select("id")
          .eq("tilikausi_paattyi", `${edellinenTilikausi}-12-31`)
          .maybeSingle()
      : { data: { id: "" } };

  // Kuukausiautomaatin kokoama mutta vielä lähettämätön kausi. Ilmoitus on
  // sovelluksessa eikä sähköpostissa, ja se näkyy riippumatta siitä mitä
  // kuukautta selataan: paketti odottaa vaikka katsoisi toista kuuta.
  const { data: odottavaLuovutus } = await supabase
    .from("luovutukset")
    .select("kausi, kuitteja, kuluina_eur")
    .eq("tila", "koottu")
    .lt("kausi", alku)
    .gt("kuitteja", 0)
    .order("kausi", { ascending: false })
    .limit(1)
    .maybeSingle();

  const luokat = new Map((luokatVastaus.data ?? []).map((l) => [l.id, l.nimi]));
  const kuukaudenIdt = new Set(kuititIlmanRiveja.map((k) => k.id));
  const kuitit = kuititIlmanRiveja.map((kuitti) => ({
    ...kuitti,
    kuitin_rivit: (vuodenRivit ?? [])
      .filter((r) => r.kuitti_id === kuitti.id)
      .sort((a, b) => a.jarjestys - b.jarjestys),
  }));

  // Kaksi lukua: kirjanpidon kannalta merkitsevä on kuluina, mutta yhteensä
  // tarvitaan täsmäytykseen. Ero on yksityisottoja ja luokittelemattomia.
  const kaikkiRivit = (vuodenRivit ?? []).filter(
    (r) => kuukaudenIdt.has(r.kuitti_id) && summiinIdt.has(r.kuitti_id)
  );
  const kuluina = kuluinaYhteensa(kaikkiRivit);
  const yhteensa = riviteYhteensa(kaikkiRivit);

  const pienhankinnat = laskePienhankinnat(
    (vuodenRivit ?? []).filter((r) => summiinIdt.has(r.kuitti_id))
  );

  // Puutteen syy kerrotaan rivillä eikä omassa laatikossaan: lista pysyy
  // aikajärjestyksessä, eikä sama kuitti näy kahdessa paikassa.
  const listalle: KuittiListalla[] = kuitit.map((kuitti) => {
    const luokittelematta = kuitti.kuitin_rivit.filter((r) => !r.kayttotarkoitus).length;
    // Täsmäytys tehdään kuitin omassa valuutassa: euromäärä voi vielä puuttua,
    // mutta rivien pitää silti summautua kuitilla lukevaan loppusummaan.
    const tasmays = tarkistaTasmays(
      kuitti.loppusumma_valuutassa ?? kuitti.loppusumma_eur,
      kuitti.kuitin_rivit.map((r) => ({ ...r, brutto_eur: r.brutto_valuutassa ?? r.brutto_eur }))
    );
    const puuttuu = euromaaraPuuttuu(kuitti.valuutta, kuitti.kurssin_lahde);
    // Mitätöityä ei enää tarvitse korjata: sen puutteet ovat historiaa.
    const puute =
      kuitti.mitatoity_at !== null
        ? null
        : puuttuu
          ? "Euromäärä puuttuu"
          : kuitti.kuitin_rivit.length === 0
            ? "Ei rivejä"
            : luokittelematta > 0
              ? "Luokittelematta"
              : !tasmays.tasmaa
                ? "Ei täsmää loppusummaan"
                : null;
    return {
      id: kuitti.id,
      toimittaja: kuitti.toimittaja,
      paivays: kuitti.paivays,
      loppusummaEur: kuitti.loppusumma_eur,
      valuutta: kuitti.valuutta,
      loppusummaValuutassa: kuitti.loppusumma_valuutassa ?? kuitti.loppusumma_eur,
      kurssinLahde: kuitti.kurssin_lahde,
      kuluinaEur: kuluinaYhteensa(kuitti.kuitin_rivit),
      onPdf: kuitti.tiedosto_tyyppi === "application/pdf",
      puute,
      mitatoity: kuitti.mitatoity_at !== null,
      mitatointiSyy: kuitti.mitatointi_syy,
    };
  });
  const puutteellisia = listalle.filter((k) => k.puute !== null).length;
  const vahvistamattomia = listalle.filter(
    (k) => !k.mitatoity && euromaaraPuuttuu(k.valuutta, k.kurssinLahde)
  ).length;
  const mitatoityja = listalle.filter((k) => k.mitatoity).length;
  const voimassaolevia = listalle.length - mitatoityja;

  // Kululuokkien jakauma on käyttäjän omaa seurantaa, ei kirjanpitoa.
  const luokittain = new Map<string, number>();
  for (const rivi of kaikkiRivit) {
    if (!rivi.kayttotarkoitus || rivi.kayttotarkoitus === "yksityisotto") continue;
    const nimi = rivi.kululuokka_id ? (luokat.get(rivi.kululuokka_id) ?? "Muut") : "Luokittelematta";
    luokittain.set(nimi, (luokittain.get(nimi) ?? 0) + rivi.brutto_eur);
  }
  const jakauma = [...luokittain.entries()].sort((a, b) => b[1] - a[1]);
  const suurinLuokka = jakauma[0]?.[1] ?? 0;

  return (
    <div className="grid gap-4">
      <KulutValilehdet />

      <Card>
        <CardContent className="grid gap-4">
          {/* Rivit rivittyvät eivätkä katkea: kuukauden nimi ja kuukauden
              summa ovat molemmat lukuja joita tullaan katsomaan, eikä
              "Marraskuu 20..." kerro kumpaakaan. Leveällä ruudulla ne ovat
              samalla rivillä vastakkain kuten ennenkin. */}
          <div className="grid gap-0.5">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
              <h1 className="text-xl font-semibold">
                {KUUKAUDEN_NIMI[kuukausi]} {vuosi}
              </h1>
              <p className="text-xl font-semibold tabular-nums">{muotoileEuro(kuluina)}</p>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm text-muted-foreground">
              <p>
                {voimassaolevia} {voimassaolevia === 1 ? "kuitti" : "kuittia"}
                {mitatoityja > 0 && ` · ${mitatoityja} mitätöity`}
              </p>
              <p>kuluina · yhteensä {muotoileEuro(yhteensa)}</p>
            </div>
          </div>

          {puutteellisia > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
              <AlertTriangle className="size-4 shrink-0" />
              {puutteellisia} {puutteellisia === 1 ? "kuitti" : "kuittia"} vaatii huomiota
            </p>
          )}

          {edellinenTilannekuva === null && (
            <p className="flex items-start gap-2 rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm text-tila-keltainen-teksti">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Tilikaudelta {edellinenTilikausi} ei ole varastotilannekuvaa. Sitä ei saa enää
                tarkasti jälkikäteen, mutta ota se silti - myöhäinen on parempi kuin puuttuva.{" "}
                <Link href={`/kulut/tilikausi?vuosi=${edellinenTilikausi}`} className="underline">
                  Avaa tilikausinäkymä
                </Link>
                .
              </span>
            </p>
          )}

          {/* Puuttuva euromäärä kerrotaan omalla lauseellaan: kuukauden summa
              on muuten oikea luku väärästä joukosta, eikä lukija tiedä sitä. */}
          {vahvistamattomia > 0 && (
            <p className="text-sm text-muted-foreground">
              {vahvistamattomia === 1
                ? "Yksi vieraan valuutan kuitti ei ole summissa mukana"
                : `${vahvistamattomia} vieraan valuutan kuittia ei ole summissa mukana`}
              : euromäärä on vahvistamatta. Syötä tililtä luettu veloitus kuitin tietoihin.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Nuolet on nimetty naapurikuukausilla: kuluva kuukausi lukee jo
          otsikossa, eikä sen toistaminen kertoisi mitään uutta. */}
      <KuukaudenValinta vuosi={vuosi} kuukausi={kuukausi} naapurit />

      {odottavaLuovutus && (
        <Card className="border-korostus">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="size-4 text-korostus" />
              {KUUKAUDEN_NIMI[Number(odottavaLuovutus.kausi.slice(5, 7)) - 1]}n paketti valmis
            </CardTitle>
            <CardDescription>
              {odottavaLuovutus.kuitteja} kuittia, {muotoileEuro(odottavaLuovutus.kuluina_eur)}{" "}
              kuluina. Tarkista ja lähetä.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link
                href={`/kulut/luovutus?vuosi=${odottavaLuovutus.kausi.slice(0, 4)}&kk=${Number(odottavaLuovutus.kausi.slice(5, 7)) - 1}`}
              >
                Avaa luovutus
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Kuittilista kuitit={listalle} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pienhankinnat {vuosi}</CardTitle>
          <CardDescription>
            Verottomista hinnoista. Yli {muotoileEuro(PIENHANKINNAN_RAJA_EUR)} ostos ei ole
            pienhankinta vaan poistettavaa kalustoa, joten se ei kuluta kattoa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-semibold tabular-nums">
              {muotoileEuro(pienhankinnat.kaytettyEur)}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              / {muotoileEuro(PIENHANKINTAKATTO_EUR)}
            </span>
          </div>
          <Progress value={pienhankinnat.osuus * 100} />
          {pienhankinnat.osuus >= 0.8 && (
            <p className="text-sm text-warning">Katto on lähellä täyttymistään.</p>
          )}
          {pienhankinnat.ylisuuret.length > 0 && (
            <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-xs">
              <span className="font-medium">
                Yli {muotoileEuro(PIENHANKINNAN_RAJA_EUR)} ostokset
              </span>
              {pienhankinnat.ylisuuret.map((y) => (
                <span key={`${y.teksti}-${y.nettoEur}`} className="text-muted-foreground">
                  {y.teksti} - {muotoileEuro(y.nettoEur)} (veroton)
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {jakauma.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kululuokat</CardTitle>
            <CardDescription>Oma seuranta, ei kirjanpidon jaottelu.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {/* Puhelimella kaksi saraketta ja palkki omalla rivillään: kolmen
                sarakkeen rivissä kiinteä 8rem nimisarake söi 240 pikselin
                leveydeltä puolet, ja palkille jäi parikymmentä pikseliä - eli
                juuri se osa joka kertoo suhteet. Kiinteä leveys on siksi vasta
                sm-koosta ylöspäin, jossa tilaa on. */}
            {jakauma.map(([nimi, summa]) => (
              <div
                key={nimi}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:gap-2"
              >
                <span className="col-start-1 row-start-1 truncate text-xs text-muted-foreground">
                  {nimi}
                </span>
                <div className="col-span-2 col-start-1 row-start-2 h-2 rounded-full bg-talous-neutraali sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <div
                    className="h-full rounded-full bg-talous-meno"
                    style={{ width: `${suurinLuokka > 0 ? (summa / suurinLuokka) * 100 : 0}%` }}
                  />
                </div>
                <span className="col-start-2 row-start-1 justify-self-end text-sm tabular-nums sm:col-start-3">
                  {muotoileEuro(summa)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!asetukset.alv_rekisterissa && (
        <p className="text-xs text-muted-foreground">
          Yritys ei ole ALV-rekisterissä, joten ALV-sarakkeet ovat piilossa. Tiedot poimitaan
          ja tallennetaan silti: ne tarvitaan täsmäytykseen, ja rekisteröitymisen tullessa
          ajankohtaiseksi historia on valmiina.
        </p>
      )}

      <KuitinLisays />
    </div>
  );
}
