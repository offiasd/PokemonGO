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

/**
 * Kuva pienemmäksi.
 *
 * PDF ja HEIC menevät läpi sellaisenaan: canvas ei osaa niitä, ja PDF on jo
 * valmiiksi pieni.
 */
export async function pakkaaKuva(tiedosto: File): Promise<File> {
  if (!tiedosto.type.startsWith("image/") || tiedosto.type === "image/heic") return tiedosto;

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
): Promise<{ ok: true; polku: string; tyyppi: string } | { ok: false; virhe: string }> {
  const pakattu = await pakkaaKuva(tiedosto);
  if (pakattu.size > ENIMMAISKOKO_TAVUA) {
    return {
      ok: false,
      virhe: `Tiedosto on ${(pakattu.size / 1024 / 1024).toFixed(1)} MB - yläraja on 10 MB.`,
    };
  }

  const paate = pakattu.name.split(".").pop() ?? "jpg";
  const polku = `${new Date().getFullYear()}/${crypto.randomUUID()}.${paate}`;
  const { error } = await createClient().storage.from("kuitit").upload(polku, pakattu, {
    contentType: pakattu.type,
    upsert: false,
  });
  if (error) return { ok: false, virhe: `Lataus epäonnistui: ${error.message}` };

  return { ok: true, polku, tyyppi: pakattu.type };
}
