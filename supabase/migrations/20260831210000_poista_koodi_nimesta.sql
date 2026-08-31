-- Prismatic Powders -värien nimet sisältävät tuotekoodin suluissa nimen
-- perässä (esim. "Candy Gold (PPB-2331)"), koska "Hae tiedot" -toiminto
-- poimii sen osaksi nimeä sivun og:title-metatiedosta. Koodi ei ole
-- hyödyllinen näytettäväksi väriä selatessa, joten se siistitään pois
-- olemassa olevista nimistä.

update varit
set nimi = trim(regexp_replace(nimi, '\s*\([A-Za-z]{2,6}-[0-9]{2,8}\)\s*$', '', 'i'))
where valmistaja ilike 'prismatic powders'
  and nimi ~* '\([A-Za-z]{2,6}-[0-9]{2,8}\)\s*$';
