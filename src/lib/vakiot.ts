import type { AjoneuvoTyyppi, TyoVaihe, VariTyyppi } from "@/lib/supabase/database.types";

export const TYO_VAIHEET: { arvo: TyoVaihe; nimi: string }[] = [
  { arvo: "pesu", nimi: "Pesu" },
  { arvo: "maalinpoisto", nimi: "Maalinpoisto" },
  { arvo: "puhallus", nimi: "Puhallus" },
  { arvo: "teippaus", nimi: "Teippaus" },
  { arvo: "maalaus", nimi: "Maalaus" },
];

export const AJONEUVOTYYPIT: { arvo: AjoneuvoTyyppi; nimi: string }[] = [
  { arvo: "auto", nimi: "Auto" },
  { arvo: "mopo", nimi: "Mopo" },
  { arvo: "moottoripyora", nimi: "Moottoripyörä" },
];

export const VARI_TYYPIT: { arvo: VariTyyppi; nimi: string }[] = [
  { arvo: "yksivarinen", nimi: "Yksivärinen" },
  { arvo: "candy", nimi: "Candy" },
  { arvo: "illusion", nimi: "Illusion" },
  { arvo: "metallic", nimi: "Metallic" },
  { arvo: "muu_erikois", nimi: "Muu erikoisväri" },
];

export function tyoVaiheenNimi(vaihe: TyoVaihe): string {
  return TYO_VAIHEET.find((v) => v.arvo === vaihe)?.nimi ?? vaihe;
}

export function ajoneuvotyypinNimi(tyyppi: AjoneuvoTyyppi): string {
  return AJONEUVOTYYPIT.find((t) => t.arvo === tyyppi)?.nimi ?? tyyppi;
}

export function variTyypinNimi(tyyppi: VariTyyppi): string {
  return VARI_TYYPIT.find((t) => t.arvo === tyyppi)?.nimi ?? tyyppi;
}

export function muotoileEuro(arvo: number | null | undefined): string {
  if (arvo === null || arvo === undefined) return "-";
  return arvo.toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
}

export function muotoileGrammat(arvo: number | null | undefined): string {
  if (arvo === null || arvo === undefined) return "-";
  return `${arvo.toLocaleString("fi-FI", { maximumFractionDigits: 0 })} g`;
}
