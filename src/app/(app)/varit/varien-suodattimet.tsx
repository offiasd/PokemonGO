"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  MAALI_TYYPIT,
  OLETUS_JARJESTYS,
  VARISAVYN_VARIKOODI,
  VARISAVYT,
  lueLista,
} from "@/lib/vakiot";

/** Painettava suodatinvalinta - valittuna korostettu, muuten ääriviivoin. */
function SuodatinNappi({
  valittu,
  onClick,
  children,
  className,
}: {
  valittu: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={valittu}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        valittu
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function Osio({
  otsikko,
  children,
  className,
}: {
  otsikko: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid content-start gap-2", className)}>
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {otsikko}
      </h3>
      {children}
    </section>
  );
}

export function VarienSuodattimet({
  naytaPoistetutValinta,
}: {
  naytaPoistetutValinta: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const valitutTyypit = lueLista(searchParams.get("tyyppi"));
  const valitutSavyt = lueLista(searchParams.get("savy"));
  const jarjestys = searchParams.get("jarjestys") ?? OLETUS_JARJESTYS;
  const naytaPoistetut = searchParams.get("naytaPoistetut") === "1";

  function paivita(muutokset: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [avain, arvo] of Object.entries(muutokset)) {
      if (arvo) {
        params.set(avain, arvo);
      } else {
        params.delete(avain);
      }
    }
    router.push(`/varit?${params.toString()}`);
  }

  /** Lisää tai poistaa yhden arvon monivalintasuodattimesta. */
  function vaihdaArvo(avain: string, arvo: string) {
    const nykyiset = lueLista(searchParams.get(avain));
    const uudet = nykyiset.includes(arvo)
      ? nykyiset.filter((a) => a !== arvo)
      : [...nykyiset, arvo];
    paivita({ [avain]: uudet.length > 0 ? uudet.join(",") : null });
  }

  const suodattimiaValittu =
    valitutTyypit.length +
    valitutSavyt.length +
    (jarjestys !== OLETUS_JARJESTYS ? 1 : 0) +
    (naytaPoistetut ? 1 : 0);

  return (
    // Sivupalkki: haku, rajaukset allekkain. Järjestys on erikseen listan
    // yläpuolella (varien-jarjestys.tsx), koska se ei rajaa mitään.
    <div className="grid content-start gap-4 rounded-lg border p-4">
      <div className="relative w-full">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Hae nimellä tai valmistajalla..."
          defaultValue={searchParams.get("q") ?? ""}
          className="pl-8"
          onChange={(e) => paivita({ q: e.target.value || null })}
        />
      </div>

      <Osio otsikko="Maalityyppi">
        <div className="flex flex-wrap gap-2">
          {MAALI_TYYPIT.map(({ arvo, nimi }) => (
            <SuodatinNappi
              key={arvo}
              valittu={valitutTyypit.includes(arvo)}
              onClick={() => vaihdaArvo("tyyppi", arvo)}
            >
              {nimi}
            </SuodatinNappi>
          ))}
        </div>
      </Osio>

      <Osio otsikko="Väri" className="border-t pt-4">
        <div className="flex flex-wrap gap-2">
          {VARISAVYT.map(({ arvo, nimi }) => (
            <SuodatinNappi
              key={arvo}
              valittu={valitutSavyt.includes(arvo)}
              onClick={() => vaihdaArvo("savy", arvo)}
            >
              <span
                className="inline-block size-3 shrink-0 rounded-full border"
                style={{ backgroundColor: VARISAVYN_VARIKOODI[arvo] }}
              />
              {nimi}
            </SuodatinNappi>
          ))}
        </div>
      </Osio>

      {(naytaPoistetutValinta || suodattimiaValittu > 0) && (
        <div className="grid gap-2 border-t pt-4">
          {naytaPoistetutValinta && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="naytaPoistetut"
                checked={naytaPoistetut}
                onCheckedChange={(tila) => paivita({ naytaPoistetut: tila === true ? "1" : null })}
              />
              <Label htmlFor="naytaPoistetut" className="font-normal">
                Näytä poistetut
              </Label>
            </div>
          )}
          {suodattimiaValittu > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="justify-start px-0 text-muted-foreground"
              onClick={() =>
                paivita({ tyyppi: null, savy: null, jarjestys: null, naytaPoistetut: null })
              }
            >
              Tyhjennä ({suodattimiaValittu})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
