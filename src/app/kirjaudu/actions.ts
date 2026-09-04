"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MUISTA_EVASTE } from "@/lib/istunto";
import { createClient } from "@/lib/supabase/server";

export interface KirjautumisTila {
  virhe: string | null;
}

export async function kirjaudu(
  _edellinenTila: KirjautumisTila,
  formData: FormData
): Promise<KirjautumisTila> {
  const email = String(formData.get("email") ?? "");
  const salasana = String(formData.get("salasana") ?? "");
  const seuraava = String(formData.get("next") ?? "/");
  // Valitsematon valintaruutu ei lähetä kenttää lainkaan.
  const muista = formData.get("muista") === "on";

  if (!email || !salasana) {
    return { virhe: "Sähköposti ja salasana vaaditaan." };
  }

  // Valinta annetaan asiakkaalle, jotta se ehtii vaikuttaa jo kirjautumisen
  // luomiin istuntoevästeisiin - ei vasta seuraavalla pyynnöllä.
  const supabase = await createClient({ muista });
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: salasana,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        virhe:
          "Sähköpostiosoitetta ei ole vahvistettu. Vahvista tili, tai poista pakollinen " +
          "sähköpostivahvistus käytöstä Supabasen Authentication -> Sign In / Providers " +
          "-asetuksista (Confirm email).",
      };
    }
    if (error.code === "invalid_credentials") {
      return { virhe: "Väärä sähköposti tai salasana." };
    }
    return { virhe: `Kirjautuminen epäonnistui: ${error.message} (${error.code ?? error.status})` };
  }

  redirect(seuraava || "/");
}

export async function kirjauduUlos() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(MUISTA_EVASTE);
  redirect("/kirjaudu");
}

/**
 * Kirjaa ulos kaikilta laitteilta.
 *
 * Mitätöi kaikki istunnot palvelimella (scope: global), eli myös työpaikan
 * koneelle tai kadonneeseen puhelimeen jäänyt kirjautuminen katkeaa. Tavallinen
 * uloskirjaus koskee vain tätä selainta.
 */
export async function kirjauduUlosKaikkialta() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  (await cookies()).delete(MUISTA_EVASTE);
  redirect("/kirjaudu");
}
