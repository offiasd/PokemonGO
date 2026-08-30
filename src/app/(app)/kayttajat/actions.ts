"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import type { KayttajaRooli } from "@/lib/supabase/database.types";

export interface KutsuTila {
  virhe: string | null;
  viesti: string | null;
}

export async function kutsuKayttaja(
  _edellinenTila: KutsuTila,
  formData: FormData
): Promise<KutsuTila> {
  await vaaditaanAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "maalaaja") as KayttajaRooli;
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email) {
    return { virhe: "Sähköposti vaaditaan.", viesti: null };
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName || undefined, role },
    });

    if (error) {
      return { virhe: `Kutsu epäonnistui: ${error.message}`, viesti: null };
    }
  } catch (error) {
    return {
      virhe:
        error instanceof Error
          ? error.message
          : "Kutsu epäonnistui - tarkista SUPABASE_SERVICE_ROLE_KEY.",
      viesti: null,
    };
  }

  revalidatePath("/kayttajat");
  return { virhe: null, viesti: `Kutsu lähetetty osoitteeseen ${email}.` };
}

export async function paivitaRooli(kayttajaId: string, role: KayttajaRooli) {
  await vaaditaanAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", kayttajaId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/kayttajat");
}
