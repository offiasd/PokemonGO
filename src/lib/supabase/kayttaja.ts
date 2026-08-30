import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { KayttajaRooli } from "@/lib/supabase/database.types";

export interface NykyinenKayttaja {
  id: string;
  email: string | null;
  fullName: string | null;
  role: KayttajaRooli;
}

/** Palauttaa kirjautuneen käyttäjän profiilin, tai ohjaa kirjautumissivulle. */
export async function vaaditaanKayttaja(): Promise<NykyinenKayttaja> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/kirjaudu");
  }

  const { data: profiili } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (!profiili) {
    redirect("/kirjaudu");
  }

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profiili.full_name,
    role: profiili.role,
  };
}

/** Ohjaa etusivulle jos käyttäjä ei ole admin. Käytä admin-only-sivuilla. */
export async function vaaditaanAdmin(): Promise<NykyinenKayttaja> {
  const kayttaja = await vaaditaanKayttaja();
  if (kayttaja.role !== "admin") {
    redirect("/");
  }
  return kayttaja;
}
