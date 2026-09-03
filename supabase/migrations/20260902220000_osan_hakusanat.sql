-- Osalle hakusanat.
--
-- Sama osa tunnetaan monella nimellä: "kytkinkoppa" voi olla asiakkaalle
-- "kytkinkansi" tai "moottorin kansi", ja hakusanoihin voi kirjata myös
-- mallimerkintöjä joita ei haluta näyttää osan nimessä. Vapaa hakusanakenttä
-- on mukana osahaussa mutta ei näy listassa eikä osan sivulla - se on
-- pelkästään löytämistä varten.
--
-- Nimi "hakusanat" eikä "tagit": tagi on yleensä valittava luokitus, jota
-- näytetään ja jolla suodatetaan. Tässä kyse on vapaista synonyymeistä, joita
-- ei näytetä missään.

alter table osat add column hakusanat text;

comment on column osat.hakusanat is
  'Vapaat hakusanat osan löytämiseksi (synonyymit, mallimerkinnät). Mukana osahaussa, ei näy listassa eikä osan sivulla.';
