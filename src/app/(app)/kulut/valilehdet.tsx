"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

import { muistaKuitti, useViimeisinKuitti } from "./viimeisin-kuitti";

/**
 * Kulut-osion kolme näkymää.
 *
 * Kuukausi, Kuitti ja Paketti ovat saman aineiston kolme tasoa: kuukausi
 * listaa, kuitti tarkentaa yhteen, paketti luovuttaa kaikki. Palkki on joka
 * näkymässä sama, jotta siirtyminen on yksi painallus eikä paluu listan
 * kautta.
 *
 * Kuitti-välilehti muistaa viimeksi avatun kuitin selaimessa. Ilman muistia
 * välilehti olisi tyhjä aina kun listalta ei juuri tultu, ja kolmesta
 * välilehdestä yksi olisi useimmiten kuollut.
 */
export function KulutValilehdet({ kuittiId }: { kuittiId?: string }) {
  const pathname = usePathname();
  const parametrit = useSearchParams();
  const muistettu = useViimeisinKuitti();

  useEffect(() => {
    if (kuittiId) muistaKuitti(kuittiId);
  }, [kuittiId]);

  // Kuukausivalinta kulkee välilehdeltä toiselle, jotta paketti aukeaa
  // samaan kuukauteen jota juuri selattiin.
  const kausi = new URLSearchParams();
  const vuosi = parametrit.get("vuosi");
  const kk = parametrit.get("kk");
  if (vuosi) kausi.set("vuosi", vuosi);
  if (kk) kausi.set("kk", kk);
  const kysely = kausi.toString() ? `?${kausi}` : "";

  const kuitinOsoite = kuittiId ?? muistettu;

  const valilehdet = [
    { nimi: "Kuukausi", osoite: `/kulut${kysely}`, aktiivinen: pathname === "/kulut" },
    {
      nimi: "Kuitti",
      osoite: kuitinOsoite ? `/kulut/${kuitinOsoite}` : null,
      aktiivinen: pathname.startsWith("/kulut/") && pathname !== "/kulut/luovutus",
    },
    {
      nimi: "Paketti",
      osoite: `/kulut/luovutus${kysely}`,
      aktiivinen: pathname === "/kulut/luovutus",
    },
  ];

  const tyyli = (aktiivinen: boolean) =>
    cn(
      "flex-1 rounded-xl border px-4 py-2.5 text-center text-sm transition-colors",
      aktiivinen
        ? "border-border bg-card font-medium text-foreground shadow-xs"
        : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
    );

  return (
    <nav aria-label="Kulut" className="flex items-stretch gap-2">
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
