-- Asiakashinnoittelu ei enää perustu admin-asettamaan kiinteään hintaan per
-- kategoria, vaan värien todelliseen ostohintaan + katteeseen (sama laskenta
-- kuin osan kustannusarviossa ja Työt-sivun hinnoittelussa). "hinta"-sarake ei
-- siis ole enää pakollinen kategorian aktivoimiseksi - arvioitu_kulutus_g on
-- ainoa pakollinen tieto, koska hinta lasketaan sen ja värin ostohinnan pohjalta.

alter table osa_kategoriahinnat alter column hinta drop not null;

comment on table osa_kategoriahinnat is 'Osan myytävät maalityyppikategoriat ja niiden arvioitu maalinkulutus. Puuttuva rivi = kategoriaa ei myydä tälle osalle. Asiakashinta lasketaan värin todellisesta ostohinnasta + katteesta, ei tämän taulun hinta-sarakkeesta (vanhentunut, säilytetty taaksepäinyhteensopivuuden vuoksi).';
