"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ListFilter, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  JARJESTYKSET,
  MAALI_TYYPIT,
  OLETUS_JARJESTYS,
  VARISAVYN_VARIKOODI,
  VARISAVYT,
  lueLista,
} from "@/lib/vakiot";

/** Yksi poistettava suodatin aktiivisten suodattimien rivillä. */
function SuodatinMerkki({
  nimi,
  varikoodi,
  onPoista,
}: {
  nimi: string;
  varikoodi?: string;
  onPoista: () => void;
}) {
  return (
    <Badge variant="secondary" className="gap-1.5 py-1 pr-1 pl-2 font-normal">
      {varikoodi && (
        <span
          className="inline-block size-2.5 shrink-0 rounded-full border"
          style={{ backgroundColor: varikoodi }}
        />
      )}
      {nimi}
      <button
        type="button"
        onClick={onPoista}
        aria-label={`Poista suodatin ${nimi}`}
        className="rounded-sm p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </Badge>
  );
}

export function VarienSuodattimet({
  naytaPoistetutValinta,
  naytaHinnat,
}: {
  naytaPoistetutValinta: boolean;
  naytaHinnat: boolean;
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
  function vaihdaArvo(avain: string, arvo: string, valittu: boolean) {
    const nykyiset = lueLista(searchParams.get(avain));
    const uudet = valittu
      ? [...nykyiset, arvo]
      : nykyiset.filter((a) => a !== arvo);
    paivita({ [avain]: uudet.length > 0 ? uudet.join(",") : null });
  }

  const suodattimiaValittu =
    valitutTyypit.length +
    valitutSavyt.length +
    (jarjestys !== OLETUS_JARJESTYS ? 1 : 0) +
    (naytaPoistetut ? 1 : 0);

  const jarjestysvaihtoehdot = JARJESTYKSET.filter((j) => naytaHinnat || !j.vaatiiHinnat);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Hae nimellä tai valmistajalla..."
            defaultValue={searchParams.get("q") ?? ""}
            className="pl-8"
            onChange={(e) => paivita({ q: e.target.value || null })}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <ListFilter className="size-4" />
              Suodata
              {suodattimiaValittu > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5">
                  {suodattimiaValittu}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          {/* Valinnat eivät sulje valikkoa (preventDefault), jotta useamman
              suodattimen voi valita kerralla - esim. Candy + Punainen. */}
          <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
            <DropdownMenuLabel>Maalityyppi</DropdownMenuLabel>
            {MAALI_TYYPIT.map(({ arvo, nimi }) => (
              <DropdownMenuCheckboxItem
                key={arvo}
                checked={valitutTyypit.includes(arvo)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(tila) => vaihdaArvo("tyyppi", arvo, tila === true)}
              >
                {nimi}
              </DropdownMenuCheckboxItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Väri</DropdownMenuLabel>
            {VARISAVYT.map(({ arvo, nimi }) => (
              <DropdownMenuCheckboxItem
                key={arvo}
                checked={valitutSavyt.includes(arvo)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(tila) => vaihdaArvo("savy", arvo, tila === true)}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-3 rounded-full border"
                    style={{ backgroundColor: VARISAVYN_VARIKOODI[arvo] }}
                  />
                  {nimi}
                </span>
              </DropdownMenuCheckboxItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Järjestys</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={jarjestys}
              onValueChange={(arvo) =>
                paivita({ jarjestys: arvo === OLETUS_JARJESTYS ? null : arvo })
              }
            >
              {jarjestysvaihtoehdot.map(({ arvo, nimi }) => (
                <DropdownMenuRadioItem
                  key={arvo}
                  value={arvo}
                  onSelect={(e) => e.preventDefault()}
                >
                  {nimi}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            {naytaPoistetutValinta && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={naytaPoistetut}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(tila) =>
                    paivita({ naytaPoistetut: tila === true ? "1" : null })
                  }
                >
                  Näytä poistetut
                </DropdownMenuCheckboxItem>
              </>
            )}

            {suodattimiaValittu > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    paivita({ tyyppi: null, savy: null, jarjestys: null, naytaPoistetut: null })
                  }
                >
                  Tyhjennä suodattimet
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {suodattimiaValittu > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {valitutTyypit.map((arvo) => {
            const tyyppi = MAALI_TYYPIT.find((t) => t.arvo === arvo);
            if (!tyyppi) return null;
            return (
              <SuodatinMerkki
                key={arvo}
                nimi={tyyppi.nimi}
                onPoista={() => vaihdaArvo("tyyppi", arvo, false)}
              />
            );
          })}
          {valitutSavyt.map((arvo) => {
            const savy = VARISAVYT.find((s) => s.arvo === arvo);
            if (!savy) return null;
            return (
              <SuodatinMerkki
                key={arvo}
                nimi={savy.nimi}
                varikoodi={VARISAVYN_VARIKOODI[savy.arvo]}
                onPoista={() => vaihdaArvo("savy", arvo, false)}
              />
            );
          })}
          {jarjestys !== OLETUS_JARJESTYS && (
            <SuodatinMerkki
              nimi={JARJESTYKSET.find((j) => j.arvo === jarjestys)?.nimi ?? jarjestys}
              onPoista={() => paivita({ jarjestys: null })}
            />
          )}
          {naytaPoistetut && (
            <SuodatinMerkki
              nimi="Näytä poistetut"
              onPoista={() => paivita({ naytaPoistetut: null })}
            />
          )}
        </div>
      )}
    </div>
  );
}
