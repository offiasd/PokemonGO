-- Värien suosio: montako kertaa väriä on käytetty töissä.
--
-- Suosituin-järjestystä varten. Käyttökerta on työn rivi, jolla väri esiintyy
-- joko päävärinä tai toisena värinä (pohjaväri tai lakka) - lakka on yhtä lailla
-- käytetty väri, ja sen kulutus tulee varastosta samalla tavalla. Mukana ovat
-- sekä keskeneräiset että valmiit työt: keskeneräinen työ kertoo yhtä hyvin
-- mitä juuri nyt käytetään.
--
-- maalaustapahtumat-taulu on tyhjä (työt korvasivat sen), joten sitä ei lasketa
-- mukaan. Jos vanhoja tapahtumia joskus palautetaan, ne lisätään tähän.
--
-- Näkymä eikä laskenta sovelluksessa: rivimäärä kasvaa töiden myötä, eikä
-- kaikkia työrivejä kannata hakea selaimeen pelkän järjestyksen takia.

create view varien_suosio as
select
  v.id as vari_id,
  count(r.tyo_id) as kayttokerrat
from varit v
left join (
  select tyo_id, vari_id from tyon_rivit
  union all
  select tyo_id, toinen_vari_id as vari_id from tyon_rivit where toinen_vari_id is not null
) r on r.vari_id = v.id
group by v.id;

comment on view varien_suosio is
  'Värin käyttökerrat työriveillä (pääväri + pohjaväri/lakka). Käytetään Värit-sivun Suosituin-järjestykseen.';

-- security_invoker: näkymä noudattaa kutsujan oikeuksia kuten muutkin
-- raporttinäkymät, eikä ohita rivitason käytäntöjä.
alter view varien_suosio set (security_invoker = true);

grant select on varien_suosio to authenticated;
