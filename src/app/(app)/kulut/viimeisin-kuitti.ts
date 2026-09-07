"use client";

import { useSyncExternalStore } from "react";

/** Muistetun kuitin avain selaimen tallennuksessa. */
const AVAIN = "kulut:viimeisin-kuitti";

/**
 * Viimeksi avattu kuitti.
 *
 * Kuitti-välilehti ja kuukausilistan nuolimerkintä tarvitsevat molemmat
 * saman tiedon. Se elää selaimessa eikä palvelimella: kyse on siitä mitä
 * tämä laite katsoi viimeksi, ei kuitin ominaisuudesta.
 */
function tilaa(kuuntelija: () => void) {
  window.addEventListener("storage", kuuntelija);
  return () => window.removeEventListener("storage", kuuntelija);
}

function lue(): string | null {
  try {
    return localStorage.getItem(AVAIN);
  } catch {
    // Selain voi estää tallennuksen. Muistamattomuus on siedettävää.
    return null;
  }
}

/** Palvelimella ei ole selainta, joten muistia ei ole. */
function palvelimella(): null {
  return null;
}

export function useViimeisinKuitti(): string | null {
  return useSyncExternalStore(tilaa, lue, palvelimella);
}

export function muistaKuitti(id: string) {
  try {
    localStorage.setItem(AVAIN, id);
  } catch {
    // Ks. yllä.
  }
}
