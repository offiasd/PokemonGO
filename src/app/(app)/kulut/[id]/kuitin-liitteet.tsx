"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { lataaKuitinTiedosto } from "@/lib/kuvanpakkaus";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  jaaKuittiLiitteittain,
  jaaPdfSivuiksi,
  jarjestaLiitteet,
  lisaaLiite,
  poistaLiite,
} from "../liitteet-actions";

export interface LiiteNakyma {
  id: string;
  tyyppi: string;
  /** Allekirjoitettu linkki. Null jos linkin luonti epäonnistui. */
  url: string | null;
}

/**
 * Kuitin sivut: näyttö, järjestys ja jako.
 *
 * Pitkä kassakuitti ei mahdu yhteen kuvaan, joten samaan kuittiin kuuluu 2-3
 * kuvaa. Järjestys on merkitsevä, koska poiminta lukee ne yhtenä kuittina.
 * Järjestystä voi muuttaa kahdella tavalla: raahaamalla työpöydällä ja
 * nuolilla kaikkialla - kosketusnäytöllä raahaus on tarkkuuslaji, eikä sen
 * varaan voi jättää ainoaa tapaa.
 *
 * Jako omiksi kuiteikseen on käyttäjän päätös eikä arvaus: väärin jaettu
 * kuitti on työläämpi korjata kuin käsin jaettu.
 */
export function KuitinLiitteet({
  kuittiId,
  liitteet,
  luovutettu,
}: {
  kuittiId: string;
  liitteet: LiiteNakyma[];
  /** Luovutettua tositetta ei muokata: sivuja ei lisätä eikä poisteta. */
  luovutettu: boolean;
}) {
  const router = useRouter();
  const [jarjestys, setJarjestys] = useState(liitteet);
  const [kesken, aja] = useTransition();
  const [lataa, setLataa] = useState(false);
  const [raahattava, setRaahattava] = useState<string | null>(null);
  const tiedostoRef = useRef<HTMLInputElement>(null);

  function tallennaJarjestys(uusi: LiiteNakyma[]) {
    setJarjestys(uusi);
    aja(async () => {
      const tulos = await jarjestaLiitteet(
        kuittiId,
        uusi.map((l) => l.id)
      );
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        setJarjestys(liitteet);
        return;
      }
      router.refresh();
    });
  }

  function siirra(indeksi: number, suunta: -1 | 1) {
    const kohde = indeksi + suunta;
    if (kohde < 0 || kohde >= jarjestys.length) return;
    const uusi = [...jarjestys];
    [uusi[indeksi], uusi[kohde]] = [uusi[kohde], uusi[indeksi]];
    tallennaJarjestys(uusi);
  }

  function pudota(kohdeId: string) {
    if (!raahattava || raahattava === kohdeId) return;
    const mista = jarjestys.findIndex((l) => l.id === raahattava);
    const mihin = jarjestys.findIndex((l) => l.id === kohdeId);
    if (mista < 0 || mihin < 0) return;
    const uusi = [...jarjestys];
    const [siirretty] = uusi.splice(mista, 1);
    uusi.splice(mihin, 0, siirretty);
    setRaahattava(null);
    tallennaJarjestys(uusi);
  }

  async function lisaaSivu(tiedosto: File) {
    setLataa(true);
    try {
      const lataus = await lataaKuitinTiedosto(tiedosto);
      if (!lataus.ok) {
        toast.error(lataus.virhe);
        return;
      }
      const tulos = await lisaaLiite(kuittiId, lataus.polku, lataus.tyyppi, lataus.tiiviste);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        await createClient().storage.from("kuitit").remove([lataus.polku]);
        return;
      }
      toast.success("Sivu lisätty. Lue kuitti uudelleen, jotta rivit päivittyvät.");
      router.refresh();
    } finally {
      setLataa(false);
      if (tiedostoRef.current) tiedostoRef.current.value = "";
    }
  }

  function poista(id: string) {
    aja(async () => {
      const tulos = await poistaLiite(id);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      setJarjestys((vanhat) => vanhat.filter((l) => l.id !== id));
      toast.success("Sivu poistettu.");
      router.refresh();
    });
  }

  function jaaKuiteiksi() {
    aja(async () => {
      const tulos = await jaaKuittiLiitteittain(kuittiId);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      toast.success(`${tulos.luotuja} uutta kuittia. Ne luetaan jonossa.`);
      router.refresh();
    });
  }

  function puraPdf(liiteId: string) {
    aja(async () => {
      const tulos = await jaaPdfSivuiksi(kuittiId, liiteId);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      toast.success(`PDF purettiin ${tulos.sivuja} sivuksi.`);
      router.refresh();
    });
  }

  function syote() {
    return (
      <input
        ref={tiedostoRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const tiedosto = e.target.files?.[0];
          if (tiedosto) void lisaaSivu(tiedosto);
        }}
      />
    );
  }

  function lisaysPainike() {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={lataa || kesken}
        onClick={() => tiedostoRef.current?.click()}
      >
        {lataa ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Lisää sivu
      </Button>
    );
  }

  if (jarjestys.length === 0) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">Kuittiin ei ole liitetty tiedostoa.</p>
        {!luovutettu && lisaysPainike()}
        {syote()}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {jarjestys.map((liite, i) => (
        <div
          key={liite.id}
          draggable={!luovutettu && jarjestys.length > 1}
          onDragStart={() => setRaahattava(liite.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => pudota(liite.id)}
          onDragEnd={() => setRaahattava(null)}
          className={cn(
            "grid gap-2 rounded-md border p-2 transition-opacity",
            raahattava === liite.id && "opacity-50"
          )}
        >
          {liite.url && liite.tyyppi === "application/pdf" && (
            <a
              href={liite.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 py-6 text-sm text-primary underline underline-offset-2"
            >
              <FileText className="size-4" />
              Avaa PDF
            </a>
          )}
          {liite.url && liite.tyyppi !== "application/pdf" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={liite.url}
              alt={`Kuitin sivu ${i + 1}`}
              className="w-full rounded-md object-contain"
            />
          )}
          {!liite.url && (
            <p className="py-6 text-sm text-muted-foreground">Kuvaa ei saatu avattua.</p>
          )}

          {jarjestys.length > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <GripVertical className="size-3.5 cursor-grab" aria-hidden />
              <span className="flex-1">
                Sivu {i + 1}/{jarjestys.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Siirrä sivu ${i + 1} ylemmäs`}
                disabled={i === 0 || kesken || luovutettu}
                onClick={() => siirra(i, -1)}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Siirrä sivu ${i + 1} alemmas`}
                disabled={i === jarjestys.length - 1 || kesken || luovutettu}
                onClick={() => siirra(i, 1)}
              >
                <ChevronDown className="size-4" />
              </Button>
              {!luovutettu && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Poista sivu ${i + 1}`}
                  className="text-destructive hover:text-destructive"
                  disabled={kesken}
                  onClick={() => poista(liite.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          )}

          {!luovutettu && liite.tyyppi === "application/pdf" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={kesken}
              onClick={() => puraPdf(liite.id)}
            >
              <Scissors className="size-4" />
              Pura sivuiksi
            </Button>
          )}
        </div>
      ))}

      {!luovutettu && (
        <div className="flex flex-wrap gap-2">
          {lisaysPainike()}
          {jarjestys.length > 1 && (
            <Button type="button" variant="outline" size="sm" disabled={kesken} onClick={jaaKuiteiksi}>
              {kesken ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
              Jaa omiksi kuiteiksi
            </Button>
          )}
        </div>
      )}
      {syote()}
    </div>
  );
}
