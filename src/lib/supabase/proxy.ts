import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";

const JULKISET_POLUT = ["/kirjaudu", "/auth"];

/** Kaksivaiheisen tunnistuksen vahvistussivu - kirjautuneen mutta aal1-istunnon ainoa sallittu sivu. */
export const VAHVISTUS_POLKU = "/kirjaudu/vahvistus";

/**
 * Lukee istunnon aal-tason (aal1 = salasana, aal2 = salasana + kertakoodi).
 *
 * Tokenia ei tarvitse varmentaa täällä: getUser on jo käynyt sen auth-palvelimella,
 * eli väärennetyllä tokenilla ei tähän asti pääse. Näin vältetään ylimääräinen
 * verkkokutsu jokaisella sivupyynnöllä.
 */
function aalTaso(accessToken: string): string | null {
  try {
    const osa = accessToken.split(".")[1];
    const base64 = osa.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

export async function paivitaSessio(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const onkoJulkinenPolku = JULKISET_POLUT.some((polku) =>
    request.nextUrl.pathname.startsWith(polku)
  );

  if (!user && !onkoJulkinenPolku) {
    const url = request.nextUrl.clone();
    url.pathname = "/kirjaudu";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    // Käyttöönotettu kaksivaiheinen tunnistus jäisi koristeeksi, jos sen voisi
    // ohittaa vain jättämällä koodin syöttämättä. Siksi vahvistettu tekijä
    // pakottaa istunnon aal2-tasolle ennen kuin sovellukseen pääsee.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const onVahvistettuTekija = (user.factors ?? []).some((t) => t.status === "verified");
    const tarvitaanVahvistus =
      onVahvistettuTekija && aalTaso(session?.access_token ?? "") !== "aal2";
    const onVahvistussivulla = request.nextUrl.pathname === VAHVISTUS_POLKU;

    if (tarvitaanVahvistus && !onVahvistussivulla) {
      const url = request.nextUrl.clone();
      url.pathname = VAHVISTUS_POLKU;
      url.search = "";
      if (!onkoJulkinenPolku) {
        url.searchParams.set("next", request.nextUrl.pathname);
      }
      return NextResponse.redirect(url);
    }
    if (!tarvitaanVahvistus && onVahvistussivulla) {
      const url = request.nextUrl.clone();
      // Vain oman sovelluksen polku kelpaa: // aloittaisi toisen osoitteen.
      const seuraava = request.nextUrl.searchParams.get("next") ?? "";
      url.pathname = seuraava.startsWith("/") && !seuraava.startsWith("//") ? seuraava : "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (user && request.nextUrl.pathname === "/kirjaudu") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
