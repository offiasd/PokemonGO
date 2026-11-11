"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { kestoKuukausina, paattymispaiva, TAKUUN_KESTOT_KK } from "@/lib/takuut";

import { poistaTakuu, tallennaTakuu } from "./takuut-actions";

export interface MuokattavaTakuu {
  id: string;
  nimi: string;
  alkaa: string;
  paattyy: string;
  sarjanumero: string | null;
  muistiinpano: string | null;
  /** Kuitilta luettu takuuteksti sellaisenaan, esim. "Takuu 2 v". */
  kuitinTakuuteksti: string | null;
  lahde: "kuitti" | "kasin";
}

const PAIVA = () => new Date().toISOString().slice(0, 10);

/**
 * Takuun lisäys ja muokkaus.
 *
 * Kestoa ei ole oletuksena: takuu on myyjän tai valmistajan vapaaehtoinen
 * lupaus, eikä yritysostolle ole lakisääteistä vähimmäistakuuta. Arvattu
 * kesto näyttäisi tiedolta, ja juuri siihen takuuasiassa nojattaisiin.
 *
 * Kirjoitus kohdistuu takuut-tauluun, jota kuitin kauden lukitus ei koske:
 * takuun voi lisätä myös kirjanpitäjälle jo luovutetun kuukauden kuitille.
 */
export function TakuunMuokkaus({
  kuittiId = null,
  kuitinRiviId = null,
  rivinTeksti = null,
  oletusNimi = "",
  oletusAlkaa,
  takuu = null,
  children,
}: {
  kuittiId?: string | null;
  kuitinRiviId?: string | null;
  rivinTeksti?: string | null;
  oletusNimi?: string;
  /** Oletusalku: kuitin päiväys, tai tämä päivä kun kuittia ei ole. */
  oletusAlkaa?: string;
  takuu?: MuokattavaTakuu | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [auki, setAuki] = useState(false);
  const [kaynnissa, aloita] = useTransition();

  const alkuAlkaa = takuu?.alkaa ?? oletusAlkaa ?? PAIVA();
  const [nimi, setNimi] = useState(takuu?.nimi ?? oletusNimi);
  const [alkaa, setAlkaa] = useState(alkuAlkaa);
  const [paattyy, setPaattyy] = useState(takuu?.paattyy ?? "");
  const [sarjanumero, setSarjanumero] = useState(takuu?.sarjanumero ?? "");
  const [muistiinpano, setMuistiinpano] = useState(takuu?.muistiinpano ?? "");
  // Kesto valitaan napeista; "Päivämäärä" avaa oman kentän epätavalliselle
  // kestolle, jollainen on esimerkiksi myyjän lupaama kausi.
  const [omaPaiva, setOmaPaiva] = useState(
    takuu !== null && kestoKuukausina(takuu.alkaa, takuu.paattyy) === null
  );

  const valittuKesto = paattyy === "" ? null : kestoKuukausina(alkaa, paattyy);

  function valitseKesto(kuukausia: number) {
    setOmaPaiva(false);
    setPaattyy(paattymispaiva(alkaa, kuukausia));
  }

  function vaihdaAlku(uusi: string) {
    setAlkaa(uusi);
    // Koskematon kesto seuraa alkamispäivää: 24 kk pysyy 24 kuukautena, kun
    // ostopäivä korjataan.
    if (!omaPaiva && valittuKesto !== null && uusi !== "") {
      setPaattyy(paattymispaiva(uusi, valittuKesto));
    }
  }

  function kasittele() {
    aloita(async () => {
      const tulos = await tallennaTakuu({
        id: takuu?.id ?? null,
        kuittiId,
        kuitinRiviId,
        rivinTeksti: rivinTeksti ?? nimi,
        nimi,
        alkaa,
        paattyy,
        sarjanumero,
        muistiinpano,
      });
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      toast.success(takuu ? "Takuu tallennettu." : "Takuu lisätty.");
      setAuki(false);
      router.refresh();
    });
  }

  function kasittelePoisto() {
    if (!takuu) return;
    aloita(async () => {
      const tulos = await poistaTakuu(takuu.id);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      toast.success("Takuu poistettu.");
      setAuki(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={auki} onOpenChange={setAuki}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{takuu ? "Takuu" : "Lisää takuu"}</DialogTitle>
          {takuu?.kuitinTakuuteksti && (
            <DialogDescription className="min-w-0 wrap-anywhere">
              Kuitilta luettu: {takuu.kuitinTakuuteksti}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid min-w-0 content-start gap-4 overflow-y-auto">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="takuu_nimi">Nimi *</Label>
            <Input
              id="takuu_nimi"
              value={nimi}
              onChange={(e) => setNimi(e.target.value)}
              placeholder="Esim. Monitoimitulostin TS3750i"
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="takuu_alkaa">Alkaa</Label>
            <Input
              id="takuu_alkaa"
              type="date"
              className="min-w-0 tabular-nums"
              value={alkaa}
              onChange={(e) => vaihdaAlku(e.target.value)}
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <Label>Kesto *</Label>
            <div className="flex min-w-0 flex-wrap gap-2">
              {TAKUUN_KESTOT_KK.map((kk) => (
                <Button
                  key={kk}
                  type="button"
                  size="sm"
                  variant={!omaPaiva && valittuKesto === kk ? "default" : "outline"}
                  onClick={() => valitseKesto(kk)}
                >
                  {kk} kk
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={omaPaiva ? "default" : "outline"}
                onClick={() => setOmaPaiva(true)}
              >
                Päivämäärä
              </Button>
            </div>
            {omaPaiva && (
              <Input
                aria-label="Päättymispäivä"
                type="date"
                className="min-w-0 tabular-nums"
                value={paattyy}
                onChange={(e) => setPaattyy(e.target.value)}
              />
            )}
            <p
              className={cn(
                "min-w-0 text-xs wrap-anywhere",
                paattyy === "" ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {paattyy === ""
                ? "Valitse kesto tai päivämäärä - takuuta ei arvata."
                : `Päättyy ${new Date(`${paattyy}T00:00:00Z`).toLocaleDateString("fi-FI")}`}
            </p>
          </div>

          {/* Sarjanumero on takuuasiassa kentistä hyödyllisin: sitä kysytään
              ensimmäisenä, eikä se ole kuitilla. */}
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="takuu_sarjanumero">Sarjanumero</Label>
            <Input
              id="takuu_sarjanumero"
              value={sarjanumero}
              onChange={(e) => setSarjanumero(e.target.value)}
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="takuu_muistiinpano">Muistiinpano</Label>
            <Input
              id="takuu_muistiinpano"
              value={muistiinpano}
              onChange={(e) => setMuistiinpano(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {takuu ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={kasittelePoisto}
              disabled={kaynnissa}
            >
              <Trash2 className="size-4" />
              Poista
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={kasittele} disabled={kaynnissa}>
            {kaynnissa && <Loader2 className="size-4 animate-spin" />}
            Tallenna
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
