-- 1. Kaksi uutta värikategoriaa: tekstuuri ja kuumankesto.
--
-- Kategoriat ovat text-sarakkeita check-ehdolla (ei enum-tyyppiä), joten
-- lisäys tehdään korvaamalla ehto. Sama lista sekä värin ensisijaisessa
-- tyypissä että lisäkategorioissa.

alter table varit drop constraint varit_tyyppi_check;
alter table varit add constraint varit_tyyppi_check check (
  tyyppi in ('solid', 'metallic', 'tekstuuri', 'kuumankesto', 'pohjavari',
             'candy', 'illusion', 'transparent', 'muu')
);

alter table vari_kategoriat drop constraint vari_kategoriat_maali_tyyppi_check;
alter table vari_kategoriat add constraint vari_kategoriat_maali_tyyppi_check check (
  maali_tyyppi in ('solid', 'metallic', 'tekstuuri', 'kuumankesto', 'pohjavari',
                   'candy', 'illusion', 'transparent', 'muu')
);

-- osa_kategoriahinnat jätetään ennalleen: se listaa osalle myytävät
-- kategoriat (solid/metallic/candy/illusion), eikä tekstuuria tai
-- kuumankestoa hinnoitella omana työlajinaan.

-- 2. Lakkausvaatimus värikohtaiseksi.
--
-- Aiemmin lakkaus oli pakollinen koko metallic-kategorialle. Kaikki metallicit
-- eivät kuitenkaan sitä tarvitse - valmistaja kertoo tuotekohtaisesti jos
-- lakkaus on suositeltu esim. ulkokäyttöön. Vaatimus siirtyy siksi värille.

alter table varit
  add column vaatii_lakkauksen boolean not null default false;

comment on column varit.vaatii_lakkauksen is
  'Tarvitseeko tämä väri erillisen lakkauksen (esim. UV-suoja ulkokäyttöön). Asetetaan värikohtaisesti; "Hae tiedot" osaa päätellä sen valmistajan tuotetekstistä.';

-- Olemassa olevat metallicit merkitään lakkausta vaativiksi, jotta käytös
-- säilyy ennallaan: aiemmin kategoria pakotti lakkauksen. Ne joille lakkaus ei
-- ole tarpeen, voi nyt kytkeä pois värin omalta sivulta.
update varit set vaatii_lakkauksen = true where tyyppi = 'metallic';

-- Illusion vaatii lakan aktivoituakseen, mikä on edelleen kategoriatason
-- sääntö sovelluksessa. Merkitään silti myös värikohtaisesti, jotta tieto
-- näkyy värin sivulla samassa paikassa kuin muillakin.
update varit set vaatii_lakkauksen = true where tyyppi = 'illusion';
