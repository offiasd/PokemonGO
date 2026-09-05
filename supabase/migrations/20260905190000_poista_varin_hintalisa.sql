-- Värikohtainen asiakashinnan lisä-% pois.
--
-- Sarake lisättiin sitä varten, että poikkeuksellisen kallis sävy voisi nostaa
-- asiakashintaa omalla prosentillaan. Käytännössä sama asia hoituu jo
-- Asetukset-sivun katemarginaalilla, joten kenttä oli vain ylimääräinen ruutu
-- värilomakkeella. Yhdelläkään värillä ei ollut nollasta poikkeavaa arvoa,
-- joten poisto ei muuta yhdenkään työn tai osan asiakashintaa.
--
-- varit_halytykset rakennetaan v.*-laajennuksella, joka kiinnittyy näkymän
-- luontihetkeen. Sarake on siis mukana näkymässä ja näkymä on pudotettava ja
-- luotava uudelleen. Samalla se saa mukaansa värien uudemmat sarakkeet
-- (varisavy, vaatii_lakkauksen, kiiltotaso, hakusanat), jotka ovat tulleet
-- näkymän luonnin jälkeen.

drop view if exists varit_halytykset;

alter table varit drop column hintalisa_prosentti;

create view varit_halytykset as
select
  v.*,
  public.vari_halytysraja(v.id) as efektiivinen_halytysraja_g
from varit v
where v.aktiivinen
  and (v.saldo_g - v.varattu_g) <= public.vari_halytysraja(v.id);

comment on view varit_halytykset is 'Värit joiden käytettävissä oleva saldo (saldo_g - varattu_g) on hälytysrajalla tai sen alle.';

alter view varit_halytykset set (security_invoker = true);
