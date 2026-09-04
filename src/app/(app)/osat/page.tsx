import Link from "next/link";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { ilikeHakuehto } from "@/lib/supabase/hakuehto";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { haeAjoneuvotyypit } from "@/lib/supabase/ajoneuvotyypit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { rajauksenTyyli, siistiRajaus } from "@/lib/kuvarajaus";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ajoneuvotyypinNimi, muotoileValiEuro, SIVUKOKO, rajaaSivu } from "@/lib/vakiot";
import type { AjoneuvoTyyppi, TyoVaihe } from "@/lib/supabase/database.types";

import { Sivutus } from "@/components/sivutus";

import { OsienSuodattimet } from "./osien-suodattimet";
import { TallennusIlmoitus } from "./tallennus-ilmoitus";
import { laskeKategoriaKustannukset, laskeTyokustannusKerroksittain } from "./kustannusarvio";

interface Hakuparametrit {
  q?: string;
  ajoneuvotyyppi?: string;
  naytaPoistetut?: string;
  sivu?: string;
  ilmoitus?: string;
}

export default async function OsatSivu({
  searchParams,
}: {
  searchParams: Promise<Hakuparametrit>;
}) {
  const { q, ajoneuvotyyppi, naytaPoistetut, sivu } = await searchParams;
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();
  const ajoneuvotyypit = await haeAjoneuvotyypit();

  let kysely = supabase.from("osat").select("*").order("nimi", { ascending: true });

  if (!(naytaPoistetut === "1" && kayttaja.role === "admin")) {
    kysely = kysely.eq("aktiivinen", true);
  }
  if (ajoneuvotyyppi) {
    kysely = kysely.eq("ajoneuvotyyppi", ajoneuvotyyppi as AjoneuvoTyyppi);
  }
  if (q) {
    kysely = kysely.or(ilikeHakuehto(["nimi", "lisatiedot", "hakusanat"], q));
  }

  const [
    osatVastaus,
    variVastaus,
    variKategoriaVastaus,
    kategoriahintaVastaus,
    tyovaiheetVastaus,
    tuntiveloitusVastaus,
  ] = await Promise.all([
    kysely,
    supabase.from("varit").select("id, nimi, alkupera").eq("aktiivinen", true).order("nimi"),
    supabase.from("vari_kategoriat").select("vari_id, maali_tyyppi"),
    supabase.from("osa_kategoriahinnat").select("*"),
    supabase
      .from("osa_tyovaiheet")
      .select("osa_id, vaihe, arvioitu_kesto_min")
      .eq("tarvitaan", true),
    supabase.from("tuntiveloitukset").select("vaihe, tuntihinta"),
  ]);

  const kaikkiOsat = osatVastaus.data ?? [];

  // Sivutus viipaloidaan haun jälkeen: näin hintaskaalat lasketaan vain sivulla
  // näkyville osille eikä koko listalle.
  const sivuja = Math.max(1, Math.ceil(kaikkiOsat.length / SIVUKOKO));
  const nykyinenSivu = rajaaSivu(sivu, sivuja);
  const osat = kaikkiOsat.slice((nykyinenSivu - 1) * SIVUKOKO, nykyinenSivu * SIVUKOKO);

  // Näytetään korteissa asiakashinta-asteikko (halvin-kallein sellinen kategoria)
  // kaikille käyttäjärooleille - kyseessä on asiakkaalle näkyvä hinta, ei
  // sisäinen kustannustieto. Samalla laskentaperusteella kuin osan omalla
  // sivulla, mutta työkustannus lasketaan tässä JS:ssä RPC-kutsujen sijaan,
  // jotta listasivu ei tee erillistä tietokantakutsua jokaiselle osalle.
  const hintaskaalat = new Map<string, { min: number; max: number }>();
  if (osat.length > 0) {
    const varitHinnoin = await Promise.all(
      (variVastaus.data ?? []).map(async (vari) => {
        const { data } = await supabase.rpc("vari_kokonaishinta", { p_vari_id: vari.id });
        return {
          id: vari.id,
          nimi: vari.nimi,
          alkupera: vari.alkupera,
          kokonaishinta: data ?? 0,
        };
      })
    );

    const tuntiveloitukset = new Map<TyoVaihe, number>();
    for (const t of tuntiveloitusVastaus.data ?? []) {
      if (t.vaihe) tuntiveloitukset.set(t.vaihe, t.tuntihinta);
    }

    for (const osa of osat) {
      const omatVaiheet = (tyovaiheetVastaus.data ?? []).filter((v) => v.osa_id === osa.id);
      const tyokustannusKerroksittain = laskeTyokustannusKerroksittain(
        omatVaiheet,
        tuntiveloitukset,
        asetukset.yleinen_tuntihinta
      );
      const omatKategoriahinnat = (kategoriahintaVastaus.data ?? []).filter(
        (k) => k.osa_id === osa.id
      );

      const rivit = laskeKategoriaKustannukset({
        osa,
        asetukset,
        tyokustannusKerroksittain,
        kategoriahinnat: omatKategoriahinnat,
        varit: varitHinnoin,
        variKategoriat: variKategoriaVastaus.data ?? [],
      });

      // Hintaskaala rakennetaan adminin asettamista kiinteistä kategoriahinnoista
      // ja vain niiltä osin kuin niitä ei ole asetettu, lasketusta
      // suositushinnasta. Rivi tietää itse oman kiinteän hintansa, joten
      // lakattu vaihtoehto ("Perusvärit + lakkaus") käyttää sille erikseen
      // asetettua hintaa.
      if (rivit.length > 0) {
        const rajat = rivit.map((r) =>
          r.kiinteaHinta != null
            ? { min: r.kiinteaHinta, max: r.kiinteaHinta }
            : { min: r.suositusMin, max: r.suositusMax }
        );
        hintaskaalat.set(osa.id, {
          min: Math.min(...rajat.map((r) => r.min)),
          max: Math.max(...rajat.map((r) => r.max)),
        });
      }
    }
  }

  return (
    <div className="grid gap-6">
      <TallennusIlmoitus />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Osat</h1>
          <p className="text-muted-foreground">
            Maalattavat osat: autot, mopot ja moottoripyörät.
          </p>
        </div>
        {kayttaja.role === "admin" && (
          <Button asChild>
            <Link href="/osat/uusi">
              <Plus className="size-4" />
              Lisää osa
            </Link>
          </Button>
        )}
      </div>

      <OsienSuodattimet
        naytaPoistetutValinta={kayttaja.role === "admin"}
        ajoneuvotyypit={ajoneuvotyypit}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {kaikkiOsat.length} {kaikkiOsat.length === 1 ? "osa" : "osaa"}
          {sivuja > 1 && ` - sivu ${nykyinenSivu}/${sivuja}`}
        </p>
        <Sivutus sivu={nykyinenSivu} sivuja={sivuja} />
      </div>

      {/* Kaksi osaa rinnakkain myös puhelimessa - yksi kortti per rivi jätti
          puolet leveydestä tyhjäksi ja pakotti selaamaan pitkään. */}
      <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {osat.map((osa) => {
          const hinta = hintaskaalat.get(osa.id);
          return (
            <Link key={osa.id} href={`/osat/${osa.id}`} className="block h-full">
              <Card
                className={cn(
                  // Kuva vie koko kortin, joten kortti on pelkkä kuvasuhteinen
                  // kehys ilman omaa pehmustetta. 3/4 antaa tekstipalkeille
                  // tilaa peittämättä liikaa kuvaa. overflow-hidden on
                  // pakollinen: ilman sitä kuva kasvaa omaan kokoonsa ja
                  // venyttää kehyksen kuvasuhteen ohi.
                  "relative aspect-[3/4] h-full gap-0 overflow-hidden bg-muted py-0",
                  !osa.aktiivinen ? "opacity-60" : "transition-shadow hover:shadow-md"
                )}
              >
                {osa.kuva_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={osa.kuva_url}
                    alt={osa.nimi}
                    className="absolute inset-0 h-full w-full"
                    // Rajaus on osakohtainen ja asetetaan osan lomakkeella.
                    style={rajauksenTyyli(
                      siistiRajaus({ x: osa.kuva_x, y: osa.kuva_y, zoom: osa.kuva_zoom })
                    )}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    Ei kuvaa
                  </div>
                )}

                {/* Tekstit kuvan päällä omilla vaaleilla pohjillaan: läpikuultava
                    tausta erottaa ne myös silloin kun kuva on tekstin värinen.
                    backdrop-blur pehmentää kuvion, jottei se sotke kirjaimia. */}
                <div className="absolute inset-x-0 top-0 bg-background/75 px-2 py-1.5 backdrop-blur-sm">
                  {/* Nimi pysyy yhdellä rivillä: kaksirivinen nimi söisi kuvaa
                      ja tekisi korteista eri näköisiä. */}
                  <p className="truncate text-sm leading-tight font-semibold">{osa.nimi}</p>
                  <p className="truncate text-xs leading-tight text-muted-foreground">
                    {osa.lisatiedot || "Ei lisätietoja"}
                  </p>
                </div>

                <div className="absolute inset-x-0 bottom-0 grid gap-0.5 bg-background/75 px-2 py-1.5 text-center backdrop-blur-sm">
                  <span className="truncate text-xs leading-tight text-muted-foreground">
                    {ajoneuvotyypinNimi(osa.ajoneuvotyyppi, ajoneuvotyypit)}
                  </span>
                  <span className="truncate text-sm leading-tight font-semibold">
                    {hinta ? muotoileValiEuro(hinta.min, hinta.max) : "Ei hintaa"}
                  </span>
                </div>

                {!osa.aktiivinen && (
                  <Badge variant="secondary" className="absolute top-11 right-2">
                    Poistettu
                  </Badge>
                )}
              </Card>
            </Link>
          );
        })}
        {osat.length === 0 && (
          <p className="text-muted-foreground">Ei osia hakuehdoilla.</p>
        )}
      </div>

      <Sivutus sivu={nykyinenSivu} sivuja={sivuja} className="justify-center" />
    </div>
  );
}
