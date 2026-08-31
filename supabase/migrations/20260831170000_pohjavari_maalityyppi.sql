-- Lisätään "pohjavari" uudeksi maalityyppi-kategoriaksi (varit.tyyppi).
-- Käytetään värien luokitteluun Värit-sivulla (esim. kromipohjaiset
-- pohjavärit erilleen Metallic-kategoriasta). Ei ole myytävä kategoria
-- osa_kategoriahinnat-taulussa (ei muutosta sinne) - samaan tapaan kuin
-- Lakat/Muu, koska pohjaväriä ei myydä yksinään omana työnä.

alter table varit drop constraint if exists varit_tyyppi_check;

alter table varit
  add constraint varit_tyyppi_check
  check (tyyppi in ('solid', 'transparent', 'candy', 'illusion', 'metallic', 'pohjavari', 'muu'));
