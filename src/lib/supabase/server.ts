import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { evasteenElinaika, lueMuista, MUISTA_EVASTE, muistaEvasteenAsetukset } from "@/lib/istunto";

import type { Database } from "./database.types";

/**
 * @param muista Anna vain kirjautuessa, jolloin valinta myös tallentuu omaan
 * evästeeseensä. Muilla pyynnöillä valinta luetaan siitä evästeestä.
 */
export async function createClient(asetukset?: { muista?: boolean }) {
  const cookieStore = await cookies();
  const muista = asetukset?.muista ?? lueMuista(cookieStore.get(MUISTA_EVASTE)?.value);

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            if (asetukset?.muista !== undefined) {
              cookieStore.set(
                MUISTA_EVASTE,
                muista ? "1" : "0",
                muistaEvasteenAsetukset(muista)
              );
            }
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, evasteenElinaika(options, muista));
            }
          } catch {
            // setAll kutsuttiin Server Componentista - proxy.ts päivittää
            // session-evästeet, joten tämä voidaan jättää huomiotta.
          }
        },
      },
    }
  );
}
