import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SaldoPalkki } from "@/components/saldo-palkki";
import { jaljellaTeksti, takuunPalkki } from "@/lib/takuut";

import { KulutValilehdet } from "../valilehdet";
import { TakuunMuokkaus } from "../takuun-muokkaus";

/** Liitelinkin voimassaolo sekunteina: kuitit ovat yksityisessä ämpärissä. */
const LINKIN_VOIMASSAOLO_S = 60 * 10;

function pvm(iso: string | null): string {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("fi-FI") : "-";
}

/**
 * Takuut päättymisjärjestyksessä.
 *
 * Takuu on tieto jota tarvitaan kerran: silloin kun laite hajoaa. Siksi
 * näkymä vastaa kahteen kysymykseen - onko takuuta jäljellä ja missä kuitti
 * on. Palkki on sama kuin värivaraston saldopalkki, jotta väri tarkoittaa
 * samaa koko sovelluksessa: punainen on "nyt pitää toimia".
 *
 * Ostohintaa ei näytetä, joten näkymän voi myöhemmin avata myös maalaajalle.
 */
export default async function TakuutSivu() {
  await vaaditaanAdmin();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();
  const varoitusPv = asetukset.takuu_varoitus_pv;

  const { data } = await supabase
    .from("takuut_nakyma")
    .select("*")
    .order("paattyy", { ascending: true });

  // Mitätöity kuitti ei ole tosite eikä sen takuu ole voimassa.
  const takuut = (data ?? []).filter((t) => t.kuitti_mitatoity_at === null);
  const voimassa = takuut.filter((t) => t.jaljella_pv >= 0);
  const paattyneet = takuut.filter((t) => t.jaljella_pv < 0).reverse();

  // Liitelinkki haetaan vain niille kuiteille joilla on takuu: "Näytä kuitti"
  // on takuuasiassa se mitä tarvitaan, eikä kuitin sivun kautta kiertäminen
  // ole yhden painalluksen asia puhelimella.
  const kuittiIdt = [...new Set(takuut.map((t) => t.kuitti_id).filter(Boolean))] as string[];
  const { data: liitteet } = kuittiIdt.length
    ? await supabase
        .from("kuitin_liitteet")
        .select("kuitti_id, polku")
        .in("kuitti_id", kuittiIdt)
        .order("jarjestys")
    : { data: [] };

  const linkit = new Map<string, string>();
  for (const liite of liitteet ?? []) {
    if (linkit.has(liite.kuitti_id)) continue;
    const { data: linkki } = await supabase.storage
      .from("kuitit")
      .createSignedUrl(liite.polku, LINKIN_VOIMASSAOLO_S);
    if (linkki?.signedUrl) linkit.set(liite.kuitti_id, linkki.signedUrl);
  }

  type Takuu = (typeof takuut)[number];

  const Rivi = ({ takuu, paattynyt }: { takuu: Takuu; paattynyt: boolean }) => (
    <div className="grid min-w-0 gap-1.5 border-t py-3 first:border-t-0">
      <p className="min-w-0 font-medium wrap-anywhere">{takuu.nimi}</p>
      <p className="min-w-0 text-sm text-muted-foreground wrap-anywhere">
        {[takuu.toimittaja, takuu.kuitin_paivays ? `ostettu ${pvm(takuu.kuitin_paivays)}` : null]
          .filter(Boolean)
          .join(" · ") || "Lisätty käsin"}
      </p>

      {/* Päättyneen palkki on harmaa: väri kertoisi muuten kiireestä, jota
          ei enää ole. */}
      {paattynyt ? (
        <div className="h-2.5 w-full rounded-full bg-muted" />
      ) : (
        <SaldoPalkki {...takuunPalkki(takuu.jaljella_pv, takuu.kesto_pv, varoitusPv)} />
      )}

      <p className="min-w-0 text-sm wrap-anywhere">
        Päättyy {pvm(takuu.paattyy)} · {jaljellaTeksti(takuu.jaljella_pv)}
      </p>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-xs text-muted-foreground wrap-anywhere">
          {takuu.sarjanumero ? `SN: ${takuu.sarjanumero}` : ""}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <TakuunMuokkaus
            kuittiId={takuu.kuitti_id}
            kuitinRiviId={takuu.kuitin_rivi_id}
            rivinTeksti={takuu.rivin_teksti}
            oletusAlkaa={takuu.alkaa}
            takuu={{
              id: takuu.id,
              nimi: takuu.nimi,
              alkaa: takuu.alkaa,
              paattyy: takuu.paattyy,
              sarjanumero: takuu.sarjanumero,
              muistiinpano: takuu.muistiinpano,
              kuitinTakuuteksti: takuu.kuitin_takuuteksti,
              lahde: takuu.lahde,
            }}
          >
            <Button type="button" variant="ghost" size="sm">
              Muokkaa
            </Button>
          </TakuunMuokkaus>
          {takuu.kuitti_id && linkit.has(takuu.kuitti_id) && (
            <Button asChild variant="outline" size="sm">
              <a href={linkit.get(takuu.kuitti_id)} target="_blank" rel="noreferrer">
                Näytä kuitti
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6">
      <KulutValilehdet />

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Takuut</h1>
          <p className="min-w-0 text-sm text-muted-foreground wrap-anywhere">
            Voimassa olevat takuut päättymisjärjestyksessä.
          </p>
        </div>
        <TakuunMuokkaus>
          <Button type="button" size="sm">
            <Plus className="size-4" />
            Lisää käsin
          </Button>
        </TakuunMuokkaus>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2 text-base">
            <ShieldCheck className="size-4 shrink-0" />
            Voimassa ({voimassa.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-0">
          {voimassa.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ei voimassa olevia takuita. Lisää takuu kuitin riviltä tai käsin.
            </p>
          ) : (
            voimassa.map((takuu) => <Rivi key={takuu.id} takuu={takuu} paattynyt={false} />)
          )}
        </CardContent>
      </Card>

      {/* Päättyneet ovat harvoin kiinnostavia, joten ne ovat kiinni. Niitä
          katsotaan vain kun muistellaan oliko takuuta enää jäljellä. */}
      <Card>
        <CardContent className="pt-6">
          <details className="group grid min-w-0 gap-3">
            <summary className="cursor-pointer text-base font-medium">
              Päättyneet ({paattyneet.length})
            </summary>
            <div className="grid min-w-0 gap-0 pt-2">
              {paattyneet.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ei päättyneitä takuita.</p>
              ) : (
                paattyneet.map((takuu) => <Rivi key={takuu.id} takuu={takuu} paattynyt />)
              )}
            </div>
          </details>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href="/kulut" className="underline">
          Takaisin kuluihin
        </Link>
      </p>
    </div>
  );
}
