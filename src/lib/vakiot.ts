import type {
  AjoneuvoTyyppi,
  MaaliTyyppi,
  MyytavaMaaliTyyppi,
  ToinenVariRooli,
  TyoVaihe,
  VariTyyppi,
} from "@/lib/supabase/database.types";

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

// Järjestys määrää myös värilistan kategoriajärjestyksen (/varit).
export const MAALI_TYYPIT: { arvo: MaaliTyyppi; nimi: string }[] = [
  { arvo: "solid", nimi: "Solid / RAL" },
  { arvo: "metallic", nimi: "Metallic" },
  { arvo: "pohjavari", nimi: "Pohjavärit" },
  { arvo: "candy", nimi: "Candy" },
  { arvo: "illusion", nimi: "Illusion" },
  { arvo: "transparent", nimi: "Lakat" },
  { arvo: "muu", nimi: "Muu" },
];

export function maaliTyypinNimi(tyyppi: MaaliTyyppi): string {
  return MAALI_TYYPIT.find((t) => t.arvo === tyyppi)?.nimi ?? tyyppi;
}

export function myytavaMaaliTyypinNimi(tyyppi: MyytavaMaaliTyyppi): string {
  return MYYTAVAT_MAALI_TYYPIT.find((t) => t.arvo === tyyppi)?.nimi ?? tyyppi;
}

// Kategoriahinnoiteltavat tyypit (myydään aina omana työnä osalle) - alijoukko
// MAALI_TYYPIT:istä. Lakat/Muu eivät ole tässä, koska niitä ei myydä yksinään
// (lakka on candy/illusion-työn sisäänrakennettu osa tai solidin valinnainen lisä).
export const MYYTAVAT_MAALI_TYYPIT: { arvo: MyytavaMaaliTyyppi; nimi: string }[] =
  MAALI_TYYPIT.filter(
    (t): t is { arvo: MyytavaMaaliTyyppi; nimi: string } =>
      t.arvo === "solid" || t.arvo === "metallic" || t.arvo === "candy" || t.arvo === "illusion"
  );

export const TOINEN_VARI_ROOLIN_NIMI: Record<ToinenVariRooli, string> = {
  pohjavari: "Pohjaväri",
  lakka: "Lakka",
};

// Candy vaatii aina pohjavärin, illusion aina lakan - solidille lakkaus on
// valinnainen lisä. Käytössä väri+hinta-valinnassa (Uusi työ, osan sivu).
export const PAKOLLINEN_TOINEN_VARI_ROOLI: Partial<Record<MyytavaMaaliTyyppi, ToinenVariRooli>> = {
  candy: "pohjavari",
  illusion: "lakka",
};
export const VALINNAINEN_TOINEN_VARI_ROOLI: Partial<Record<MyytavaMaaliTyyppi, ToinenVariRooli>> = {
  solid: "lakka",
};

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

export function muotoileValiEuro(min: number, max: number): string {
  return min === max ? muotoileEuro(min) : `${muotoileEuro(min)} - ${muotoileEuro(max)}`;
}
