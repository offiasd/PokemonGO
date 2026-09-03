"use server";

import { redirect } from "next/navigation";

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

  if (!email || !salasana) {
    return { virhe: "Sähköposti ja salasana vaaditaan." };
  }

  const supabase = await createClient();
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
  redirect("/kirjaudu");
}
