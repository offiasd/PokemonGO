import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { kaytettavatKayttotarkoitukset, opinAvain, type Kayttotarkoitus } from "@/lib/kulut";

import { KulutValilehdet } from "../valilehdet";
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

  return (
    <div className="grid gap-4">
      <KulutValilehdet kuittiId={kuitti.id} kausi={kuitti.paivays} />

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
              loppusummaEur: kuitti.loppusumma_eur,
              muistiinpano: kuitti.muistiinpano,
              tila: kuitti.tila,
              alvErittely: kuitti.alv_erittely,
              poiminnanTila: kuitti.poiminnan_tila,
            }}
            rivit={rivit.map((r) => ({
              avain: r.id,
              teksti: r.teksti,
              maara: r.maara,
              bruttoEur: r.brutto_eur,
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
