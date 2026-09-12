"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

import { muistaKuitti, useViimeisinKuitti } from "./viimeisin-kuitti";

/**
 * Kulut-osion neljä näkymää.
 *
 * Kuukausi, Kuitti ja Paketti ovat saman aineiston kolme tasoa: kuukausi
 * listaa, kuitti tarkentaa yhteen, paketti luovuttaa kaikki. Palkki on joka
 * näkymässä sama, jotta siirtyminen on yksi painallus eikä paluu listan
 * kautta.
 *
 * Tilikausi on neljäs ja harvinaisin: koko vuoden kooste kirjanpitäjälle.
 * Se on välilehti eikä oma navigointikohtansa, koska sitä käytetään kerran
 * vuodessa - mutta samasta aineistosta.
 *
 * Kuitti-välilehti muistaa viimeksi avatun kuitin selaimessa. Ilman muistia
 * välilehti olisi tyhjä aina kun listalta ei juuri tultu, ja kolmesta
 * välilehdestä yksi olisi useimmiten kuollut.
 */
export function KulutValilehdet({
  kuittiId,
  kausi,
}: {
  kuittiId?: string;
  /**
   * Avoinna olevan kuitin päiväys. Kuittisivulla ei ole kuukausiparametreja,
   * joten ilman tätä Kuukausi-välilehti veisi kuluvaan kuukauteen - eikä juuri
   * katsottu kuitti näkyisi siellä lainkaan.
   */
  kausi?: string;
}) {
  const pathname = usePathname();
  const parametrit = useSearchParams();
  const muistettu = useViimeisinKuitti();

  useEffect(() => {
    if (kuittiId) muistaKuitti(kuittiId);
  }, [kuittiId]);

  // Kuukausivalinta kulkee välilehdeltä toiselle, jotta paketti aukeaa
  // samaan kuukauteen jota juuri selattiin.
  const kuukausiparametrit = new URLSearchParams();
  const vuosi = parametrit.get("vuosi");
  const kk = parametrit.get("kk");
  if (vuosi && kk) {
    kuukausiparametrit.set("vuosi", vuosi);
    kuukausiparametrit.set("kk", kk);
  } else if (kausi) {
    const paiva = new Date(kausi);
    kuukausiparametrit.set("vuosi", String(paiva.getUTCFullYear()));
    kuukausiparametrit.set("kk", String(paiva.getUTCMonth()));
  }
  const kysely = kuukausiparametrit.toString() ? `?${kuukausiparametrit}` : "";

  const kuitinOsoite = kuittiId ?? muistettu;

  const valilehdet = [
    { nimi: "Kuukausi", osoite: `/kulut${kysely}`, aktiivinen: pathname === "/kulut" },
    {
      nimi: "Kuitti",
      osoite: kuitinOsoite ? `/kulut/${kuitinOsoite}` : null,
      aktiivinen:
        pathname.startsWith("/kulut/") &&
        pathname !== "/kulut/luovutus" &&
        pathname !== "/kulut/tilikausi" &&
        pathname !== "/kulut/kalusto" &&
        !pathname.startsWith("/kulut/era/"),
    },
    {
      nimi: "Paketti",
      osoite: `/kulut/luovutus${kysely}`,
      aktiivinen: pathname === "/kulut/luovutus",
    },
    {
      nimi: "Tilikausi",
      osoite: "/kulut/tilikausi",
      aktiivinen: pathname === "/kulut/tilikausi",
    },
  ];

  // min-w-0 ja truncate ovat tässä välttämättömiä, eivät varmuuden vuoksi:
  // flex-1 ei kutista lasta sen sisällön minimileveyden alle, joten neljä
  // välilehteä vaati 342 pikseliä. Se on enemmän kuin puhelimen ruudulla on
  // tilaa, ja koska leveys tuli tästä palkista, kaikki sivun kortit venyivät
  // sen mittaisiksi ja valuivat oikeasta reunasta yli - sisältö näytti
  // vasemmalle työnnetyltä eikä keskitetyltä. Kapealla ruudulla myös tiiviimpi
  // välistys ja pienempi teksti, jotta nimet mahtuvat katkaisematta.
  const tyyli = (aktiivinen: boolean) =>
    cn(
      "min-w-0 truncate rounded-xl border px-2 py-2.5 text-center text-xs transition-colors sm:px-4 sm:text-sm",
      aktiivinen
        ? "border-border bg-card font-medium text-foreground shadow-xs"
        : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
    );

  return (
    <nav aria-label="Kulut" className="grid grid-cols-4 items-stretch gap-1.5 sm:gap-2">
      {valilehdet.map((valilehti) =>
        valilehti.osoite ? (
          <Link
            key={valilehti.nimi}
            href={valilehti.osoite}
            aria-current={valilehti.aktiivinen ? "page" : undefined}
            className={tyyli(valilehti.aktiivinen)}
          >
            {valilehti.nimi}
          </Link>
        ) : (
          <span
            key={valilehti.nimi}
            aria-disabled="true"
            title="Avaa kuitti listalta"
            className={cn(tyyli(false), "cursor-default opacity-50")}
          >
            {valilehti.nimi}
          </span>
        )
      )}
    </nav>
  );
}
