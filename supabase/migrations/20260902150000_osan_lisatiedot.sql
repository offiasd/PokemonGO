-- Merkki ja malli korvataan vapaalla lisätietokentällä (vaihe 1/2: uusi kenttä).
--
-- Osat ovat käytännössä mopon ja auton osia, joissa merkki/malli-pari ei
-- riittänyt: sama osa voi sopia monelle mallille, ja tarkennus on usein jotain
-- muuta kuin merkki. Yksi vapaa kenttä on rehellisempi kuin kaksi kenttää,
-- joihin kirjoitetaan väärää tietoa.
--
-- Vanhat arvot siirretään uuteen kenttään, ettei kirjattu tieto katoa. Vanhat
-- sarakkeet jäävät toistaiseksi paikalleen: käytössä oleva julkaisu vielä
-- hakee ne, ja niiden poisto rikkoisi sivut ennen kuin uusi versio on julki.
-- Poisto tehdään vaiheessa 2 (20260902170000).

alter table osat add column lisatiedot text;

update osat
set lisatiedot = nullif(btrim(concat_ws(' ', nullif(btrim(merkki), ''), nullif(btrim(malli), ''))), '')
where merkki is not null or malli is not null;

comment on column osat.lisatiedot is
  'Vapaa lisätieto osasta (korvaa merkki- ja malli-sarakkeet). Näytetään osan nimen alla ja on mukana osahaussa.';
