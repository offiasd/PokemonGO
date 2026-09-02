-- Merkki ja malli korvataan vapaalla lisätietokentällä (vaihe 2/2: poisto).
--
-- Ajetaan vasta kun lisatiedot-kenttää käyttävä versio on julkaistu: vanha
-- versio hakee vielä merkki- ja malli-sarakkeet, joten aiempi poisto rikkoisi
-- Osat- ja Uusi työ -sivut. Arvot on jo siirretty lisatiedot-kenttään
-- migraatiossa 20260902150000.

alter table osat drop column merkki;
alter table osat drop column malli;
