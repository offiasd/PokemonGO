/**
 * Arviolomakkeen maalilistan säännöt toimeksiannon testitapauksilla A-I.
 *
 * Aja: npm run testaa-arviomaalit
 *
 * Värit ovat oikean kannan arvoja (Super Chrome Plus on metallic joka vaatii
 * lakan ja on myös asetusten oletuspohjaväri, Soft Red Candy vaatii pohjan
 * muttei lakkaa), jotta säännöt tulevat koetelluiksi juuri niillä
 * yhdistelmillä joita maalaamolla käytetään.
 */
// TypeScript luetaan Noden omalla tyyppien riisunnalla, jolloin skripti ei
// tarvitse käännöstyökalua eikä omaa riippuvuutta. Vaatii node 22:n lipun,
// joka on npm-skriptissä valmiina.
const { laskeArvionMaalit, PAAMAALIN_AVAIN, LAKAN_AVAIN, pohjanAvain } = await import(
  new URL("../src/lib/arviomaalit.ts", import.meta.url).href
);

const V = {
  scp:    { id: "scp", nimi: "Super Chrome Plus", vaatii_pohjavarin: false, vaatii_lakkauksen: true,  saldo_g: 1687, varattu_g: 15 },
  clear:  { id: "clear", nimi: "High Performance SC Clear", vaatii_pohjavarin: false, vaatii_lakkauksen: false, saldo_g: 847, varattu_g: 115 },
  candy:  { id: "candy", nimi: "Soft Red Candy", vaatii_pohjavarin: true, vaatii_lakkauksen: false, saldo_g: 1267, varattu_g: 0 },
  ral5015:{ id: "ral5015", nimi: "RAL 5015", vaatii_pohjavarin: false, vaatii_lakkauksen: false, saldo_g: 1000, varattu_g: 260 },
  ral9016:{ id: "ral9016", nimi: "RAL 9016", vaatii_pohjavarin: false, vaatii_lakkauksen: false, saldo_g: 5419, varattu_g: 70 },
  purple: { id: "purple", nimi: "Illusion Purple", vaatii_pohjavarin: false, vaatii_lakkauksen: true, saldo_g: 1500, varattu_g: 0 },
};
const varit = Object.values(V);
const aja = (maalit, { saadot = [], osanLakkausKulutusG = null } = {}) =>
  laskeArvionMaalit({ maalit, saadot, varit, oletusPohjavariId: "scp", oletusLakkaId: "clear", osanLakkausKulutusG });

const paa = (variId, kulutus) => ({ avain: PAAMAALIN_AVAIN, variId, kulutus });
const lisa = (avain, variId, kulutus) => ({ avain, variId, kulutus });
const kuvaile = (t) => t.rivit.map((r) => `${r.rooli}:${r.variNimi}=${r.kulutusG}g${r.muokattu ? "(muokattu)" : ""}`).join(" | ");

let virheita = 0;
const tarkista = (nimi, ehto, lisatieto = "") => {
  console.log(`${ehto ? "OK  " : "EI  "} ${nimi}${lisatieto ? "  -> " + lisatieto : ""}`);
  if (!ehto) virheita++;
};

// A. Lakkaa vaativa metallic Muu kohteena
{
  const t = aja([paa("scp", "30")]);
  tarkista("A rivit", kuvaile(t) === "paamaali:Super Chrome Plus=30g | lakka:High Performance SC Clear=30g", kuvaile(t));
  tarkista("A ei varoituksia", t.varoitukset.length === 0, JSON.stringify(t.varoitukset.map((v) => v.laji)));
}
// B. Grammat seuraavat, muokattu jää
{
  const t1 = aja([paa("scp", "50")]);
  tarkista("B lakka seuraa 50 g", t1.rivit.find((r) => r.rooli === "lakka").kulutusG === 50);
  const t2 = aja([paa("scp", "60")], { saadot: [{ avain: LAKAN_AVAIN, kulutus: "40" }] });
  const lakka = t2.rivit.find((r) => r.rooli === "lakka");
  tarkista("B muokattu lakka pysyy 40 g", lakka.kulutusG === 40 && lakka.muokattu === true, kuvaile(t2));
}
// C. Candy Muu kohteena
{
  const t = aja([paa("candy", "20")]);
  tarkista("C pohja 20 g, ei lakkaa", kuvaile(t) === "paamaali:Soft Red Candy=20g | pohjavari:Super Chrome Plus=20g", kuvaile(t));
  tarkista("C ei varoituksia", t.varoitukset.length === 0, JSON.stringify(t.varoitukset));
}
// D. Perusväri
{
  const t = aja([paa("ral5015", "30")]);
  tarkista("D vain yksi rivi", t.rivit.length === 1 && t.rivit[0].kulutusG === 30, kuvaile(t));
}
// E. Lisätty illusion
{
  const t = aja([paa("ral9016", "160"), lisa("l1", "purple", "20")]);
  const lakat = t.rivit.filter((r) => r.rooli === "lakka");
  tarkista("E yksi lakkarivi 160 g", lakat.length === 1 && lakat[0].kulutusG === 160, kuvaile(t));
}
// F. Lakan poisto
{
  const t = aja([paa("scp", "30")], { saadot: [{ avain: LAKAN_AVAIN, poistettu: true }] });
  tarkista("F ei lakkariviä, varoitus", t.rivit.length === 1 && t.varoitukset.some((v) => v.laji === "lakka_puuttuu"),
    JSON.stringify(t.varoitukset.map((v) => v.viesti)));
}
// I. Luettelo-osa omalla arviolla
{
  const t = aja([paa("scp", "70")], { osanLakkausKulutusG: 60 });
  tarkista("I lakka 60 g osan tiedoista", t.rivit.find((r) => r.rooli === "lakka").kulutusG === 60, kuvaile(t));
}
// Lisäksi: pohjaväri per maali, saldovaroitus, nollakulutus
{
  const t = aja([paa("candy", "20"), lisa("l1", "candy", "10")]);
  tarkista("kaksi pohjariviä", t.rivit.filter((r) => r.rooli === "pohjavari").length === 2, kuvaile(t));
  const pohjat = t.rivit.filter((r) => r.rooli === "pohjavari").map((r) => r.kulutusG);
  tarkista("pohjat seuraavat omia lähteitään", JSON.stringify(pohjat) === "[20,10]", JSON.stringify(pohjat));
  tarkista("sama väri kahdesti ei kaada saldolaskentaa", t.kulutusYhteensaG === 60, String(t.kulutusYhteensaG));
}
{
  const t = aja([paa("purple", "800")]); // lakkaa vapaana 847-115=732 g
  tarkista("saldovaroitus lakasta", t.varoitukset.some((v) => v.laji === "saldo"),
    JSON.stringify(t.varoitukset.map((v) => v.viesti)));
}
{
  const t = aja([paa("ral5015", "")]);
  tarkista("tyhjä kulutus varoittaa", t.varoitukset.some((v) => v.laji === "kulutus_nolla"));
}
{
  const t = aja([paa("candy", "20")], { saadot: [{ avain: pohjanAvain(PAAMAALIN_AVAIN), variId: "ral9016", kulutus: "35" }] });
  const pohja = t.rivit.find((r) => r.rooli === "pohjavari");
  tarkista("pohjan väri ja grammat vaihdettavissa", pohja.variNimi === "RAL 9016" && pohja.kulutusG === 35, kuvaile(t));
}
console.log(virheita === 0 ? "\nKAIKKI LÄPI" : `\n${virheita} VIRHETTÄ`);
process.exit(virheita === 0 ? 0 : 1);
