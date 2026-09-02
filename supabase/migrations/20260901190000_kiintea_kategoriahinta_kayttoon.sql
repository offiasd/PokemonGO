-- Kiinteä kategoriahinta ei ole enää vanhentunut.
--
-- osa_kategoriahinnat.hinta merkittiin aikanaan vanhentuneeksi, kun hinnoittelu
-- siirtyi laskettavaksi värin ostohinnasta ja katteesta. Nyt asetettu kiinteä
-- hinta on taas ensisijainen kaikkialla sovelluksessa (Osat-listan hintaskaala,
-- osan hinnoittelu ja Työt-sivu), ja laskettu suositushinta on vain varalla
-- niille kategorioille joille kiinteää hintaa ei ole asetettu.
--
-- Pelkkä kommenttien korjaus: taulun rakenne ei muutu.

comment on table osa_kategoriahinnat is
  'Osan myytävät maalityyppikategoriat, niiden arvioitu maalinkulutus ja adminin asettama kiinteä asiakashinta. Puuttuva rivi = kategoriaa ei myydä tälle osalle.';

comment on column osa_kategoriahinnat.hinta is
  'Adminin asettama kiinteä asiakashinta kategorialle. Ensisijainen hinnoitteluperuste; null = hinta lasketaan värin ostohinnasta ja katteesta. Värikohtainen hintalisä lisätään tämänkin päälle.';
