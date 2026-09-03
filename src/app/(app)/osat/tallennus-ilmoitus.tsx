"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const VIESTIT: Record<string, string> = {
  lisatty: "Osa lisätty.",
  tallennettu: "Muutokset tallennettu.",
};

/**
 * Näyttää tallennusilmoituksen paluun jälkeen.
 *
 * Tallennus päättyy palvelimen ohjaukseen takaisin listaan, joten ilmoitus ei
 * voi jäädä lomakkeen omaan tilaan. Se kulkee osoiteparametrina ja siivotaan
 * heti pois, ettei sama ilmoitus toistu sivua päivitettäessä.
 */
export function TallennusIlmoitus() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ilmoitus = searchParams.get("ilmoitus");

  useEffect(() => {
    if (!ilmoitus) return;
    const viesti = VIESTIT[ilmoitus];
    if (viesti) toast.success(viesti);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("ilmoitus");
    const kysely = params.toString();
    router.replace(kysely ? `${pathname}?${kysely}` : pathname);
  }, [ilmoitus, pathname, router, searchParams]);

  return null;
}
