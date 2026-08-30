-- Raportointi- ja hakutoiminnot: yhdistetty haku (pg_trgm), kulutusraportit ja
-- "kuukauden käytetyin väri" -tunnusluku.

-- =========================================================================
-- 1. YHDISTETTY HAKU (värit + osat)
-- =========================================================================
-- Palauttaa sekä värejä että osia samassa tuloksessa, järjestettynä osumatarkkuuden
-- mukaan. Toimii myös osittaisilla/typo-toleranteilla hakusanoilla pg_trgm:n ansiosta.

create function public.haku(p_kysely text, p_raja integer default 25)
returns table (
  tyyppi text,
  id uuid,
  otsikko text,
  alaotsikko text,
  osuvuus real
)
language sql
stable
as $$
  select * from (
    select
      'vari'::text as tyyppi,
      v.id,
      v.nimi as otsikko,
      coalesce(v.valmistaja, '') as alaotsikko,
      greatest(similarity(v.nimi, p_kysely), similarity(coalesce(v.valmistaja, ''), p_kysely)) as osuvuus
    from varit v
    where v.aktiivinen
      and (v.nimi ilike '%' || p_kysely || '%'
        or coalesce(v.valmistaja, '') ilike '%' || p_kysely || '%'
        or v.nimi % p_kysely
        or coalesce(v.valmistaja, '') % p_kysely)

    union all

    select
      'osa'::text as tyyppi,
      o.id,
      o.nimi as otsikko,
      trim(both ' ' from coalesce(o.merkki, '') || ' ' || coalesce(o.malli, '')) as alaotsikko,
      greatest(
        similarity(o.nimi, p_kysely),
        similarity(coalesce(o.merkki, ''), p_kysely),
        similarity(coalesce(o.malli, ''), p_kysely)
      ) as osuvuus
    from osat o
    where o.aktiivinen
      and (o.nimi ilike '%' || p_kysely || '%'
        or coalesce(o.merkki, '') ilike '%' || p_kysely || '%'
        or coalesce(o.malli, '') ilike '%' || p_kysely || '%'
        or o.nimi % p_kysely
        or coalesce(o.merkki, '') % p_kysely
        or coalesce(o.malli, '') % p_kysely)
  ) tulokset
  order by osuvuus desc nulls last
  limit p_raja;
$$;

-- =========================================================================
-- 2. HÄLYTYKSET
-- =========================================================================

create view varit_halytykset as
select
  v.*,
  public.vari_halytysraja(v.id) as efektiivinen_halytysraja_g
from varit v
where v.aktiivinen
  and v.saldo_g <= public.vari_halytysraja(v.id);

comment on view varit_halytykset is 'Värit joiden saldo on hälytysrajalla tai sen alle.';

-- =========================================================================
-- 3. KULUTUSRAPORTIT
-- =========================================================================
-- Rivikohtainen raportti, jota sovellus suodattaa aikaväli/väri/osa-parametreilla.
-- Kustannus lasketaan värin *nykyisellä* kokonaishinnalla (historiallista hintaa
-- tapahtumahetkellä ei tallenneta v1:ssä).

create view maalaustapahtumat_raportoituna as
select
  m.id,
  m.luotu,
  date_trunc('day', m.luotu) as paiva,
  date_trunc('week', m.luotu) as viikko,
  date_trunc('month', m.luotu) as kuukausi,
  date_trunc('year', m.luotu) as vuosi,
  m.osa_id,
  o.nimi as osa_nimi,
  m.vari_id,
  v.nimi as vari_nimi,
  m.kappalemaara,
  m.toteutunut_kulutus_g,
  m.toteutunut_kulutus_g / 1000.0 as toteutunut_kulutus_kg,
  round((m.toteutunut_kulutus_g / 1000.0) * public.vari_kokonaishinta(m.vari_id), 2) as maalikustannus_eur,
  m.kayttaja_id
from maalaustapahtumat m
join osat o on o.id = m.osa_id
join varit v on v.id = m.vari_id;

comment on view maalaustapahtumat_raportoituna is 'Maalaustapahtumat esilaskettuine kg/€-arvoineen, suodatettavissa päivä/viikko/kuukausi/vuosi tai väri/osa mukaan.';

-- "Kuukauden käytetyin väri": SUM kulutus per väri, top 1 annetulta kuukaudelta (oletus: kuluva kuukausi).
create function public.kuukauden_kaytetyin_vari(p_kuukausi date default date_trunc('month', now())::date)
returns table (
  vari_id uuid,
  vari_nimi text,
  yhteensa_g numeric,
  yhteensa_kg numeric,
  tapahtumia bigint
)
language sql
stable
as $$
  select
    m.vari_id,
    v.nimi,
    sum(m.toteutunut_kulutus_g) as yhteensa_g,
    sum(m.toteutunut_kulutus_g) / 1000.0 as yhteensa_kg,
    count(*) as tapahtumia
  from maalaustapahtumat m
  join varit v on v.id = m.vari_id
  where date_trunc('month', m.luotu) = date_trunc('month', p_kuukausi::timestamptz)
  group by m.vari_id, v.nimi
  order by yhteensa_g desc
  limit 1;
$$;

grant execute on function public.haku(text, integer) to authenticated;
grant execute on function public.kuukauden_kaytetyin_vari(date) to authenticated;
grant execute on function public.vari_kokonaishinta(uuid) to authenticated;
grant execute on function public.vari_halytysraja(uuid) to authenticated;
grant execute on function public.osa_tyoaika_min(uuid) to authenticated;
grant execute on function public.osa_tyokustannus(uuid) to authenticated;
grant execute on function public.osa_maalikustannus(uuid, uuid) to authenticated;
grant execute on function public.osa_kustannusarvio(uuid, uuid) to authenticated;
grant execute on function public.osa_suositushinta(uuid, uuid) to authenticated;

alter view varit_halytykset set (security_invoker = true);
alter view maalaustapahtumat_raportoituna set (security_invoker = true);
