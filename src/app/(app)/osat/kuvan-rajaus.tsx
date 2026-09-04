"use client";

import { useRef, useState } from "react";
import { Move, RotateCcw, ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  OLETUSRAJAUS,
  rajauksenTyyli,
  siistiRajaus,
  ZOOM_MAX,
  ZOOM_MIN,
  type Kuvarajaus,
} from "@/lib/kuvarajaus";

/**
 * Osan kuvan asettelu ja zoomaus.
 *
 * Esikatselu on samassa kuvasuhteessa kuin Osat-sivun kortti, joten se näyttää
 * täsmälleen sen mitä listalla tulee näkymään - myös tekstien paikat, jotta
 * kasvot tai tuotekoodi eivät jää otsikon alle.
 *
 * Vetäminen siirtää kuvaa pikselien verran, ei prosenttiyksiköiden: sama veto
 * tuntuu samalta riippumatta siitä kuinka paljon kuvaa jää kehyksen ulkopuolelle.
 * Siksi siirtymä muunnetaan prosenteiksi kuvan todellisen ylivuodon mukaan.
 */
export function KuvanRajaus({
  kuvaUrl,
  alkuarvo,
  nimi,
}: {
  kuvaUrl: string | null;
  alkuarvo: Kuvarajaus;
  /** Näytetään esikatselussa kortin otsikon paikalla. */
  nimi?: string | null;
}) {
  const [rajaus, setRajaus] = useState<Kuvarajaus>(() => siistiRajaus(alkuarvo));
  const kehysRef = useRef<HTMLDivElement>(null);
  const kuvaRef = useRef<HTMLImageElement>(null);
  const vetoRef = useRef<{ x: number; y: number; alku: Kuvarajaus } | null>(null);

  /**
   * Kuinka monta pikseliä kuvaa jää kehyksen ulkopuolelle kummassakin
   * suunnassa. Vain ylivuotoa voi panoroida - jos kuva täyttää kehyksen
   * täsmälleen, prosentin muuttaminen ei näy mitenkään.
   */
  function ylivuoto() {
    const kehys = kehysRef.current;
    const kuva = kuvaRef.current;
    if (!kehys || !kuva?.naturalWidth) return { x: 0, y: 0 };
    const kehysLeveys = kehys.clientWidth;
    const kehysKorkeus = kehys.clientHeight;
    // object-fit: cover skaalaa kuvan pienimmällä kertoimella joka peittää
    // kehyksen; zoom tulee sen päälle.
    const kerroin =
      Math.max(kehysLeveys / kuva.naturalWidth, kehysKorkeus / kuva.naturalHeight) * rajaus.zoom;
    return {
      x: Math.max(kuva.naturalWidth * kerroin - kehysLeveys, 0),
      y: Math.max(kuva.naturalHeight * kerroin - kehysKorkeus, 0),
    };
  }

  function aloitaVeto(e: React.PointerEvent<HTMLDivElement>) {
    if (!kuvaUrl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    vetoRef.current = { x: e.clientX, y: e.clientY, alku: rajaus };
  }

  function jatkaVetoa(e: React.PointerEvent<HTMLDivElement>) {
    const veto = vetoRef.current;
    if (!veto) return;
    const yli = ylivuoto();
    // Kuvaa vedetään, joten kohdistuspiste liikkuu vastakkaiseen suuntaan.
    const siirtymaX = yli.x > 0 ? ((e.clientX - veto.x) / yli.x) * 100 : 0;
    const siirtymaY = yli.y > 0 ? ((e.clientY - veto.y) / yli.y) * 100 : 0;
    setRajaus(
      siistiRajaus({
        x: veto.alku.x - siirtymaX,
        y: veto.alku.y - siirtymaY,
        zoom: veto.alku.zoom,
      })
    );
  }

  function lopetaVeto(e: React.PointerEvent<HTMLDivElement>) {
    vetoRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div className="grid gap-3">
      <input type="hidden" name="kuva_x" value={rajaus.x} />
      <input type="hidden" name="kuva_y" value={rajaus.y} />
      <input type="hidden" name="kuva_zoom" value={rajaus.zoom} />

      <div className="grid gap-2 sm:max-w-[13rem]">
        <div
          ref={kehysRef}
          onPointerDown={aloitaVeto}
          onPointerMove={jatkaVetoa}
          onPointerUp={lopetaVeto}
          onPointerCancel={lopetaVeto}
          // touch-none: ilman tätä selain vierittää sivua vetäessä eikä kuva liiku.
          className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-md border bg-muted select-none"
          style={{ cursor: kuvaUrl ? "grab" : "default" }}
        >
          {kuvaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={kuvaRef}
              src={kuvaUrl}
              alt="Kuvan rajaus"
              draggable={false}
              className="h-full w-full"
              style={rajauksenTyyli(rajaus)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              Ei kuvaa
            </div>
          )}

          {/* Kortin tekstilaatikot samoilla tyyleillä ja paikoilla, jotta
              rajatessa näkee tarkalleen mitä ne peittävät. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-1.5">
            <span className="max-w-full rounded-2xl bg-background/60 px-2.5 py-1 text-center text-xs leading-tight font-semibold backdrop-blur-md">
              {nimi || "Osan nimi"}
            </span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-1.5">
            <span className="grid max-w-full gap-0.5 rounded-2xl bg-background/60 px-2.5 py-1 text-center backdrop-blur-md">
              <span className="text-[0.6875rem] leading-tight">Osaryhmä</span>
              <span className="text-xs leading-tight font-semibold">Hinta</span>
            </span>
          </div>
        </div>
      </div>

      {kuvaUrl && (
        <>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Move className="size-3.5" />
            Vedä kuvaa kehyksessä - laatikot ovat otsikon ja hinnan paikat.
          </p>

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="kuva_zoom_liuku" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ZoomIn className="size-3.5" />
              Zoom {rajaus.zoom.toFixed(1)}x
            </Label>
            <input
              id="kuva_zoom_liuku"
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.1}
              value={rajaus.zoom}
              onChange={(e) => setRajaus((r) => siistiRajaus({ ...r, zoom: Number(e.target.value) }))}
              className="w-full accent-primary"
            />
          </div>

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRajaus(OLETUSRAJAUS)}
            >
              <RotateCcw className="size-4" />
              Palauta oletus
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
