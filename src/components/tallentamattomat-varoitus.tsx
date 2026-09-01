"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Varoittaa tallentamattomista muokkauksista kun sivulta ollaan poistumassa.
 *
 * Kaksi eri tilannetta, joita ei voi hoitaa samalla tavalla:
 *
 * - Sovelluksen sisäinen siirtymä (navigaation linkit). Selain ei tarjoa
 *   tähän koukkua eikä App Routerissa ole navigointivahtia, joten linkkien
 *   klikkaukset napataan kiinni kaappausvaiheessa ja siirtymä tehdään vasta
 *   kun käyttäjä vastaa Kyllä. Näin teksti ja napit ovat omia.
 * - Välilehden sulkeminen tai sivun päivitys. Siinä on pakko käyttää selaimen
 *   omaa beforeunload-varmistusta; sen tekstiä ei voi vaihtaa, koska selaimet
 *   eivät salli sitä.
 */
export function TallentamattomatVaroitus({ muokattu }: { muokattu: boolean }) {
  const router = useRouter();
  const [kohde, setKohde] = useState<string | null>(null);

  useEffect(() => {
    if (!muokattu) return;
    const varoita = (tapahtuma: BeforeUnloadEvent) => tapahtuma.preventDefault();
    window.addEventListener("beforeunload", varoita);
    return () => window.removeEventListener("beforeunload", varoita);
  }, [muokattu]);

  useEffect(() => {
    if (!muokattu) return;

    function klikkaus(tapahtuma: MouseEvent) {
      // Uuteen välilehteen avaavat ja muut kuin tavalliset klikkaukset menevät
      // läpi: niistä nykyinen sivu ei katoa mihinkään.
      if (
        tapahtuma.defaultPrevented ||
        tapahtuma.button !== 0 ||
        tapahtuma.metaKey ||
        tapahtuma.ctrlKey ||
        tapahtuma.shiftKey ||
        tapahtuma.altKey
      ) {
        return;
      }
      const linkki = (tapahtuma.target as HTMLElement | null)?.closest?.("a");
      const href = linkki?.getAttribute("href");
      if (!linkki || !href || href.startsWith("#") || linkki.target === "_blank") return;

      const osoite = new URL(href, window.location.href);
      if (osoite.origin !== window.location.origin) return;
      const nykyinen = window.location.pathname + window.location.search;
      const uusi = osoite.pathname + osoite.search;
      if (uusi === nykyinen) return;

      tapahtuma.preventDefault();
      setKohde(uusi);
    }

    document.addEventListener("click", klikkaus, true);
    return () => document.removeEventListener("click", klikkaus, true);
  }, [muokattu]);

  return (
    <Dialog open={kohde !== null} onOpenChange={(auki) => !auki && setKohde(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tallentamattomia muokkauksia</DialogTitle>
          <DialogDescription>
            Sivulla on tallentamattomia muokkauksia. Haluatko varmasti poistua? Tekemäsi
            muutokset menetetään.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setKohde(null)}>
            Ei
          </Button>
          <Button
            onClick={() => {
              const siirry = kohde;
              setKohde(null);
              if (siirry) router.push(siirry as Parameters<typeof router.push>[0]);
            }}
          >
            Kyllä
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
