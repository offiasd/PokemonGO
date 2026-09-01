#!/usr/bin/env node
// Tarkistaa yhteyden Supabase-projektiin ja sen, että kanta ja Edge Functionit
// ovat siinä kunnossa kuin sovellus olettaa. Ei kirjoita mitään - pelkkiä
// lukuoperaatioita ja HTTP-kutsuja.
//
//   npm run testaa-supabase
//
// Lukee asetukset .env.local-tiedostosta (tai ympäristömuuttujista, jos ne on
// jo asetettu). Palautusarvo on 1, jos jokin tarkistus epäonnistui - näin
// tämän voi ajaa myös CI:ssä.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const AIKAKATKAISU_MS = 10_000;

// Sarakkeet, jotka migraatiot ovat lisänneet. Jos jokin puuttuu, migraatio on
// ajamatta ja sovellus kaatuu tai näyttää väärää tietoa.
const ODOTETUT_SARAKKEET = [
  ["varit", "varisavy", "20260831200000_varin_savy.sql"],
  ["varit", "vaatii_pohjavarin", "20260831240000_pohjavarivaatimus_tyypista.sql"],
  ["osat", "lakkaus_kulutus_g", "20260831160000_kategoriakohtainen_kulutus.sql"],
  ["osa_kategoriahinnat", "toinen_arvioitu_kulutus_g", "20260831160000_kategoriakohtainen_kulutus.sql"],
];

const EDGE_FUNKTIOT = ["hae-tuotetiedot", "varastohalytys"];

function lueEnvTiedosto(polku) {
  if (!existsSync(polku)) return {};
  const arvot = {};
  for (const rivi of readFileSync(polku, "utf8").split("\n")) {
    const siistitty = rivi.trim();
    if (!siistitty || siistitty.startsWith("#")) continue;
    const kohta = siistitty.indexOf("=");
    if (kohta === -1) continue;
    const avain = siistitty.slice(0, kohta).trim();
    let arvo = siistitty.slice(kohta + 1).trim();
    if (
      (arvo.startsWith('"') && arvo.endsWith('"')) ||
      (arvo.startsWith("'") && arvo.endsWith("'"))
    ) {
      arvo = arvo.slice(1, -1);
    }
    arvot[avain] = arvo;
  }
  return arvot;
}

let virheita = 0;
let varoituksia = 0;

function ok(viesti, lisa) {
  console.log(`  [32mOK[0m    ${viesti}${lisa ? `\n        ${lisa}` : ""}`);
}
function virhe(viesti, lisa) {
  virheita++;
  console.log(`  [31mVIRHE[0m ${viesti}${lisa ? `\n        ${lisa}` : ""}`);
}
function varoitus(viesti, lisa) {
  varoituksia++;
  console.log(`  [33mHUOM[0m  ${viesti}${lisa ? `\n        ${lisa}` : ""}`);
}
function otsikko(teksti) {
  console.log(`\n${teksti}`);
}

async function haeAikakatkaisulla(url, asetukset = {}) {
  return fetch(url, { ...asetukset, signal: AbortSignal.timeout(AIKAKATKAISU_MS) });
}

const env = { ...lueEnvTiedosto(resolve(process.cwd(), ".env.local")), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonAvain = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceAvain = env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase-yhteyden testaus\n=========================");

otsikko("1. Asetukset");
if (!url || !anonAvain) {
  virhe(
    "NEXT_PUBLIC_SUPABASE_URL tai NEXT_PUBLIC_SUPABASE_ANON_KEY puuttuu.",
    "Kopioi .env.example tiedostoksi .env.local ja täytä arvot: Supabase-projekti -> Project Settings -> API."
  );
  process.exit(1);
}
if (url.includes("xxxxx") || anonAvain.includes("xxxxx")) {
  virhe(
    "Asetuksissa on yhä .env.example-mallin paikkamerkit (xxxxx).",
    "Täytä oikeat arvot .env.local-tiedostoon."
  );
  process.exit(1);
}
let osoite;
try {
  osoite = new URL(url);
} catch {
  virhe(`NEXT_PUBLIC_SUPABASE_URL ei ole kelvollinen osoite: ${url}`);
  process.exit(1);
}
// Supabasen isännöimässä projektissa aliverkkotunnus on project ref.
const projektiTunnus = /\.supabase\.(co|in)$/.test(osoite.hostname)
  ? osoite.hostname.split(".")[0]
  : null;
ok(projektiTunnus ? `Projekti ${projektiTunnus} (${url})` : `Osoite ${url}`);
if (serviceAvain && !serviceAvain.includes("xxxxx")) {
  ok("SUPABASE_SERVICE_ROLE_KEY on asetettu (Edge Functionien käyttöön).");
} else {
  varoitus(
    "SUPABASE_SERVICE_ROLE_KEY puuttuu.",
    "Tarvitaan vain varastohalytys-Edge Functionille, ei sovelluksen ajamiseen."
  );
}

otsikko("2. Yhteys REST-rajapintaan");
try {
  const vastaus = await haeAikakatkaisulla(`${url}/rest/v1/`, {
    headers: { apikey: anonAvain },
  });
  if (vastaus.ok) {
    ok(`Rajapinta vastaa (HTTP ${vastaus.status}).`);
  } else if (vastaus.status === 401) {
    virhe("Rajapinta vastaa, mutta anon-avain hylättiin (401).", "Tarkista NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  } else {
    virhe(`Odottamaton vastaus HTTP ${vastaus.status}.`);
  }
} catch (e) {
  virhe(`Yhteys epäonnistui: ${e.message}`, "Tarkista projektin osoite ja verkkoyhteys - onko projekti keskeytetty?");
}

otsikko("3. Taulut ja migraatiot");
for (const [taulu, sarake, migraatio] of ODOTETUT_SARAKKEET) {
  try {
    const vastaus = await haeAikakatkaisulla(
      `${url}/rest/v1/${taulu}?select=${sarake}&limit=1`,
      { headers: { apikey: anonAvain, Authorization: `Bearer ${anonAvain}` } }
    );
    if (vastaus.ok) {
      ok(`${taulu}.${sarake} löytyy.`);
      continue;
    }
    const runko = await vastaus.json().catch(() => ({}));
    if (runko.code === "42703" || /column .* does not exist/i.test(runko.message ?? "")) {
      virhe(`${taulu}.${sarake} puuttuu.`, `Aja migraatio supabase/migrations/${migraatio}`);
    } else if (runko.code === "42P01") {
      virhe(`Taulua ${taulu} ei ole.`, "Kanta on tyhjä - aja migraatiot järjestyksessä.");
    } else {
      // RLS estää rivien lukemisen kirjautumattomana, mutta se ei ole vika:
      // sarake on olemassa, koska kysely ei kaatunut sarakevirheeseen.
      varoitus(
        `${taulu}.${sarake}: HTTP ${vastaus.status} ${runko.code ?? ""} ${runko.message ?? ""}`.trim(),
        "Todennäköisesti RLS estää lukemisen kirjautumattomana - ei este sovellukselle."
      );
    }
  } catch (e) {
    virhe(`${taulu}.${sarake} tarkistus epäonnistui: ${e.message}`);
  }
}

otsikko("4. SQL-funktiot");
try {
  const vastaus = await haeAikakatkaisulla(`${url}/rest/v1/rpc/vari_kokonaishinta`, {
    method: "POST",
    headers: {
      apikey: anonAvain,
      Authorization: `Bearer ${anonAvain}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_vari_id: "00000000-0000-0000-0000-000000000000" }),
  });
  const runko = await vastaus.json().catch(() => null);
  if (vastaus.ok) {
    ok("vari_kokonaishinta vastaa.", `Tuntemattomalla id:llä tulos: ${JSON.stringify(runko)}`);
  } else if (runko?.code === "PGRST202") {
    virhe(
      "vari_kokonaishinta-funktiota ei löydy.",
      "Aja migraatio supabase/migrations/20260831230000_tulli_alv_myos_rahdista.sql"
    );
  } else {
    varoitus(`vari_kokonaishinta: HTTP ${vastaus.status} ${runko?.message ?? ""}`.trim());
  }
} catch (e) {
  virhe(`vari_kokonaishinta tarkistus epäonnistui: ${e.message}`);
}

otsikko("5. Edge Functionit");
for (const nimi of EDGE_FUNKTIOT) {
  try {
    // Kutsutaan ilman käyttäjän istuntoa: funktio vastaa 401 "Ei kirjautunut",
    // mikä riittää todisteeksi siitä että se on julkaistu. 404 = julkaisematta.
    const vastaus = await haeAikakatkaisulla(`${url}/functions/v1/${nimi}`, {
      method: "POST",
      headers: { apikey: anonAvain, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (vastaus.status === 404) {
      virhe(`${nimi} ei ole julkaistu.`, `Julkaise: supabase functions deploy ${nimi}`);
    } else {
      ok(`${nimi} on julkaistu (vastasi HTTP ${vastaus.status}).`);
    }
  } catch (e) {
    virhe(`${nimi} tarkistus epäonnistui: ${e.message}`);
  }
}

otsikko("Yhteenveto");
if (virheita === 0 && varoituksia === 0) {
  console.log("  Kaikki tarkistukset menivät läpi.");
} else {
  console.log(`  ${virheita} virhettä, ${varoituksia} huomiota.`);
}
process.exit(virheita > 0 ? 1 : 0);
