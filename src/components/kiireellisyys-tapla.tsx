import { cn } from "@/lib/utils";
import {
  KIIREELLISYYDEN_NIMI,
  KIIREELLISYYDEN_VARI,
  kiireellisyys,
  odotusPaivat,
} from "@/lib/vakiot";

/**
 * Väritäplä vastaanotetulle työlle: vihreä kun aikaa on, keltainen kun raja
 * lähestyy ja punainen kun se on ylitetty. Rajat tulevat asetuksista, koska ne
 * ovat maalaamon oma lupaus asiakkaalle.
 *
 * Odotusaika luetaan tekstinä täplän vieressä, jottei väri jää ainoaksi
 * tiedoksi - väri yksin ei kerro mitään värisokealle eikä ruudunlukijalle.
 */
export function KiireellisyysTapla({
  vastaanotettu,
  rajat,
  naytaTeksti = true,
}: {
  vastaanotettu: string;
  rajat: { vastaanotto_varoitus_paivat: number; vastaanotto_kriittinen_paivat: number };
  naytaTeksti?: boolean;
}) {
  const paivat = odotusPaivat(vastaanotettu);
  const taso = kiireellisyys(paivat, rajat);
  const odotusteksti = paivat === 0 ? "tänään" : `${paivat} vrk`;

  return (
    <span className="flex items-center gap-2 text-sm">
      <span
        className={cn("size-2.5 shrink-0 rounded-full", KIIREELLISYYDEN_VARI[taso])}
        title={`${KIIREELLISYYDEN_NIMI[taso]} - odottanut ${odotusteksti}`}
        aria-hidden
      />
      {naytaTeksti && (
        <span className={cn(taso === "myohassa" && "font-medium text-destructive")}>
          {KIIREELLISYYDEN_NIMI[taso]} - odottanut {odotusteksti}
        </span>
      )}
      {!naytaTeksti && (
        <span className="sr-only">
          {KIIREELLISYYDEN_NIMI[taso]} - odottanut {odotusteksti}
        </span>
      )}
    </span>
  );
}
