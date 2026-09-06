-- Täysiraja saldopalkin asteikoksi.
--
-- Palkki skaalattiin hälytysrajaan (4 x raja), mutta se on huono asteikko:
-- 200 g:n rajalla valtaosa väreistä on yli kaksinkertaisesti rajan yläpuolella,
-- jolloin palkki on aina täynnä eikä liu'u koskaan. Täysiraja on erillinen
-- luku, joka kertoo millä saldolla väri katsotaan täydeksi.

alter table public.varit
  add column if not exists taysiraja_g numeric(12, 2);

comment on column public.varit.taysiraja_g is
  'Taso jolla väri katsotaan täydeksi. Saldopalkin asteikon yläpää. Null = käytä asetukset.oletus_taysiraja_g. Voi vastata pakkauskokoa (esim. 1000 g = kilon pussi).';

alter table public.asetukset
  add column if not exists oletus_taysiraja_g numeric(12, 2) not null default 1500;

comment on column public.asetukset.oletus_taysiraja_g is
  'Oletustäysiraja väreille joilla taysiraja_g on null.';

alter table public.varit
  drop constraint if exists varit_taysiraja_check;

alter table public.varit
  add constraint varit_taysiraja_check
  check (taysiraja_g is null or taysiraja_g > 0);

-- varit_halytykset rakentuu v.*-laajennuksella, joka kiinnittyy näkymän
-- luontihetkeen, joten uusi sarake ei tule siihen itsestään. Hälytyslistat
-- piirtävät saman palkin kuin värilista, ja ilman täysirajaa ne skaalaisivat
-- sen eri tavalla kuin värikortti.
drop view if exists varit_halytykset;

create view varit_halytykset as
select
  v.*,
  public.vari_halytysraja(v.id) as efektiivinen_halytysraja_g
from varit v
where v.aktiivinen
  and (v.saldo_g - v.varattu_g) <= public.vari_halytysraja(v.id);

comment on view varit_halytykset is 'Värit joiden käytettävissä oleva saldo (saldo_g - varattu_g) on hälytysrajalla tai sen alle.';

alter view varit_halytykset set (security_invoker = true);
