import Link from "next/link";
import { AlertTriangle, FileText, PackageCheck, Send } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ToimittajanKuvake } from "@/components/toimittajan-kuvake";
import { cn } from "@/lib/utils";
import { muotoileEuro, KUUKAUDEN_NIMI } from "@/lib/vakiot";
import {
  kuluinaYhteensa,
  laskePienhankinnat,
  PIENHANKINNAN_RAJA_EUR,
  PIENHANKINTAKATTO_EUR,
  riviteYhteensa,
  tarkistaTasmays,
  type Kayttotarkoitus,
} from "@/lib/kulut";

import { KuitinLisays } from "./kuitin-lisays";
import { KuukaudenValinta } from "./kuukauden-valinta";

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
      .select("id")
      .gte("paivays", `${vuosi}-01-01`)
      .lt("paivays", `${vuosi + 1}-01-01`),
    supabase.from("kululuokat").select("id, nimi").eq("aktiivinen", true).order("jarjestys"),
  ]);

  const kuititIlmanRiveja = kuititVastaus.data ?? [];
  const vuodenIdt = (vuodenKuititVastaus.data ?? []).map((k) => k.id);
  const { data: vuodenRivit } = vuodenIdt.length
    ? await supabase
        .from("kuitin_rivit")
        .select("kuitti_id, teksti, brutto_eur, verokanta, kayttotarkoitus, kululuokka_id, jarjestys")
        .in("kuitti_id", vuodenIdt)
    : { data: [] };

  // Kuukausiautomaatin kokoama mutta vielä lähettämätön kausi. Ilmoitus on
  // sovelluksessa eikä sähköpostissa, ja se näkyy riippumatta siitä mitä
  // kuukautta selataan: paketti odottaa vaikka katsoisi toista kuuta.
  const { data: odottavaLuovutus } = await supabase
    .from("luovutukset")
    .select("kausi, kuitteja, kuluina_eur, tarkistukset")
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
  const kaikkiRivit = (vuodenRivit ?? []).filter((r) => kuukaudenIdt.has(r.kuitti_id));
  const kuluina = kuluinaYhteensa(kaikkiRivit);
  const yhteensa = riviteYhteensa(kaikkiRivit);

  const pienhankinnat = laskePienhankinnat(vuodenRivit ?? []);

  // Puutteelliset nostetaan esiin heti eikä piiloteta listaan: juuri ne
  // estävät kuukauden luovutuksen kirjanpitäjälle.
  const puutteelliset = kuitit.filter((k) => {
    const luokittelematta = k.kuitin_rivit.some((r) => !r.kayttotarkoitus);
    const eiRiveja = k.kuitin_rivit.length === 0;
    const tasmays = tarkistaTasmays(k.loppusumma_eur, k.kuitin_rivit);
    return luokittelematta || eiRiveja || !tasmays.tasmaa;
  });

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
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kulut</h1>
        <p className="text-sm text-muted-foreground">
          {kuitit.length} {kuitit.length === 1 ? "kuitti" : "kuittia"} ·{" "}
          {muotoileEuro(kuluina)} kuluina
          {puutteelliset.length > 0 && ` · ${puutteelliset.length} puutteellista`}
        </p>
        <div className="mt-2 h-0.5 w-full bg-korostus" />
      </div>

      <KuukaudenValinta vuosi={vuosi} kuukausi={kuukausi} />

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
        <CardHeader>
          <CardTitle className="text-base">
            {KUUKAUDEN_NIMI[kuukausi]} {vuosi}
          </CardTitle>
          <CardDescription>
            Kuluina on se osa, joka on yrityksen kulua. Erotus yhteensä-summaan on
            yksityisottoja ja luokittelemattomia rivejä.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="grid gap-0.5">
            <p className="text-xs text-muted-foreground">Kuluina</p>
            <p className="text-2xl font-semibold tabular-nums">{muotoileEuro(kuluina)}</p>
          </div>
          <div className="grid gap-0.5">
            <p className="text-xs text-muted-foreground">Yhteensä</p>
            <p className="text-2xl font-semibold tabular-nums text-muted-foreground">
              {muotoileEuro(yhteensa)}
            </p>
          </div>
        </CardContent>
      </Card>

      {puutteelliset.length > 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-warning" />
              Puutteelliset kuitit ({puutteelliset.length})
            </CardTitle>
            <CardDescription>
              Nämä estävät kuukauden luovutuksen kirjanpitäjälle.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {puutteelliset.map((kuitti) => (
              <KuittiRivi key={kuitti.id} kuitti={kuitti} />
            ))}
          </CardContent>
        </Card>
      )}

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
            {jakauma.map(([nimi, summa]) => (
              <div key={nimi} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-center gap-2">
                <span className="truncate text-xs text-muted-foreground">{nimi}</span>
                <div className="h-2 rounded-full bg-talous-neutraali">
                  <div
                    className="h-full rounded-full bg-talous-meno"
                    style={{ width: `${suurinLuokka > 0 ? (summa / suurinLuokka) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm tabular-nums">{muotoileEuro(summa)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kuitit</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {kuitit.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ei kuitteja tälle kuukaudelle. Kuvaa ensimmäinen alareunan painikkeesta.
            </p>
          )}
          {kuitit.map((kuitti) => (
            <KuittiRivi key={kuitti.id} kuitti={kuitti} />
          ))}
        </CardContent>
      </Card>

      <Button asChild variant="outline">
        <Link href={`/kulut/luovutus?vuosi=${vuosi}&kk=${kuukausi}`}>
          <Send className="size-4" />
          Luovutus kirjanpitäjälle
        </Link>
      </Button>

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

interface KuittiKortilla {
  id: string;
  toimittaja: string | null;
  paivays: string;
  loppusumma_eur: number;
  lahde: string;
  tiedosto_tyyppi: string | null;
  kuitin_rivit: { brutto_eur: number; verokanta: number | null; kayttotarkoitus: Kayttotarkoitus | null }[];
}

/**
 * Yksi kuitti listalla.
 *
 * Toimittajakohtainen ikoni tunnistaa kuitin nopeammin kuin nimi, ja
 * puutteellisen kuitin lämmin tausta erottuu ilman että riviä lukee.
 * Rivillä näkyy sekä kuitin loppusumma että se osa joka on yrityksen kulua:
 * ero on yksityisottoja, eikä sitä pidä joutua laskemaan päässä.
 */
function KuittiRivi({ kuitti }: { kuitti: KuittiKortilla }) {
  const luokittelematta = kuitti.kuitin_rivit.filter((r) => !r.kayttotarkoitus).length;
  const tasmays = tarkistaTasmays(kuitti.loppusumma_eur, kuitti.kuitin_rivit);
  const eiRiveja = kuitti.kuitin_rivit.length === 0;
  const puutteellinen = eiRiveja || luokittelematta > 0 || !tasmays.tasmaa;
  const kuluina = kuluinaYhteensa(kuitti.kuitin_rivit);

  const tila = eiRiveja
    ? "Ei rivejä"
    : luokittelematta > 0
      ? `${luokittelematta} luokittelematta`
      : !tasmays.tasmaa
        ? "Ei täsmää loppusummaan"
        : null;

  return (
    <Link
      href={`/kulut/${kuitti.id}`}
      className="flex min-w-0 items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50"
    >
      <ToimittajanKuvake toimittaja={kuitti.toimittaja} puutteellinen={puutteellinen} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {kuitti.toimittaja ?? "Toimittaja puuttuu"}
          </span>
          {kuitti.tiedosto_tyyppi === "application/pdf" && (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </span>
        <span className={cn("text-xs", puutteellinen ? "text-warning" : "text-muted-foreground")}>
          {new Date(kuitti.paivays).toLocaleDateString("fi-FI")}
          {" · "}
          {tila ?? `kuluina ${muotoileEuro(kuluina)}`}
        </span>
      </span>
      <span className="text-sm font-medium tabular-nums">
        {muotoileEuro(kuitti.loppusumma_eur)}
      </span>
    </Link>
  );
}
