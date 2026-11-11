/**
 * Kuitin poiminnan jäsennys: takuukentät ja niiden validoinnit.
 *
 * Aja: npm run testaa-poiminta
 *
 * Poiminta on mallin ehdotus, joten jokainen kenttä käsitellään
 * epäluotettavana. Nämä testit koettelevat juuri sitä: väärä tyyppi,
 * mahdoton luku ja kuukausimäärä ilman kuitilta luettua tekstiä eivät saa
 * päätyä takuuksi.
 */
const { jasennaPoiminta } = await import(
  new URL("../supabase/functions/lue-kuitti/poiminta.ts", import.meta.url).href
);

let virheita = 0;
const tarkista = (nimi, saatu, odotettu) => {
  const ok = JSON.stringify(saatu) === JSON.stringify(odotettu);
  console.log(`${ok ? "OK  " : "EI  "} ${nimi}  -> ${JSON.stringify(saatu)}`);
  if (!ok) {
    console.log(`     odotettiin ${JSON.stringify(odotettu)}`);
    virheita++;
  }
};

/** Yksi rivi poiminnan läpi: palauttaa takuukentät. */
const rivi = (kentat) => {
  const tulos = jasennaPoiminta({
    rivit: [{ teksti: "Monitoimitulostin TS3750i", brutto_valuutassa: 199, ...kentat }],
  });
  const r = tulos.rivit[0];
  return { takuu_teksti: r.takuu_teksti, takuu_kk: r.takuu_kk, kestotuote: r.kestotuote };
};

tarkista('takuu_kk merkkijonona "24"', rivi({ takuu_teksti: "Takuu 2 v", takuu_kk: "24" }), {
  takuu_teksti: "Takuu 2 v",
  takuu_kk: 24,
  kestotuote: null,
});
tarkista("takuu_kk 0 ei kelpaa", rivi({ takuu_teksti: "Takuu", takuu_kk: 0 }), {
  takuu_teksti: "Takuu",
  takuu_kk: null,
  kestotuote: null,
});
tarkista("takuu_kk 240 ei kelpaa", rivi({ takuu_teksti: "Takuu 20 v", takuu_kk: 240 }), {
  takuu_teksti: "Takuu 20 v",
  takuu_kk: null,
  kestotuote: null,
});
tarkista("takuu_kk ilman tekstiä hylätään", rivi({ takuu_kk: 24 }), {
  takuu_teksti: null,
  takuu_kk: null,
  kestotuote: null,
});
tarkista('kestotuote "kyllä" ei ole totuusarvo', rivi({ kestotuote: "kyllä" }), {
  takuu_teksti: null,
  takuu_kk: null,
  kestotuote: null,
});
tarkista("kestotuote true säilyy", rivi({ kestotuote: true }), {
  takuu_teksti: null,
  takuu_kk: null,
  kestotuote: true,
});
tarkista("kestotuote false säilyy", rivi({ kestotuote: false }), {
  takuu_teksti: null,
  takuu_kk: null,
  kestotuote: false,
});
tarkista("murtolukua ei pyöristetä ylös", rivi({ takuu_teksti: "Takuu 6 kk", takuu_kk: 6.8 }), {
  takuu_teksti: "Takuu 6 kk",
  takuu_kk: 6,
  kestotuote: null,
});
tarkista("ei takuumainintaa", rivi({}), {
  takuu_teksti: null,
  takuu_kk: null,
  kestotuote: null,
});

// Takuu ei saa sotkea muuta poimintaa: tavallinen rivi säilyy ennallaan.
{
  const tulos = jasennaPoiminta({
    toimittaja: "Prisma Tornio",
    paivays: "10.10.2026",
    rivit: [
      { teksti: "Nordblast alumiinioksidi 9kg", brutto_valuutassa: "45,90", verokanta: 25.5 },
    ],
  });
  tarkista(
    "tavallinen rivi ennallaan",
    { toimittaja: tulos.toimittaja, paivays: tulos.paivays, rivi: tulos.rivit[0] },
    {
      toimittaja: "Prisma Tornio",
      paivays: "2026-10-10",
      rivi: {
        teksti: "Nordblast alumiinioksidi 9kg",
        maara: null,
        yksikko: null,
        brutto_valuutassa: 45.9,
        verokanta: 25.5,
        takuu_teksti: null,
        takuu_kk: null,
        kestotuote: null,
      },
    }
  );
}

console.log(virheita === 0 ? "\nKAIKKI LÄPI" : `\n${virheita} VIRHETTÄ`);
process.exit(virheita === 0 ? 0 : 1);
