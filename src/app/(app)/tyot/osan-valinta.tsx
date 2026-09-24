"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ajoneuvotyypinNimi } from "@/lib/vakiot";
import { rajauksenTyyli, siistiRajaus } from "@/lib/kuvarajaus";
import type { AjoneuvoTyyppi } from "@/lib/supabase/database.types";

/** Osan ne tiedot joita selaaminen tarvitsee. */
export interface ValittavaOsa {
  id: string;
  nimi: string;
  lisatiedot: string | null;
  ajoneuvotyyppi: AjoneuvoTyyppi;
  kuva_url: string | null;
  kuva_x: number;
  kuva_y: number;
  kuva_zoom: number;
}

/** Värin ne tiedot joita selaaminen tarvitsee. */
export interface ValittavaVari {
  id: string;
  nimi: string;
  kuva_url: string | null;
}

/** Osaluettelon ulkopuolinen kertakohde. Sama arvo kuin lomakkeen MUU_OSA. */
export const MUU_AJONEUVO = "muu";

/**
 * Kuva tai sen puuttumisen merkintä.
 *
 * Kymmenellä osalla 41:stä ei ole kuvaa, joten puuttuva kuva on tavallinen
 * tilanne eikä virhe: paikka varataan silti, jotta ruudukon rivit pysyvät
 * suorassa.
 */
function Kuva({
  url,
  nimi,
  rajaus,
  className,
}: {
  url: string | null;
  nimi: string;
  rajaus?: { x: number; y: number; zoom: number };
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={nimi}
          className="absolute inset-0 h-full w-full object-cover"
          style={rajaus ? rajauksenTyyli(siistiRajaus(rajaus)) : undefined}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-1 text-center text-[0.625rem] leading-tight text-muted-foreground">
          Ei kuvaa
        </span>
      )}
    </div>
  );
}

/**
 * Osan valinta kuvista.
 *
 * Ensin ajoneuvotyyppi, sitten sen osat ruudukkona. Valittu osa korvaa
 * ruudukon isommalla kuvalla, jotta maalattava kappale on nähtävissä koko
 * työn kirjaamisen ajan - se on tämän näkymän koko tarkoitus.
 */
export function OsanValinta({
  osat,
  ajoneuvotyypit,
  valittuId,
  onValitse,
}: {
  osat: ValittavaOsa[];
  ajoneuvotyypit: { avain: string; nimi: string }[];
  /** Osan id, MUU_AJONEUVO kertakohteelle, tai tyhjä kun mitään ei ole valittu. */
  valittuId: string;
  onValitse: (id: string) => void;
}) {
  // null = tyyppiä ei ole vielä valittu, jolloin ruudukkoa ei näytetä lainkaan.
  const [tyyppi, setTyyppi] = useState<string | null>(null);

  const valittuOsa = osat.find((o) => o.id === valittuId) ?? null;
  const onMuu = valittuId === MUU_AJONEUVO;

  // Vain ne tyypit joilla on osia: tyhjä ruudukko ei kerro mitään.
  const tarjolla = useMemo(() => {
    const kaytossa = new Set(osat.map((o) => o.ajoneuvotyyppi));
    return ajoneuvotyypit.filter((t) => kaytossa.has(t.avain as AjoneuvoTyyppi));
  }, [osat, ajoneuvotyypit]);

  const tyypinOsat = useMemo(
    () => (tyyppi === null ? [] : osat.filter((o) => o.ajoneuvotyyppi === tyyppi)),
    [osat, tyyppi]
  );

  // --- Valinta tehty: iso kuva ja tiedot ---
  if (valittuOsa || onMuu) {
    return (
      <div className="grid gap-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Label className="text-sm">Maalattava osa</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mt-1 h-8 shrink-0"
            onClick={() => {
              onValitse("");
              setTyyppi(valittuOsa?.ajoneuvotyyppi ?? null);
            }}
          >
            <Pencil className="size-3.5" />
            Vaihda
          </Button>
        </div>

        {valittuOsa ? (
          <div className="grid gap-2 rounded-lg border p-2">
            <Kuva
              url={valittuOsa.kuva_url}
              nimi={valittuOsa.nimi}
              rajaus={{ x: valittuOsa.kuva_x, y: valittuOsa.kuva_y, zoom: valittuOsa.kuva_zoom }}
              className="aspect-[4/3] w-full"
            />
            <div className="grid min-w-0 gap-0.5">
              <span className="min-w-0 text-sm font-semibold wrap-anywhere">
                {valittuOsa.nimi}
              </span>
              {valittuOsa.lisatiedot && (
                <span className="min-w-0 text-xs text-muted-foreground wrap-anywhere">
                  {valittuOsa.lisatiedot}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {ajoneuvotyypinNimi(valittuOsa.ajoneuvotyyppi, ajoneuvotyypit)}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-3 text-sm">
            Muu kohde
            <span className="block text-xs text-muted-foreground">
              Ei osaluettelossa - kirjoita alle mitä maalataan.
            </span>
          </div>
        )}
      </div>
    );
  }

  // --- Valintaa ei ole: tyyppi ja sen jälkeen ruudukko ---
  return (
    <div className="grid gap-3">
      <Label className="text-sm">Maalattava osa</Label>

      <div className="flex flex-wrap gap-1.5">
        {tarjolla.map((t) => (
          <Button
            key={t.avain}
            type="button"
            variant={tyyppi === t.avain ? "default" : "outline"}
            size="sm"
            className="h-8 min-w-0 max-w-full"
            onClick={() => setTyyppi(t.avain)}
          >
            <span className="min-w-0 truncate">{t.nimi}</span>
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-0 max-w-full"
          onClick={() => onValitse(MUU_AJONEUVO)}
        >
          <span className="min-w-0 truncate">Muu</span>
        </Button>
      </div>

      {tyyppi === null ? (
        <p className="text-xs text-muted-foreground">
          Valitse ajoneuvotyyppi, niin sen osat tulevat näkyviin.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {tyypinOsat.length === 0 && (
            <p className="col-span-full text-xs text-muted-foreground">
              Tälle ajoneuvotyypille ei ole osia.
            </p>
          )}
          {tyypinOsat.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onValitse(o.id)}
              className="grid min-w-0 gap-1 rounded-lg border p-1.5 text-center transition-colors hover:bg-accent"
            >
              <Kuva
                url={o.kuva_url}
                nimi={o.nimi}
                rajaus={{ x: o.kuva_x, y: o.kuva_y, zoom: o.kuva_zoom }}
                className="aspect-square w-full"
              />
              <span className="min-w-0 text-xs leading-tight font-medium wrap-anywhere line-clamp-2">
                {o.nimi}
              </span>
              {o.lisatiedot && (
                <span className="min-w-0 text-[0.625rem] leading-tight text-muted-foreground wrap-anywhere line-clamp-2">
                  {o.lisatiedot}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Värin valinta kuvista.
 *
 * Kategorian värejä voi olla kymmeniä, joten mukana on nimihaku.
 *
 * Valinnan jälkeen ruudukko sulkeutuu ja jäljelle jää valittu väri. 76 värin
 * ruudukko veisi muuten koko näytön loppulomakkeen tieltä, eikä valittu väri
 * erottuisi selattavasta - sama kuvio kuin osan valinnassa.
 */
export function VarinValinta({
  varit,
  valittuId,
  onValitse,
  otsikko = "Väri",
  tyhjaTeksti = "Tässä kategoriassa ei ole värejä.",
}: {
  varit: ValittavaVari[];
  valittuId: string;
  onValitse: (id: string) => void;
  otsikko?: string;
  tyhjaTeksti?: string;
}) {
  const [haku, setHaku] = useState("");
  // Vaihda-painike avaa ruudukon uudelleen ilman että valinta katoaa.
  const [muokataan, setMuokataan] = useState(false);

  const valittu = varit.find((v) => v.id === valittuId) ?? null;

  const nakyvat = useMemo(() => {
    const hakusana = haku.trim().toLowerCase();
    if (hakusana === "") return varit;
    return varit.filter((v) => v.nimi.toLowerCase().includes(hakusana));
  }, [varit, haku]);

  if (valittu && !muokataan) {
    return (
      <div className="grid gap-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Label className="text-sm">{otsikko}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mt-1 h-8 shrink-0"
            onClick={() => setMuokataan(true)}
          >
            <Pencil className="size-3.5" />
            Vaihda
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-lg border p-2">
          <Kuva url={valittu.kuva_url} nimi={valittu.nimi} className="size-14 shrink-0" />
          <span className="min-w-0 text-sm font-medium wrap-anywhere">{valittu.nimi}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label className="text-sm">{otsikko}</Label>

      {varit.length > 8 && (
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={haku}
            onChange={(e) => setHaku(e.target.value)}
            placeholder="Hae värin nimellä"
            className="w-full min-w-0 pl-8"
            aria-label={`Hae ${otsikko.toLowerCase()}`}
          />
        </div>
      )}

      {varit.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tyhjaTeksti}</p>
      ) : nakyvat.length === 0 ? (
        <p className="text-xs text-muted-foreground">Haku ei osunut yhteenkään väriin.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {nakyvat.map((v) => {
            const onValittu = v.id === valittuId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  onValitse(v.id);
                  setMuokataan(false);
                }}
                aria-pressed={onValittu}
                className={cn(
                  "grid min-w-0 gap-1 rounded-lg border p-1.5 text-center transition-colors",
                  onValittu ? "border-primary bg-accent" : "hover:bg-accent"
                )}
              >
                <div className="relative">
                  <Kuva url={v.kuva_url} nimi={v.nimi} className="aspect-square w-full" />
                  {onValittu && (
                    <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>
                <span className="min-w-0 text-[0.6875rem] leading-tight font-medium wrap-anywhere line-clamp-2">
                  {v.nimi}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
