/**
 * Tilikauden koosteen kokoaminen tiedostoiksi.
 *
 * Omassa moduulissaan eikä reittikäsittelijässä samasta syystä kuin
 * luovutus-paketti: koosteen saa ajettua oikealla aineistolla ilman
 * palvelinta.
 *
 * PDF-piirto ja ZIP-pakkaus ovat samat työkalut kuin kuukausipaketissa, ja
 * tekstin siivous tulee sielläkin käytetystä pdfTeksti-funktiosta. Vain
 * sisältö on eri: kooste lukuja, ei tositteita kuvineen.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { zipSync } from "fflate";

import { pdfTeksti } from "@/lib/luovutus";
import { KUUKAUDEN_NIMI, muotoileEuro, muotoileGrammat } from "@/lib/vakiot";
import { PIENHANKINTAKATTO_EUR } from "@/lib/kulut";
import {
  tilikaudenNimi,
  tilikaudenTaulukot,
  type TilikaudenAineisto,
  type TilikaudenMuoto,
} from "@/lib/tilikausi";

const A4 = { leveys: 595.28, korkeus: 841.89 };
const REUNUS = 48;

interface Piirtaja {
  teksti: (teksti: string, koko?: number, lihava?: boolean, harmaa?: boolean) => void;
  rivi: (vasen: string, oikea: string, lihava?: boolean) => void;
  vali: (korkeus?: number) => void;
  otsikko: (teksti: string) => void;
}

async function teePdf(aineisto: TilikaudenAineisto): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const tavallinen = await pdf.embedFont(StandardFonts.Helvetica);
  const lihavaFontti = await pdf.embedFont(StandardFonts.HelveticaBold);
  const leveys = A4.leveys - 2 * REUNUS;

  let sivu = pdf.addPage([A4.leveys, A4.korkeus]);
  let y = A4.korkeus - REUNUS;

  const varmistaTila = (tarve: number) => {
    if (y - tarve >= REUNUS) return;
    sivu = pdf.addPage([A4.leveys, A4.korkeus]);
    y = A4.korkeus - REUNUS;
  };

  const piirraTeksti = (
    teksti: string,
    koko = 11,
    lihava = false,
    harmaa = false,
    x = REUNUS
  ) => {
    varmistaTila(koko + 6);
    sivu.drawText(pdfTeksti(teksti), {
      x,
      y,
      size: koko,
      font: lihava ? lihavaFontti : tavallinen,
      color: harmaa ? rgb(0.42, 0.42, 0.45) : rgb(0.07, 0.07, 0.09),
    });
    y -= koko + 6;
  };

  const p: Piirtaja = {
    teksti: (teksti, koko, lihava, harmaa) => piirraTeksti(teksti, koko, lihava, harmaa),
    vali: (korkeus = 10) => {
      y -= korkeus;
    },
    otsikko: (teksti) => {
      varmistaTila(40);
      y -= 6;
      piirraTeksti(teksti, 14, true);
    },
    // Kaksi saraketta: selite vasemmalle, luku oikealle reunaan tasattuna.
    rivi: (vasen, oikea, lihava = false) => {
      varmistaTila(18);
      const fontti: PDFFont = lihava ? lihavaFontti : tavallinen;
      sivu.drawText(pdfTeksti(vasen), {
        x: REUNUS,
        y,
        size: 10,
        font: fontti,
        color: rgb(0.07, 0.07, 0.09),
      });
      const teksti = pdfTeksti(oikea);
      sivu.drawText(teksti, {
        x: REUNUS + leveys - fontti.widthOfTextAtSize(teksti, 10),
        y,
        size: 10,
        font: fontti,
        color: rgb(0.07, 0.07, 0.09),
      });
      y -= 16;
    },
  };

  p.teksti(`Tilikausi ${aineisto.vuosi}`, 22, true);
  p.teksti("Apuaineisto kirjanpitäjälle", 12, false, true);
  p.vali();

  // --- Varaston arvo ---
  p.otsikko("Varaston arvo 31.12.");
  if (!aineisto.tilannekuva) {
    p.teksti(
      "Tilannekuvaa ei ole otettu. Varaston arvoa ei voi esittää jälkikäteen:",
      10,
      false,
      true
    );
    p.teksti(
      "saldot ovat muuttuneet ja kilohinta on liukuva keskihinta.",
      10,
      false,
      true
    );
  } else {
    const kuva = aineisto.tilannekuva;
    p.teksti(
      `Otettu ${new Date(kuva.otettu).toLocaleString("fi-FI")}${kuva.ottaja ? ` - ${kuva.ottaja}` : ""}`,
      10,
      false,
      true
    );
    p.vali(4);
    for (const rivi of kuva.rivit) {
      if (rivi.saldo_g === 0) continue;
      p.rivi(
        `${rivi.vari_nimi}${rivi.valmistaja ? ` (${rivi.valmistaja})` : ""} - ${muotoileGrammat(rivi.saldo_g)} a ${muotoileEuro(rivi.hinta_per_kg)}/kg`,
        muotoileEuro(rivi.arvo_eur)
      );
    }
    const nollia = kuva.rivit.filter((r) => r.saldo_g === 0).length;
    if (nollia > 0) {
      p.teksti(`${nollia} väriä ilman saldoa, arvo 0.`, 9, false, true);
    }
    p.rivi("Varaston arvo yhteensä", muotoileEuro(kuva.yhteensaEur), true);
  }

  // --- Pienhankinnat ---
  p.otsikko("Pienhankinnat");
  p.rivi(
    `Käytetty ${aineisto.vuosi} (netto, ALV 0 %)`,
    muotoileEuro(aineisto.pienhankinnat.kaytettyEur)
  );
  p.rivi("Katto", muotoileEuro(PIENHANKINTAKATTO_EUR));

  p.otsikko("Yli 1 200 euron hankinnat");
  if (aineisto.pienhankinnat.ylisuuret.length === 0) {
    p.teksti("Ei yli 1 200 euron hankintoja.", 10, false, true);
  } else {
    p.teksti("Eivät ole pienhankintoja vaan poistopohjaa.", 9, false, true);
    for (const y of aineisto.pienhankinnat.ylisuuret) {
      p.rivi(
        `${y.paivays ?? ""} ${y.toimittaja ?? ""} - ${y.teksti}`.trim(),
        muotoileEuro(y.nettoEur)
      );
    }
  }

  // --- Kalusto ja poistot ---
  p.otsikko("Kalusto");
  if (aineisto.kalusto.length === 0) {
    p.teksti("Ei kalustoa.", 10, false, true);
  } else {
    p.teksti("Hankintamenot ALV 0 %.", 9, false, true);
    for (const k of aineisto.kalusto) {
      p.rivi(
        `${k.hankittu} ${k.nimi}${k.luovutettu ? ` - luovutettu ${k.luovutettu}` : ""}`,
        muotoileEuro(k.hankintamenoEur)
      );
    }
  }

  p.otsikko("Menojäännöspoisto");
  if (!aineisto.poistolaskelma) {
    p.teksti("Tilikaudelle ei ole laskettu poistolaskelmaa.", 10, false, true);
  } else {
    const poisto = aineisto.poistolaskelma;
    p.rivi("Menojäännös tilikauden alussa", muotoileEuro(poisto.menojaannosAlussaEur));
    p.rivi("Tilikauden hankinnat", muotoileEuro(poisto.hankinnatEur));
    p.rivi("Tilikauden luovutushinnat", `-${muotoileEuro(poisto.luovutushinnatEur)}`);
    p.rivi("Poistopohja", muotoileEuro(poisto.poistopohjaEur), true);
    p.rivi(
      poisto.kertapoisto
        ? "Poiston enimmäismäärä (kertapoisto, jäännös enintään 1 200 EUR)"
        : "Poiston enimmäismäärä (25 %)",
      muotoileEuro(poisto.poistoEnintaanEur)
    );
    if (poisto.poistoToteutunutEur !== null) {
      p.rivi("Toteutunut poisto (kirjanpidosta)", muotoileEuro(poisto.poistoToteutunutEur));
    }
    p.rivi("Menojäännös tilikauden lopussa", muotoileEuro(poisto.menojaannosLopussaEur), true);
    p.teksti(
      "Enimmäismäärä on yläraja, ei poisto. Verotuksessa ei voi vähentää enempää kuin",
      9,
      false,
      true
    );
    p.teksti("kirjanpidossa on vähennetty (EVL 54 §).", 9, false, true);
  }

  // --- Kululuokat ---
  p.otsikko("Kulut kululuokittain");
  for (const luokka of aineisto.kululuokittain) {
    p.rivi(luokka.nimi, muotoileEuro(luokka.eur));
  }
  p.rivi("Yhteensä", muotoileEuro(aineisto.kulutYhteensaEur), true);

  // --- Myynti ---
  p.otsikko("Myynti kuukausittain");
  for (const kuukausi of aineisto.myyntiKuukausittain) {
    p.rivi(
      `${KUUKAUDEN_NIMI[kuukausi.kuukausi]} - ${kuukausi.toita} ${kuukausi.toita === 1 ? "työ" : "työtä"}, keskihinta ${muotoileEuro(kuukausi.keskihintaEur)}`,
      muotoileEuro(kuukausi.myyntiEur)
    );
  }
  p.rivi("Myynti yhteensä", muotoileEuro(aineisto.myyntiYhteensaEur), true);

  // --- Yksityisotot ---
  p.otsikko("Yksityisotot");
  if (aineisto.yksityisotot.length === 0) {
    p.teksti("Ei yksityisottoja.", 10, false, true);
  } else {
    for (const otto of aineisto.yksityisotot) {
      p.rivi(
        `${otto.paivays} ${otto.toimittaja ?? ""} - ${otto.teksti}`.trim(),
        muotoileEuro(otto.bruttoEur)
      );
    }
    p.rivi("Yksityisotot yhteensä", muotoileEuro(aineisto.yksityisototYhteensaEur), true);
  }

  p.vali();
  p.teksti(
    "Sovellus ei tee verotuspäätöksiä. Tämä on apuaineistoa, josta kirjanpitäjä tekee",
    9,
    false,
    true
  );
  p.teksti("tilinpäätöksen ja veroilmoituksen.", 9, false, true);

  return pdf.save();
}

/** Taulukot yhdeksi ZIP:ksi. Sisältö on tekstiä, joten pakkaus kannattaa. */
function taulukotZipiksi(aineisto: TilikaudenAineisto): Uint8Array {
  const tiedostot: Record<string, Uint8Array> = {};
  const koodain = new TextEncoder();
  for (const [nimi, sisalto] of tilikaudenTaulukot(aineisto)) {
    tiedostot[nimi] = koodain.encode(sisalto);
  }
  return zipSync(tiedostot);
}

export async function kokoaTilikausi(
  aineisto: TilikaudenAineisto,
  muodot: TilikaudenMuoto[]
): Promise<Map<string, Uint8Array>> {
  const paketti = new Map<string, Uint8Array>();

  if (muodot.includes("pdf")) {
    paketti.set(tilikaudenNimi(aineisto.vuosi, "pdf"), await teePdf(aineisto));
  }
  if (muodot.includes("csv")) {
    paketti.set(tilikaudenNimi(aineisto.vuosi, "csv"), taulukotZipiksi(aineisto));
  }

  return paketti;
}
