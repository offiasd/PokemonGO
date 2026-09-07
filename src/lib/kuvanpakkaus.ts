/**
 * Kuittikuvan pakkaus selaimessa.
 *
 * Kuusi vuotta kuitteja on satoja kuvia, ja puhelimen kamera tuottaa niistä
 * jokaisesta useita megatavuja. Pakkaus tehdään ennen lähetystä, joten
 * Storageen tallentuva tiedosto on jo tämä - alkuperäiseen ei kosketa
 * jälkikäteen.
 *
 * Omassa moduulissaan, koska sekä kuitin lisäys että uudelleenkuvaus
 * tarvitsevat saman käsittelyn.
 */

import { createClient } from "@/lib/supabase/client";

/** Kantaan asetettu yläraja on 10 MB; tarkistetaan jo selaimessa. */
export const ENIMMAISKOKO_TAVUA = 10 * 1024 * 1024;
/**
 * Pidemmän sivun pikselimäärä pakkauksen jälkeen.
 *
 * Pitkä lämpöpaperikuitti kuvataan yhtenä otoksena, jolloin rivin teksti jää
 * muutamaan kymmeneen pikseliin. Poiminta lukee sen sitä varmemmin mitä
 * enemmän pikseleitä on, ja tällä koolla pakattu kuva on yhä noin megatavun
 * luokkaa - kaukana Storagen 10 MB:n ja poiminnan 4,5 MB:n rajoista.
 */
const PAKATUN_SIVU_PX = 2600;
const PAKKAUKSEN_LAATU = 0.85;

/** Onko tiedosto iPhonen oletusmuotoa. Osa selaimista jättää tyypin tyhjäksi. */
export function onHeic(tiedosto: File): boolean {
  return (
    /^image\/(heic|heif)/i.test(tiedosto.type) || /\.(heic|heif)$/i.test(tiedosto.name)
  );
}

/**
 * HEIC JPEG:ksi.
 *
 * iPhonen oletusmuotoa ei lue moni kirjasto eikä poiminnan käyttämä rajapinta.
 * Muunnos tehdään selaimessa ennen lähetystä, jotta Storageen tallentuu se
 * tiedosto jota kaikki osaavat lukea - jälkikäteen muunnos vaatisi
 * palvelinpuolen purkajan.
 *
 * Safari osaa HEIC:in itse, joten siellä riittää canvas. Muualla ladataan
 * purkaja vasta kun sellainen tiedosto tulee vastaan: se on iso, eikä sitä
 * kannata pitää mukana jokaisella sivulatauksella.
 */
export async function muunnaHeic(tiedosto: File): Promise<File> {
  if (!onHeic(tiedosto)) return tiedosto;

  const nimi = tiedosto.name.replace(/\.[^.]+$/, "") + ".jpg";

  const kuva = await createImageBitmap(tiedosto).catch(() => null);
  if (kuva) {
    const canvas = document.createElement("canvas");
    canvas.width = kuva.width;
    canvas.height = kuva.height;
    const konteksti = canvas.getContext("2d");
    if (konteksti) {
      konteksti.drawImage(kuva, 0, 0);
      const jpeg = await new Promise<Blob | null>((valmis) =>
        canvas.toBlob(valmis, "image/jpeg", PAKKAUKSEN_LAATU)
      );
      if (jpeg) return new File([jpeg], nimi, { type: "image/jpeg" });
    }
  }

  const { default: heic2any } = await import("heic2any");
  const tulos = await heic2any({ blob: tiedosto, toType: "image/jpeg", quality: PAKKAUKSEN_LAATU });
  const blob = Array.isArray(tulos) ? tulos[0] : tulos;
  return new File([blob], nimi, { type: "image/jpeg" });
}

/**
 * Tiedoston SHA-256 heksana.
 *
 * Sama kuitti tulee helposti kahdesti kun valitsee galleriasta, ja tiedoston
 * nimi ei kerro siitä mitään: vertailu tehdään sisällöstä.
 */
export async function tiivista(tiedosto: File): Promise<string> {
  const tavut = await tiedosto.arrayBuffer();
  const tiiviste = await crypto.subtle.digest("SHA-256", tavut);
  return [...new Uint8Array(tiiviste)].map((t) => t.toString(16).padStart(2, "0")).join("");
}

/**
 * Kuva pienemmäksi.
 *
 * PDF menee läpi sellaisenaan: canvas ei osaa sitä, ja PDF on jo valmiiksi
 * pieni. HEIC muunnetaan ensin JPEG:ksi.
 */
export async function pakkaaKuva(tiedosto: File): Promise<File> {
  if (onHeic(tiedosto)) tiedosto = await muunnaHeic(tiedosto).catch(() => tiedosto);
  if (!tiedosto.type.startsWith("image/") || onHeic(tiedosto)) return tiedosto;

  const kuva = await createImageBitmap(tiedosto).catch(() => null);
  if (!kuva) return tiedosto;

  const suurin = Math.max(kuva.width, kuva.height);
  const kerroin = suurin > PAKATUN_SIVU_PX ? PAKATUN_SIVU_PX / suurin : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(kuva.width * kerroin);
  canvas.height = Math.round(kuva.height * kerroin);
  const konteksti = canvas.getContext("2d");
  if (!konteksti) return tiedosto;
  konteksti.drawImage(kuva, 0, 0, canvas.width, canvas.height);

  const pakattu = await new Promise<Blob | null>((valmis) =>
    canvas.toBlob(valmis, "image/jpeg", PAKKAUKSEN_LAATU)
  );
  // Jos pakkaus ei pienennä, käytetään alkuperäistä: pieni kuva voi kasvaa
  // uudelleenpakkauksessa.
  if (!pakattu || pakattu.size >= tiedosto.size) return tiedosto;

  return new File([pakattu], tiedosto.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}

/**
 * Pakkaa ja lataa kuitin tiedoston Storageen.
 *
 * Palauttaa polun, tai virheen syyn suomeksi. Polku on vuosikansiossa, jotta
 * kuusi vuotta kuitteja pysyy selattavana myös ämpärin puolella.
 */
export async function lataaKuitinTiedosto(
  tiedosto: File
): Promise<
  { ok: true; polku: string; tyyppi: string; tiiviste: string } | { ok: false; virhe: string }
> {
  let pakattu: File;
  try {
    pakattu = await pakkaaKuva(tiedosto);
  } catch {
    return {
      ok: false,
      virhe: onHeic(tiedosto)
        ? "HEIC-kuvaa ei saatu muunnettua. Tallenna kuva JPEG-muodossa ja yritä uudelleen."
        : "Kuvaa ei saatu käsiteltyä. Kuvaa kuitti uudelleen.",
    };
  }

  if (pakattu.size > ENIMMAISKOKO_TAVUA) {
    return {
      ok: false,
      virhe: `Tiedosto on ${(pakattu.size / 1024 / 1024).toFixed(1)} MB - yläraja on 10 MB.`,
    };
  }

  // Tiiviste lasketaan pakatusta tiedostosta: se on se mikä Storageen menee,
  // ja sama kuva kahdesti valittuna pakkautuu samaksi tavujonoksi.
  const tiiviste = await tiivista(pakattu);

  const paate = pakattu.name.split(".").pop() ?? "jpg";
  const polku = `${new Date().getFullYear()}/${crypto.randomUUID()}.${paate}`;
  const { error } = await createClient().storage.from("kuitit").upload(polku, pakattu, {
    contentType: pakattu.type,
    upsert: false,
  });
  if (error) return { ok: false, virhe: `Lataus epäonnistui: ${error.message}` };

  return { ok: true, polku, tyyppi: pakattu.type, tiiviste };
}
