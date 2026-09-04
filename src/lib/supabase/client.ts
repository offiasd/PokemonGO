import { createBrowserClient } from "@supabase/ssr";

import { evasteenElinaika, lueMuista, MUISTA_EVASTE } from "@/lib/istunto";

import type { Database } from "./database.types";

/**
 * Selaimessa luetut evästeet.
 *
 * Sama muoto kuin @supabase/ssr:n omassa oletustoteutuksessa: arvot ovat
 * URL-koodattuja, kuten palvelinkin ne kirjoittaa.
 */
function lueEvasteet() {
  if (typeof document === "undefined") return [];
  return document.cookie
    .split("; ")
    .filter(Boolean)
    .map((pala) => {
      const raja = pala.indexOf("=");
      const nimi = raja === -1 ? pala : pala.slice(0, raja);
      const arvo = raja === -1 ? "" : pala.slice(raja + 1);
      return { name: decodeURIComponent(nimi), value: decodeURIComponent(arvo) };
    });
}

function kirjoitaEvaste(nimi: string, arvo: string, asetukset: Record<string, unknown>) {
  const osat = [`${encodeURIComponent(nimi)}=${encodeURIComponent(arvo)}`];
  osat.push(`Path=${typeof asetukset.path === "string" ? asetukset.path : "/"}`);
  osat.push(`SameSite=${typeof asetukset.sameSite === "string" ? asetukset.sameSite : "Lax"}`);
  if (typeof asetukset.domain === "string") osat.push(`Domain=${asetukset.domain}`);
  if (typeof asetukset.maxAge === "number") osat.push(`Max-Age=${asetukset.maxAge}`);
  if (asetukset.secure || window.location.protocol === "https:") osat.push("Secure");
  document.cookie = osat.join("; ");
}

/**
 * Selaimen Supabase-asiakas.
 *
 * Evästeiden kirjoitus on omissa käsissä, koska @supabase/ssr pakottaa
 * istuntoevästeelle oman pitkän elinaikansa asetuksista riippumatta. Silloin
 * selaimessa tapahtuva tokenin uusiminen olisi ohittanut "Muista minut"
 * -valinnan ja tehnyt yhteiskäyttöiselle koneelle pysyvän kirjautumisen.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: lueEvasteet,
        setAll(evasteet) {
          const muista = lueMuista(
            lueEvasteet().find((e) => e.name === MUISTA_EVASTE)?.value
          );
          for (const { name, value, options } of evasteet) {
            kirjoitaEvaste(name, value, evasteenElinaika({ ...options }, muista));
          }
        },
      },
    }
  );
}
