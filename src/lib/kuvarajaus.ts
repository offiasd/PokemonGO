/**
 * Osan kuvan rajaus kortissa.
 *
 * Kuva täyttää koko kortin, joten näkyvä kohta on osakohtainen päätös. Rajaus
 * on prosentteina eikä pikseleinä, jotta sama asetus toimii puhelimen pienessä
 * ja työpöydän isossa kortissa.
 *
 * object-position kertoo mikä kohta kuvasta pysyy näkyvissä: 0 % = vasen tai
 * ylä, 100 % = oikea tai ala. Zoom suurentaa saman kohdan ympäri, joten
 * transform-origin on sama piste - muuten suurennus karkaisi keskeltä.
 */
export interface Kuvarajaus {
  x: number;
  y: number;
  zoom: number;
}

export const OLETUSRAJAUS: Kuvarajaus = { x: 50, y: 50, zoom: 1 };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

// Kaksi desimaalia riittää: kanta tallentaa numeric(5,2), ja pidempi luku
// näkyisi turhaan lomakkeen piilokentässä.
const rajaa = (arvo: number, ala: number, yla: number) =>
  Math.round(Math.min(Math.max(Number.isFinite(arvo) ? arvo : ala, ala), yla) * 100) / 100;

/** Siistii kannasta tai lomakkeelta tulevan rajauksen sallituille väleille. */
export function siistiRajaus(rajaus: Partial<Kuvarajaus> | null | undefined): Kuvarajaus {
  return {
    x: rajaa(Number(rajaus?.x ?? OLETUSRAJAUS.x), 0, 100),
    y: rajaa(Number(rajaus?.y ?? OLETUSRAJAUS.y), 0, 100),
    zoom: rajaa(Number(rajaus?.zoom ?? OLETUSRAJAUS.zoom), ZOOM_MIN, ZOOM_MAX),
  };
}

/** Tyylit kuvalle, joka täyttää kehyksensä annetulla rajauksella. */
export function rajauksenTyyli(rajaus: Kuvarajaus): React.CSSProperties {
  const kohta = `${rajaus.x}% ${rajaus.y}%`;
  return {
    objectFit: "cover",
    objectPosition: kohta,
    transform: rajaus.zoom === 1 ? undefined : `scale(${rajaus.zoom})`,
    transformOrigin: kohta,
  };
}
