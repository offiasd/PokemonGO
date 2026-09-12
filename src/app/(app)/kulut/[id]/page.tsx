import Link from "next/link";
import { notFound } from "next/navigation";
import { PackagePlus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  kaytettavatKayttotarkoitukset,
  nettohinta,
  opinAvain,
  KULUKSI_LASKETTAVAT,
  PIENHANKINNAN_RAJA_EUR,
  type Kayttotarkoitus,
} from "@/lib/kulut";

import { KulutValilehdet } from "../valilehdet";
import { KalustoonSiirto, type SiirrettavaRivi } from "./kalustoon-siirto";
import { KaksoiskappaleVaroitus, type Epailty } from "./kaksoiskappale-varoitus";
import { KuitinLiitteet, type LiiteNakyma } from "./kuitin-liitteet";
import { KuitinLomake } from "./kuitin-lomake";
import { KuitinPoisto } from "./kuitin-poisto";

/** Allekirjoitetun linkin voimassaolo. Kuitit ovat yksityisiä. */
const LINKIN_VOIMASSAOLO_S = 60 * 60;

export default async function KuittiSivu({ params }: { params: Promise<{ id: string }> }) {
  await vaaditaanAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const [{ data: kuitti }, luokatVastaus, opitutVastaus] = await Promise.all([
    supabase.from("kuitit").select("*").eq("id", id).single(),
    supabase.from("kululuokat").select("id, nimi").eq("aktiivinen", true).order("jarjestys"),
    supabase.from("kuittirivin_oppi").select("teksti, kayttotarkoitus, kululuokka_id"),
  ]);

  if (!kuitti) notFound();

  // Kuitilla voi olla monta sivua: pitkä kassakuitti ei mahdu yhteen kuvaan.
  // Kuitit ovat yksityisessä ämpärissä, joten jokainen sivu luetaan
  // aikarajoitetulla allekirjoitetulla linkillä eikä julkisella osoitteella.
  const { data: liiteRivit } = await supabase
    .from("kuitin_liitteet")
    .select("id, polku, tyyppi")
    .eq("kuitti_id", id)
    .order("jarjestys")
    .order("created_at");

  const liitteet: LiiteNakyma[] = await Promise.all(
    (liiteRivit ?? []).map(async (liite) => {
      const { data } = await supabase.storage
        .from("kuitit")
        .createSignedUrl(liite.polku, LINKIN_VOIMASSAOLO_S);
      return { id: liite.id, tyyppi: liite.tyyppi, url: data?.signedUrl ?? null };
    })
  );

  const luokat = luokatVastaus.data ?? [];
  const opitut = Object.fromEntries(
    (opitutVastaus.data ?? []).map((o) => [
      opinAvain(o.teksti),
      { kayttotarkoitus: o.kayttotarkoitus as Kayttotarkoitus, kululuokkaId: o.kululuokka_id },
    ])
  );

  const { data: rivitData } = await supabase
    .from("kuitin_rivit")
    .select("*")
    .eq("kuitti_id", id)
    .order("jarjestys");
  const rivit = rivitData ?? [];

  // Maalikuitti tunnistetaan kolmella tavalla: tunnettu maalitoimittaja,
  // Maalit ja lakat -kululuokka riveillä, tai käsin merkintä. Yksikin riittää,
  // koska kaikki kolme kertovat samaa - tästä kuitista tuli maalia hyllyyn.
  const [{ data: toimittaja }, { data: maaliluokka }] = await Promise.all([
    kuitti.toimittaja_id
      ? supabase
          .from("toimittajat")
          .select("on_maalitoimittaja")
          .eq("id", kuitti.toimittaja_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("kululuokat").select("id").ilike("nimi", "maalit ja lakat").maybeSingle(),
  ]);

  const onMaalikuitti =
    kuitti.on_maaliostos ||
    toimittaja?.on_maalitoimittaja === true ||
    (maaliluokka !== null && rivit.some((r) => r.kululuokka_id === maaliluokka.id));

  // Yli 1 200 euron rivit ovat kalustoa, eivät pienhankintoja. Nettohinta on
  // sama laskenta kuin pienhankintojen katossa: kuitilla lukeva summa on
  // brutto, ja hankintameno on aina ALV 0 %.
  const { data: kalustoRivit } = await supabase
    .from("kalusto")
    .select("kuitin_rivi_id")
    .eq("kuitti_id", id);
  const siirretytIdt = new Set(
    (kalustoRivit ?? []).map((k) => k.kuitin_rivi_id).filter((r): r is string => r !== null)
  );
  const kalustoonSiirrettavat: SiirrettavaRivi[] = rivit
    .filter(
      (r) =>
        r.kayttotarkoitus !== null &&
        KULUKSI_LASKETTAVAT.includes(r.kayttotarkoitus as Kayttotarkoitus) &&
        nettohinta(r.brutto_eur, r.verokanta) > PIENHANKINNAN_RAJA_EUR
    )
    .map((r) => ({
      id: r.id,
      teksti: r.teksti,
      nettoEur: nettohinta(r.brutto_eur, r.verokanta),
      siirretty: siirretytIdt.has(r.id),
    }));

  // Kaksoiskappale-epäily haetaan kannasta, jotta sääntö on sama sekä tässä
  // että luovutuksen tarkistuksissa.
  const { data: epailyt } = await supabase.rpc("kuitin_kaksoiskappaleet", { p_kuitti_id: id });
  const kaksoiskappaleet: Epailty[] = (epailyt ?? []).map((e) => ({
    id: e.id,
    toimittaja: e.toimittaja,
    paivays: e.paivays,
    loppusummaEur: e.loppusumma_eur,
    tositenumero: e.tositenumero,
    varmuus: e.varmuus,
  }));

  return (
    <div className="grid gap-4">
      <KulutValilehdet kuittiId={kuitti.id} kausi={kuitti.paivays} />

      {/* Varastotäydennys on ehdotus jonka admin hyväksyy, ei automaatti:
          kuitilla lukee tuotenimi ja kannassa on väri, ja väärä osuma päätyisi
          suoraan saldoihin ja kilohintoihin. */}
      {onMaalikuitti && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {kuitti.maaliera_id ? "Varastotäydennys tehty" : "Maaliostos"}
              </p>
              <p className="text-sm text-muted-foreground">
                {kuitti.maaliera_id
                  ? "Kuitista on luotu erä, ja saldot on päivitetty."
                  : "Kuitin rivit voi käydä läpi ja kirjata varastoon."}
              </p>
            </div>
            <Button asChild variant={kuitti.maaliera_id ? "outline" : "default"}>
              <Link href={kuitti.maaliera_id ? "/varit/erat" : `/kulut/${id}/taydennys`}>
                <PackagePlus className="size-4" />
                {kuitti.maaliera_id ? "Avaa erät" : "Luo varastotäydennys"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <KalustoonSiirto rivit={kalustoonSiirrettavat} />

      <KaksoiskappaleVaroitus
        kuitti={{
          toimittaja: kuitti.toimittaja,
          paivays: kuitti.paivays,
          loppusummaEur: kuitti.loppusumma_eur,
          tositenumero: kuitti.tositenumero,
        }}
        epaillyt={kaksoiskappaleet}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        {/* Kapealla näytöllä rivit ensin: kuitti luetaan riveiltä, ja kuva on
            tarkistusta varten. Leveällä kuva on rinnalla omassa palstassaan. */}
        <Card className="order-2 lg:order-none lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="text-base">
              {liitteet.length > 1 ? `Kuitti (${liitteet.length} sivua)` : "Kuitti"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KuitinLiitteet
              kuittiId={kuitti.id}
              liitteet={liitteet}
              luovutettu={kuitti.luovutettu_at !== null}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Säilytettävä{" "}
              {new Date(kuitti.sailytettava_asti).toLocaleDateString("fi-FI")} asti
              (kirjanpitolaki 2:10 §).
            </p>

            <div className="mt-3 border-t pt-3">
              <KuitinPoisto
                kuittiId={kuitti.id}
                toimittaja={kuitti.toimittaja}
                paivays={kuitti.paivays}
                loppusummaEur={kuitti.loppusumma_eur}
                valuutta={kuitti.valuutta}
                loppusummaValuutassa={kuitti.loppusumma_valuutassa ?? kuitti.loppusumma_eur}
                kurssinLahde={kuitti.kurssin_lahde}
                luovutettuAt={kuitti.luovutettu_at}
                mitatoityAt={kuitti.mitatoity_at}
                mitatointiSyy={kuitti.mitatointi_syy}
              />
            </div>
          </CardContent>
        </Card>

        <div className="order-1 lg:order-none">
          <KuitinLomake
            kuitti={{
              id: kuitti.id,
              toimittaja: kuitti.toimittaja,
              paivays: kuitti.paivays,
              maksupaiva: kuitti.maksupaiva,
              loppusummaValuutassa: kuitti.loppusumma_valuutassa ?? kuitti.loppusumma_eur,
              muistiinpano: kuitti.muistiinpano,
              tila: kuitti.tila,
              alvErittely: kuitti.alv_erittely,
              poiminnanTila: kuitti.poiminnan_tila,
              tositenumero: kuitti.tositenumero,
              tositetyyppi: kuitti.tositetyyppi,
              valuutta: kuitti.valuutta,
              loppusummaEur: kuitti.loppusumma_eur,
              todellinenEur: kuitti.todellinen_eur,
              valuuttakurssi: kuitti.valuuttakurssi,
              kurssinLahde: kuitti.kurssin_lahde,
            }}
            rivit={rivit.map((r) => ({
              avain: r.id,
              teksti: r.teksti,
              maara: r.maara,
              yksikko: r.yksikko,
              bruttoEur: r.brutto_valuutassa ?? r.brutto_eur,
              // Euromäärä on olemassa vasta kun muunnos on tehty. Ilman sitä
              // brutto_eur on nolla, eikä nollaa saa näyttää euromääränä.
              bruttoEurLaskettu:
                kuitti.valuutta !== "EUR" && kuitti.kurssin_lahde === null
                  ? null
                  : r.brutto_eur,
              verokanta: r.verokanta,
              kayttotarkoitus: r.kayttotarkoitus,
              kululuokkaId: r.kululuokka_id,
              muistiinpano: r.muistiinpano,
            }))}
            luokat={luokat}
            opitut={opitut}
            kayttotarkoitukset={kaytettavatKayttotarkoitukset(asetukset)}
            naytaAlv={asetukset.alv_rekisterissa}
            onTosite={Boolean(kuitti.tiedosto_polku)}
          />
        </div>
      </div>
    </div>
  );
}
