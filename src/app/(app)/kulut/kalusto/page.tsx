import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { muotoileEuro } from "@/lib/vakiot";
import { PIENHANKINNAN_RAJA_EUR, PIENHANKINTAKATTO_EUR } from "@/lib/kulut";
import { haeTilikaudenAineisto } from "@/lib/tilikausi-haku";

import { KulutValilehdet } from "../valilehdet";
import { KalustoLista, type KalustoListalla } from "./kalusto-lista";
import { KalustonLisays } from "./kaluston-lisays";
import { SiirrettavatRivit } from "./siirrettavat-rivit";

export default async function KalustoSivu({
  searchParams,
}: {
  searchParams: Promise<{ vuosi?: string }>;
}) {
  // Hankintamenot ja menojäännökset ovat taloustietoa: admin-rajaus koko
  // näkymälle, ei vain nappien piilotus.
  await vaaditaanAdmin();
  const parametrit = await searchParams;
  const supabase = await createClient();

  const nyt = new Date();
  const vuosi = Number(parametrit.vuosi) || nyt.getUTCFullYear();

  const [{ data: kalusto }, aineisto] = await Promise.all([
    supabase
      .from("kalusto")
      .select("id, nimi, kuvaus, hankittu, hankintameno_eur, luovutettu, luovutushinta_eur")
      .order("hankittu", { ascending: false }),
    haeTilikaudenAineisto(supabase, vuosi),
  ]);

  const rivit: KalustoListalla[] = (kalusto ?? []).map((k) => ({
    id: k.id,
    nimi: k.nimi,
    kuvaus: k.kuvaus,
    hankittu: k.hankittu,
    hankintamenoEur: k.hankintameno_eur,
    luovutettu: k.luovutettu,
    luovutushintaEur: k.luovutushinta_eur,
  }));

  const kaytossa = rivit.filter((k) => k.luovutettu === null);
  const kayttoarvo = kaytossa.reduce((summa, k) => summa + k.hankintamenoEur, 0);

  // Yli 1 200 euron hankinnat eivät ole pienhankintoja: ne kuuluvat tänne.
  const siirtamatta = aineisto.pienhankinnat.ylisuuret.filter(
    (y) => !y.siirretty && y.riviId !== null
  );

  return (
    <div className="grid gap-4">
      <KulutValilehdet />

      {/* Paluulinkki omalle rivilleen kapealla ruudulla: otsikon vieressä se
          jäisi monirivisen kuvauksen kohdalla pystysuunnassa keskelle. */}
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/kulut/tilikausi?vuosi=${vuosi}`}>
              <ArrowLeft className="size-4" />
              Tilikausi
            </Link>
          </Button>
        </div>
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-xl font-semibold">Kalusto</h1>
          <p className="text-sm text-muted-foreground">
            Yli {muotoileEuro(PIENHANKINNAN_RAJA_EUR)} hankinnat, jotka vähennetään
            menojäännöspoistoina usean vuoden yli.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm text-muted-foreground">
              {kaytossa.length} {kaytossa.length === 1 ? "hankinta" : "hankintaa"} käytössä
              {rivit.length - kaytossa.length > 0 &&
                ` · ${rivit.length - kaytossa.length} luovutettu`}
            </span>
            <span className="text-lg font-semibold tabular-nums">{muotoileEuro(kayttoarvo)}</span>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Hankintameno on ALV 0 % -summa, ei kuitilla lukeva bruttohinta. Yhteissumma on
              hankintamenojen summa, ei jäljellä oleva menojäännös - se on poistolaskelmassa.
            </span>
          </p>
        </CardContent>
      </Card>

      <SiirrettavatRivit
        vuosi={vuosi}
        ylisuuret={siirtamatta}
        katonAlaiset={aineisto.pienhankinnat.katonAlaiset}
        kaytettyEur={aineisto.pienhankinnat.kaytettyEur}
        ylitysEur={aineisto.pienhankinnat.ylitysEur}
        kattoEur={PIENHANKINTAKATTO_EUR}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kalustorekisteri</CardTitle>
          <CardDescription>Hankinnat uusin ensin.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <KalustoLista rivit={rivit} />
        </CardContent>
      </Card>

      <KalustonLisays />
    </div>
  );
}
