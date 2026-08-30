"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";

export interface KirjaaTila {
  virhe: string | null;
  viesti: string | null;
}

export async function kirjaaMaalaustapahtuma(
  _edellinenTila: KirjaaTila,
  formData: FormData
): Promise<KirjaaTila> {
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();

  const osaId = String(formData.get("osa_id") ?? "");
  const variId = String(formData.get("vari_id") ?? "");
  const kappalemaara = Number(formData.get("kappalemaara") ?? 1);
  const arvioituKulutusG = Number(formData.get("arvioitu_kulutus_g") ?? 0);
  const toteutunutKulutusG = Number(formData.get("toteutunut_kulutus_g") ?? 0);

  if (!osaId || !variId) {
    return { virhe: "Valitse sekä osa että väri.", viesti: null };
  }
  if (kappalemaara <= 0) {
    return { virhe: "Kappalemäärän tulee olla vähintään 1.", viesti: null };
  }
  if (toteutunutKulutusG <= 0) {
    return { virhe: "Toteutunut kulutus tulee olla suurempi kuin 0.", viesti: null };
  }

  const { error } = await supabase.from("maalaustapahtumat").insert({
    osa_id: osaId,
    vari_id: variId,
    kappalemaara,
    arvioitu_kulutus_g: arvioituKulutusG,
    toteutunut_kulutus_g: toteutunutKulutusG,
    kayttaja_id: kayttaja.id,
  });

  if (error) {
    return { virhe: error.message, viesti: null };
  }

  revalidatePath("/kirjaa");
  revalidatePath("/");
  revalidatePath("/varit");
  return { virhe: null, viesti: "Maalaustapahtuma kirjattu ja varastosaldo päivitetty." };
}
