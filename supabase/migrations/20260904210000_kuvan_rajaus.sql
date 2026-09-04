-- Osan kuvan rajaus korttia varten.
--
-- Kuva täyttää nyt koko osakortin, joten sen näkyvä kohta on osakohtainen
-- päätös: pitkästä vannekuvasta halutaan keskiosa, satulakuvasta ehkä
-- yläreuna. Rajaus tallennetaan osalle, jotta se pysyy samana kaikilla
-- ruutukoilla eikä riipu kortin pikselimitoista.
--
-- kuva_x ja kuva_y ovat object-position-prosentteja: 0 = vasen/ylä, 100 =
-- oikea/ala, 50 = keskitetty kuten ennenkin. kuva_zoom suurentaa kuvaa saman
-- kohdan ympäri, jolloin yksityiskohdan saa esiin. Oletukset vastaavat
-- nykyistä käytöstä, joten olemassa olevat kuvat näyttävät ennallaan.
alter table public.osat
  add column if not exists kuva_x numeric(5, 2) not null default 50
    check (kuva_x >= 0 and kuva_x <= 100),
  add column if not exists kuva_y numeric(5, 2) not null default 50
    check (kuva_y >= 0 and kuva_y <= 100),
  add column if not exists kuva_zoom numeric(4, 2) not null default 1
    check (kuva_zoom >= 1 and kuva_zoom <= 4);

comment on column public.osat.kuva_x is
  'Kuvan vaakasuuntainen kohdistus kortissa, object-position-prosentti 0-100.';
comment on column public.osat.kuva_y is
  'Kuvan pystysuuntainen kohdistus kortissa, object-position-prosentti 0-100.';
comment on column public.osat.kuva_zoom is
  'Kuvan suurennus kortissa, 1 = koko kuva peittää kehyksen, 4 = nelinkertainen.';
