/**
 * Luovutuspaketin kokoaminen tiedostoiksi.
 *
 * Omassa moduulissaan eikä reittikäsittelijässä, jotta paketin saa koottua
 * oikealla aineistolla ilman palvelinta: PDF:n sivumäärän ja ZIP:n
 * tiedostonimet on voitava tarkistaa ajamalla.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { zipSync } from "fflate";

import { KUUKAUDEN_NIMI, muotoileEuro } from "@/lib/vakiot";
import { kayttotarkoituksenNimi } from "@/lib/kulut";
import {
  csvSisalto,
  kuitinKuluina,
  kuvanTiedostonimi,
  paketinNimi,
  ryhmittele,
  pdfTeksti,
  type Vientiasetukset,
  type VientiKuitti,
} from "@/lib/luovutus";

/** Tosite Storagesta, jaettuna PDF-koosteen ja kuva-ZIP:n kesken. */
export interface Tosite {
  data: Uint8Array;
  tyyppi: string;
}

const A4 = { leveys: 595.28, korkeus: 841.89 };
const REUNUS = 48;

function otsikkoKaudelle(kausi: string): string {
  const [vuosi, kuukausi] = kausi.split("-");
  return `${KUUKAUDEN_NIMI[Number(kuukausi) - 1]} ${vuosi}`;
}

/** Rivinvaihto sivun leveyteen. pdf-lib ei katkaise tekstiä itse. */
function katkaise(teksti: string, fontti: PDFFont, koko: number, leveys: number): string[] {
  const sanat = pdfTeksti(teksti).split(/\s+/).filter(Boolean);
  const rivit: string[] = [];
  let nykyinen = "";
  for (const sana of sanat) {
    const ehdotus = nykyinen ? `${nykyinen} ${sana}` : sana;
    if (fontti.widthOfTextAtSize(ehdotus, koko) > leveys && nykyinen) {
      rivit.push(nykyinen);
      nykyinen = sana;
    } else {
      nykyinen = ehdotus;
    }
  }
  if (nykyinen) rivit.push(nykyinen);
  return rivit.length > 0 ? rivit : [""];
}

interface Kirjasimet {
  tavallinen: PDFFont;
  lihava: PDFFont;
}

/**
 * PDF-kooste: kansilehti summilla ja kuitti per sivu kuvineen.
 *
 * Kirjanpitäjä selaa tätä yhtenä tiedostona, joten kuitin tiedot ovat samalla
 * sivulla kuvan kanssa. Monisivuinen PDF-kuitti liitetään alkuperäisenä sen
 * jälkeen: laskun kaikki sivut kuuluvat tositteeseen.
 */
async function teePdf(
  kausi: string,
  kuitit: VientiKuitti[],
  asetukset: Vientiasetukset,
  tiedostot: Map<string, { data: Uint8Array; tyyppi: string }>
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const kirjasimet: Kirjasimet = {
    tavallinen: await pdf.embedFont(StandardFonts.Helvetica),
    lihava: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const ryhmat = ryhmittele(kuitit, asetukset.ryhmittely);
  const leveys = A4.leveys - 2 * REUNUS;

  // --- Kansilehti ---
  const kansi = pdf.addPage([A4.leveys, A4.korkeus]);
  let y = A4.korkeus - REUNUS;

  const piirra = (teksti: string, koko: number, lihava = false, harmaa = false) => {
    kansi.drawText(pdfTeksti(teksti), {
      x: REUNUS,
      y,
      size: koko,
      font: lihava ? kirjasimet.lihava : kirjasimet.tavallinen,
      color: harmaa ? rgb(0.42, 0.42, 0.45) : rgb(0.07, 0.07, 0.09),
    });
    y -= koko + 6;
  };

  piirra("Kuitit kirjanpitoon", 22, true);
  piirra(otsikkoKaudelle(kausi), 16);
  y -= 10;

  const kuluina = kuitit.reduce((summa, k) => summa + kuitinKuluina(k), 0);
  const yhteensa = kuitit.reduce(
    (summa, k) => summa + k.rivit.reduce((r, rivi) => r + rivi.brutto_eur, 0),
    0
  );

  piirra(`Kuitteja: ${kuitit.length}`, 11);
  piirra(`Kuluina: ${muotoileEuro(kuluina)}`, 11);
  piirra(`Yhteensä: ${muotoileEuro(yhteensa)}`, 11);
  y -= 6;
  piirra(`Ryhmittely: ${asetukset.ryhmittely} · tarkkuus: ${asetukset.tarkkuus}`, 10, false, true);
  if (!asetukset.yksityisototMukaan) {
    piirra(
      "Yksityisotot on jätetty pois, joten kuitin loppusumma ei täsmää eriteltyihin riveihin.",
      10,
      false,
      true
    );
  }
  y -= 10;

  // Kansilehden sisällysluettelo mahtuu yhdelle sivulle; loput kuitit ovat
  // omilla sivuillaan, joten luettelon katkeaminen ei hukkaa mitään.
  luettelo: for (const ryhma of ryhmat) {
    if (y < REUNUS + 40) break;
    piirra(ryhma.otsikko, 12, true);
    for (const kuitti of ryhma.kuitit) {
      const nimi = `${kuitti.paivays}  ${kuitti.toimittaja ?? "Toimittaja puuttuu"}`;
      const summa = muotoileEuro(kuitti.loppusumma_eur);
      kansi.drawText(pdfTeksti(nimi), {
        x: REUNUS + 10,
        y,
        size: 10,
        font: kirjasimet.tavallinen,
        color: rgb(0.07, 0.07, 0.09),
      });
      kansi.drawText(pdfTeksti(summa), {
        x: A4.leveys - REUNUS - kirjasimet.tavallinen.widthOfTextAtSize(pdfTeksti(summa), 10),
        y,
        size: 10,
        font: kirjasimet.tavallinen,
        color: rgb(0.07, 0.07, 0.09),
      });
      y -= 15;
      if (y < REUNUS) break luettelo;
    }
    y -= 8;
  }

  // --- Kuitti per sivu ---
  for (const ryhma of ryhmat) {
    for (const kuitti of ryhma.kuitit) {
      let sivu = pdf.addPage([A4.leveys, A4.korkeus]);
      let sy = A4.korkeus - REUNUS;

      const teksti = (arvo: string, koko: number, lihava = false, harmaa = false) => {
        sivu.drawText(pdfTeksti(arvo), {
          x: REUNUS,
          y: sy,
          size: koko,
          font: lihava ? kirjasimet.lihava : kirjasimet.tavallinen,
          color: harmaa ? rgb(0.42, 0.42, 0.45) : rgb(0.07, 0.07, 0.09),
        });
        sy -= koko + 5;
      };

      teksti(kuitti.toimittaja ?? "Toimittaja puuttuu", 15, true);
      teksti(
        `${kuitti.paivays}${kuitti.maksupaiva ? ` · maksettu ${kuitti.maksupaiva}` : ""} · ${ryhma.otsikko}`,
        10,
        false,
        true
      );
      teksti(
        `Loppusumma ${muotoileEuro(kuitti.loppusumma_eur)} · kuluina ${muotoileEuro(kuitinKuluina(kuitti))}`,
        11
      );
      if (kuitti.muistiinpano) {
        for (const rivi of katkaise(kuitti.muistiinpano, kirjasimet.tavallinen, 10, leveys)) {
          teksti(rivi, 10, false, true);
        }
      }
      sy -= 4;

      if (asetukset.tarkkuus === "rivitaso") {
        for (const rivi of kuitti.rivit) {
          if (sy < 260) break;
          const vasen = katkaise(rivi.teksti, kirjasimet.tavallinen, 9, leveys - 150)[0];
          sivu.drawText(pdfTeksti(vasen), {
            x: REUNUS,
            y: sy,
            size: 9,
            font: kirjasimet.tavallinen,
            color: rgb(0.07, 0.07, 0.09),
          });
          const oikea = pdfTeksti(muotoileEuro(rivi.brutto_eur));
          sivu.drawText(oikea, {
            x: A4.leveys - REUNUS - kirjasimet.tavallinen.widthOfTextAtSize(oikea, 9),
            y: sy,
            size: 9,
            font: kirjasimet.tavallinen,
            color: rgb(0.07, 0.07, 0.09),
          });
          sy -= 11;
          const selite = [
            rivi.kayttotarkoitus ? kayttotarkoituksenNimi(rivi.kayttotarkoitus) : "Luokittelematta",
            rivi.kululuokka,
            rivi.verokanta !== null ? `alv ${String(rivi.verokanta).replace(".", ",")} %` : null,
            rivi.muistiinpano,
          ]
            .filter(Boolean)
            .join(" · ");
          sivu.drawText(pdfTeksti(selite), {
            x: REUNUS + 8,
            y: sy,
            size: 8,
            font: kirjasimet.tavallinen,
            color: rgb(0.42, 0.42, 0.45),
          });
          sy -= 13;
        }
      }

      // --- Tosite ---
      // Kuitilla voi olla monta sivua. Ensimmäinen mahtuu tietojen alle samalle
      // sivulle, loput saavat omansa: puolikas kuitti ei ole tosite.
      const sivutTositteesta = kuitti.liitteet
        .map((liite) => tiedostot.get(liite.polku))
        .filter((t): t is Tosite => t !== undefined);

      if (sivutTositteesta.length === 0) {
        sy -= 10;
        teksti("Tositetta ei ole liitetty.", 10, false, true);
        continue;
      }

      if (sivutTositteesta.length > 1) {
        teksti(`Tosite on ${sivutTositteesta.length} sivua.`, 10, false, true);
      }

      let ensimmainen = true;
      for (const tiedosto of sivutTositteesta) {
        if (tiedosto.tyyppi === "application/pdf") {
          if (ensimmainen) teksti("Tosite on liitetty seuraavina sivuina.", 10, false, true);
          try {
            const lahde = await PDFDocument.load(tiedosto.data);
            const sivut = await pdf.copyPages(lahde, lahde.getPageIndices());
            for (const kopio of sivut) pdf.addPage(kopio);
          } catch {
            // Vioittunut PDF ei saa kaataa koko koostetta: muut kuitit ovat
            // silti luovutettavia, ja puute näkyy koosteessa.
            teksti("Tositetta ei saatu liitettyä.", 10, false, true);
          }
          ensimmainen = false;
          continue;
        }

        let kuva: PDFImage;
        try {
          kuva =
            tiedosto.tyyppi === "image/png"
              ? await pdf.embedPng(tiedosto.data)
              : await pdf.embedJpg(tiedosto.data);
        } catch {
          teksti("Tositetta ei saatu liitettyä.", 10, false, true);
          ensimmainen = false;
          continue;
        }

        // Seuraaville sivuille oma sivunsa: kuitin tietojen alla oleva tila
        // riittää vain yhdelle kuvalle.
        if (!ensimmainen) {
          sivu = pdf.addPage([A4.leveys, A4.korkeus]);
          sy = A4.korkeus - REUNUS;
        }

        const tilaaKorkeutta = sy - REUNUS - 10;
        const kerroin = Math.min(leveys / kuva.width, tilaaKorkeutta / kuva.height, 1);
        sivu.drawImage(kuva, {
          x: REUNUS,
          y: sy - kuva.height * kerroin - 10,
          width: kuva.width * kerroin,
          height: kuva.height * kerroin,
        });
        ensimmainen = false;
      }
    }
  }

  return pdf.save();
}


/**
 * Valitut muodot tiedostoiksi.
 *
 * Palauttaa nimen ja sisällön pareina; kutsuja päättää palautetaanko yksi
 * tiedosto sellaisenaan vai kaikki yhtenä ZIP:nä.
 */
export function kokoaTiedostot(
  kausi: string,
  kuitit: VientiKuitti[],
  asetukset: Vientiasetukset,
  tiedostot: Map<string, Tosite>
): Promise<Map<string, Uint8Array>> {
  return (async () => {
    const paketti = new Map<string, Uint8Array>();

    if (asetukset.muodot.includes("csv")) {
      paketti.set(
        paketinNimi(kausi, "csv"),
        new TextEncoder().encode(csvSisalto(kuitit, asetukset))
      );
    }

    if (asetukset.muodot.includes("pdf")) {
      paketti.set(paketinNimi(kausi, "pdf"), await teePdf(kausi, kuitit, asetukset, tiedostot));
    }

    if (asetukset.muodot.includes("zip")) {
      const kuvat: Record<string, Uint8Array> = {};
      for (const kuitti of kuitit) {
        for (const liite of kuitti.liitteet) {
          const tosite = tiedostot.get(liite.polku);
          if (!tosite) continue;
          // Sama toimittaja, päivä ja summa voi esiintyä kahdesti, ja saman
          // kuitin sivut jakavat nimen; juokseva numero erottaa ne toisistaan
          // eikä ylikirjoita.
          let nimi = kuvanTiedostonimi(kuitti);
          let numero = 2;
          while (kuvat[nimi]) {
            nimi = kuvanTiedostonimi(kuitti).replace(/(\.[^.]+)$/, `_${numero++}$1`);
          }
          kuvat[nimi] = tosite.data;
        }
      }
      // Kuvat ovat jo pakattuja; uudelleenpakkaus veisi aikaa eikä tilaa.
      paketti.set(paketinNimi(kausi, "zip"), zipSync(kuvat, { level: 0 }));
    }

    return paketti;
  })();
}
