import Link from "next/link";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Button } from "@/components/ui/button";
import {
  JARJESTYKSET,
  MAALI_TYYPIT,
  OLETUS_JARJESTYS,
  SIVUKOKO,
  VARISAVYT,
  lueLista,
  rajaaSivu,
} from "@/lib/vakiot";
import { laskeVarinKokonaishinta } from "@/lib/hinnat";
import type { Database, MaaliTyyppi, Varisavy } from "@/lib/supabase/database.types";
import type { VarienJarjestys } from "@/lib/vakiot";

import { VarienJarjestysValinta } from "./varien-jarjestys";
import { SuodatinPaneeli } from "./suodatin-paneeli";
import { VarienSuodattimet } from "./varien-suodattimet";
import { Sivutus } from "@/components/sivutus";

import { VariKortti } from "./vari-kortti";

type VariRow = Database["public"]["Tables"]["varit"]["Row"];

/**
 * Värikorttien ruudukko. Maksimileveydellä neljä saraketta; kapeammilla
 * näytöillä vähemmän, jotta kortit eivät kutistu lukukelvottomiksi.
 */
function VariRuudukko({
  varit,
  oletusHalytysraja,
  naytaHinnat,
}: {
  varit: { vari: VariRow; kokonaishinta: number }[];
  oletusHalytysraja: number;
  naytaHinnat: boolean;
}) {
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {varit.map(({ vari, kokonaishinta }) => (
        <VariKortti
          key={vari.id}
          vari={vari}
          oletusHalytysraja={oletusHalytysraja}
          naytaHinnat={naytaHinnat}
          kokonaishinta={kokonaishinta}
        />
      ))}
    </div>
  );
}

export default async function VaritSivu({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    naytaPoistetut?: string;
    tyyppi?: string;
    savy?: string;
    jarjestys?: string;
    sivu?: string;
  }>;
}) {
  const { q, naytaPoistetut, tyyppi, savy, jarjestys, sivu } = await searchParams;
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const naytaHinnat = kayttaja.role === "admin" || asetukset.nayta_hinnat_maalaajalle;

  // Tyyppi ja sävy ovat monivalintoja (pilkkulista URL:ssä), ja ne suodattavat
  // yhtä aikaa: esim. tyyppi=candy&savy=punainen näyttää punaiset candyt.
  const tyyppiSuodattimet = lueLista(tyyppi).filter((t): t is MaaliTyyppi =>
    MAALI_TYYPIT.some((m) => m.arvo === t)
  );
  const savySuodattimet = lueLista(savy).filter((s): s is Varisavy =>
    VARISAVYT.some((v) => v.arvo === s)
  );

  const sallittuJarjestys = JARJESTYKSET.find(
    (j) => j.arvo === jarjestys && (naytaHinnat || !j.vaatiiHinnat)
  );
  const valittuJarjestys: VarienJarjestys = sallittuJarjestys?.arvo ?? OLETUS_JARJESTYS;

  let kysely = supabase
    .from("varit")
    .select("*")
    .order("nimi", { ascending: true });

  if (!(naytaPoistetut === "1" && kayttaja.role === "admin")) {
    kysely = kysely.eq("aktiivinen", true);
  }
  if (q) {
    kysely = kysely.or(`nimi.ilike.%${q}%,valmistaja.ilike.%${q}%`);
  }
  if (tyyppiSuodattimet.length > 0) {
    kysely = kysely.in("tyyppi", tyyppiSuodattimet);
  }
  if (savySuodattimet.length > 0) {
    kysely = kysely.in("varisavy", savySuodattimet);
  }

  const [{ data: varit }, { data: suosio }] = await Promise.all([
    kysely,
    supabase.from("varien_suosio").select("vari_id, kayttokerrat"),
  ]);

  const kayttokerrat = new Map((suosio ?? []).map((s) => [s.vari_id, s.kayttokerrat]));

  // Kokonaishinta lasketaan JS:ssä asetusten arvoilla, joten hintajärjestys
  // tehdään haun jälkeen eikä SQL:ssä.
  const varitHinnoin = (varit ?? []).map((vari) => ({
    vari,
    kokonaishinta: laskeVarinKokonaishinta(vari, asetukset),
    kayttokerrat: kayttokerrat.get(vari.id) ?? 0,
  }));

  if (valittuJarjestys === "suosituin") {
    // Käyttökertojen jälkeen nimi, jotta käyttämättömät värit eivät järjesty
    // sattumanvaraisesti keskenään.
    varitHinnoin.sort(
      (a, b) => b.kayttokerrat - a.kayttokerrat || a.vari.nimi.localeCompare(b.vari.nimi, "fi")
    );
  } else if (valittuJarjestys === "saldo_nouseva" || valittuJarjestys === "saldo_laskeva") {
    const suunta = valittuJarjestys === "saldo_nouseva" ? 1 : -1;
    varitHinnoin.sort((a, b) => suunta * (a.vari.saldo_g - b.vari.saldo_g));
  } else if (valittuJarjestys !== OLETUS_JARJESTYS) {
    const suunta = valittuJarjestys === "hinta_nouseva" ? 1 : -1;
    varitHinnoin.sort((a, b) => suunta * (a.kokonaishinta - b.kokonaishinta));
  }

  // Sivutus tehdään lajittelun jälkeen JS:ssä, koska hinta-, saldo- ja
  // suosiojärjestys lasketaan täällä eikä kannassa: kannan range-rajaus
  // palauttaisi väärän viipaleen.
  const sivuja = Math.max(1, Math.ceil(varitHinnoin.length / SIVUKOKO));
  const nykyinenSivu = rajaaSivu(sivu, sivuja);
  const sivunVarit = varitHinnoin.slice((nykyinenSivu - 1) * SIVUKOKO, nykyinenSivu * SIVUKOKO);

  type VariHinnalla = { vari: VariRow; kokonaishinta: number; kayttokerrat: number };
  const ryhmat = new Map<MaaliTyyppi, VariHinnalla[]>();
  for (const rivi of sivunVarit) {
    const lista = ryhmat.get(rivi.vari.tyyppi) ?? [];
    lista.push(rivi);
    ryhmat.set(rivi.vari.tyyppi, lista);
  }

  // Rajaukseksi lasketaan tyyppi, sävy, haku ja poistettujen näyttö - ei
  // järjestys, joka ei rajaa mitään.
  const ryhmittele =
    tyyppiSuodattimet.length > 0 ||
    savySuodattimet.length > 0 ||
    Boolean(q) ||
    naytaPoistetut === "1";

  const naytettavatTyypit =
    tyyppiSuodattimet.length > 0
      ? MAALI_TYYPIT.filter((t) => tyyppiSuodattimet.includes(t.arvo))
      : MAALI_TYYPIT;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Värit</h1>
          <p className="text-muted-foreground">Värivaraston hallinta ja saldot.</p>
        </div>
        {kayttaja.role === "admin" && (
          <Button asChild>
            <Link href="/varit/uusi">
              <Plus className="size-4" />
              Lisää väri
            </Link>
          </Button>
        )}
      </div>

      {/* Työpöydällä suodattimet omana sivupalkkinaan ja värit sen oikealla
          puolella - kapealla näytöllä ne pinoutuvat allekkain. */}
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        {/* Työpöydällä suodattimet ovat sivupalkissa; puhelimessa ne veisivät
            koko ensimmäisen ruudullisen, joten siellä ne aukeavat kelluvasta
            napista liukuvaan paneeliin. */}
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <VarienSuodattimet naytaPoistetutValinta={kayttaja.role === "admin"} />
        </aside>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <VarienJarjestysValinta naytaHinnat={naytaHinnat} />
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {varitHinnoin.length} {varitHinnoin.length === 1 ? "väri" : "väriä"}
                {sivuja > 1 && ` - sivu ${nykyinenSivu}/${sivuja}`}
              </p>
              <Sivutus sivu={nykyinenSivu} sivuja={sivuja} />
            </div>
          </div>

          {varitHinnoin.length === 0 && (
            <p className="text-muted-foreground">Ei värejä hakuehdoilla.</p>
          )}

          {/* Ilman rajauksia värit ovat yhtenä listana: kategoriaotsikot
              pilkkoisivat selailun turhaan. Kun jotain on rajattu, ryhmittely
              maalityypeittäin auttaa hahmottamaan mitä valinta tuotti. */}
          {sivunVarit.length > 0 &&
            (ryhmittele ? (
              <div className="grid gap-8">
                {naytettavatTyypit.map(({ arvo, nimi }) => {
                  const ryhmanVarit = ryhmat.get(arvo);
                  if (!ryhmanVarit || ryhmanVarit.length === 0) return null;
                  return (
                    <section key={arvo} className="grid gap-4">
                      <h2 className="flex items-center gap-2 text-lg font-semibold">
                        {nimi}
                        <span className="text-sm font-normal text-muted-foreground">
                          ({ryhmanVarit.length})
                        </span>
                      </h2>
                      <VariRuudukko
                        varit={ryhmanVarit}
                        oletusHalytysraja={asetukset.oletus_halytysraja_g}
                        naytaHinnat={naytaHinnat}
                      />
                    </section>
                  );
                })}
              </div>
            ) : (
              <VariRuudukko
                varit={sivunVarit}
                oletusHalytysraja={asetukset.oletus_halytysraja_g}
                naytaHinnat={naytaHinnat}
              />
            ))}

          {/* Kelluva nappi jättää tilaa alareunan sivutukselle. */}
          <Sivutus sivu={nykyinenSivu} sivuja={sivuja} className="justify-center pt-2 pb-16 lg:pb-0" />
        </div>
      </div>

      <SuodatinPaneeli naytaPoistetutValinta={kayttaja.role === "admin"} />
    </div>
  );
}
