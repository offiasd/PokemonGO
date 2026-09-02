-- Työlle alennusprosentti.
--
-- Alennus talletetaan omaan sarakkeeseensa eikä hierota rivien hintoihin:
-- rivin yksikkohinta_eur on hinnan tilannekuva lisäyshetkellä, ja jos alennus
-- upotettaisiin siihen, jälkikäteen ei näkisi kumpi hinta oli listahinta ja
-- kumpi alennettu. Näin alennus näkyy omana rivinään myös valmistuneessa
-- työssä.

alter table tyot
  add column alennus_prosentti numeric(5, 2) not null default 0
    check (alennus_prosentti >= 0 and alennus_prosentti <= 100);

comment on column tyot.alennus_prosentti is
  'Koko työlle annettu alennus prosentteina. Vähennetään rivien summasta näytettäessä; rivien yksikkohinnat pysyvät listahintoina.';
