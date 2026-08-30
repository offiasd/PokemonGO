"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import type { AjoneuvoTyyppi, TyoVaihe, VariTyyppi } from "@/lib/supabase/database.types";
import { TYO_VAIHEET } from "@/lib/vakiot";

export interface OsaLomakeTila {
  virhe: string | null;
}

function tyhjaksiNumeroksi(arvo: FormDataEntryValue | null) {
  return arvo === null || arvo === "" ? null : Number(arvo);
}

function lueOsaKentat(formData: FormData) {
  return {
    nimi: String(formData.get("nimi") ?? "").trim(),
    ajoneuvotyyppi: String(formData.get("ajoneuvotyyppi") ?? "auto") as AjoneuvoTyyppi,
    merkki: String(formData.get("merkki") ?? "").trim() || null,
    malli: String(formData.get("malli") ?? "").trim() || null,
    vari_tyyppi: String(formData.get("vari_tyyppi") ?? "yksivarinen") as VariTyyppi,
    arvioitu_kulutus_g: Number(formData.get("arvioitu_kulutus_g") ?? 0),
    kuva_url: String(formData.get("kuva_url") ?? "").trim() || null,
    kate_prosentti: tyhjaksiNumeroksi(formData.get("kate_prosentti")),
    kate_kiintea: tyhjaksiNumeroksi(formData.get("kate_kiintea")),
    manuaalinen_hinta: tyhjaksiNumeroksi(formData.get("manuaalinen_hinta")),
  };
}

function lueTyovaiheet(formData: FormData) {
  return TYO_VAIHEET.map(({ arvo }) => ({
    vaihe: arvo as TyoVaihe,
    tarvitaan: formData.get(`vaihe_${arvo}_tarvitaan`) === "on",
    arvioitu_kesto_min: Number(formData.get(`vaihe_${arvo}_kesto`) ?? 0),
  }));
}

export async function luoOsa(
  _edellinenTila: OsaLomakeTila,
  formData: FormData
): Promise<OsaLomakeTila> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const kentat = lueOsaKentat(formData);
  if (!kentat.nimi) {
    return { virhe: "Nimi vaaditaan." };
  }

  const { data, error } = await supabase.from("osat").insert(kentat).select("id").single();
  if (error || !data) {
    return { virhe: error?.message ?? "Osan luonti epäonnistui." };
  }

  const vaiheet = lueTyovaiheet(formData).map((v) => ({ ...v, osa_id: data.id }));
  const { error: vaiheVirhe } = await supabase.from("osa_tyovaiheet").insert(vaiheet);
  if (vaiheVirhe) {
    return { virhe: vaiheVirhe.message };
  }

  revalidatePath("/osat");
  redirect(`/osat/${data.id}`);
}

export async function paivitaOsa(
  osaId: string,
  _edellinenTila: OsaLomakeTila,
  formData: FormData
): Promise<OsaLomakeTila> {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const kentat = lueOsaKentat(formData);
  if (!kentat.nimi) {
    return { virhe: "Nimi vaaditaan." };
  }

  const { error } = await supabase.from("osat").update(kentat).eq("id", osaId);
  if (error) {
    return { virhe: error.message };
  }

  const vaiheet = lueTyovaiheet(formData).map((v) => ({ ...v, osa_id: osaId }));
  const { error: vaiheVirhe } = await supabase
    .from("osa_tyovaiheet")
    .upsert(vaiheet, { onConflict: "osa_id,vaihe" });
  if (vaiheVirhe) {
    return { virhe: vaiheVirhe.message };
  }

  revalidatePath("/osat");
  revalidatePath(`/osat/${osaId}`);
  return { virhe: null };
}

export async function asetaOsanAktiivisuus(osaId: string, aktiivinen: boolean) {
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("osat").update({ aktiivinen }).eq("id", osaId);
  if (error) throw new Error(error.message);

  revalidatePath("/osat");
  revalidatePath(`/osat/${osaId}`);
}
