-- Arkistoidut työt mukaan raportteihin.
--
-- Arkistointi siirtää valmiin työn omiin tauluihinsa ja poistaa sen töistä.
-- Maalisaldoon ei kosketa - kulutus on jo tehty valmistuessa - mutta raportit
-- lukivat vain tyon_rivit-taulua, joten arkistoitu työ katosi niiltä kokonaan.
-- Kulutettu maali jäi siis varastosta pois mutta ei näkynyt missään.
--
-- Vika olisi kasvanut itsestään: arkistoi_vanhat_tyot ajetaan yöllä pg_cronilla
-- ja arkistoi yli 12 kk vanhat työt, joten raporteista olisi vuoden päästä
-- alkanut pudota pohjalta dataa ilman että kukaan tekee mitään.
--
-- Kaikki kolme kulutusta lukevaa näkymää ja funktiota lukevat nyt myös arkiston.

-- ---------------------------------------------------------------------------
-- 1. Kulutusraportti
-- ---------------------------------------------------------------------------
create or replace view public.maalinkulutus_raportoituna as
with kaytto as (
  -- Valmiin työn pääväri.
  select
    tr.id::text || ':paavari' as id,
    coalesce(t.valmistunut, t.aloitettu) as luotu,
    tr.osa_id,
    tr.vari_id,
    tr.kappalemaara,
    coalesce(tr.toteutunut_kulutus_g, tr.arvioitu_kulutus_g) as kulutus_g,
    'paavari'::text as rooli,
    t.valmistui_id as kayttaja_id
  from tyon_rivit tr
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'

  union all
  -- Valmiin työn pohjaväri tai lakka.
  select
    tr.id::text || ':toinen',
    coalesce(t.valmistunut, t.aloitettu),
    tr.osa_id,
    tr.toinen_vari_id,
    tr.kappalemaara,
    coalesce(tr.toinen_toteutunut_kulutus_g, tr.toinen_arvioitu_kulutus_g, 0),
    coalesce(tr.toinen_vari_rooli, 'toinen'),
    t.valmistui_id
  from tyon_rivit tr
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis' and tr.toinen_vari_id is not null

  union all
  -- Custom-työn kolmas ja sitä seuraavat värit.
  select
    l.id::text || ':lisavari',
    coalesce(t.valmistunut, t.aloitettu),
    tr.osa_id,
    l.vari_id,
    tr.kappalemaara,
    coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g),
    'lisavari',
    t.valmistui_id
  from tyon_rivin_lisavarit l
  join tyon_rivit tr on tr.id = l.rivi_id
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'

  union all
  -- Arkistoidun työn pääväri. Rivit säilyttävät alkuperäiset id:nsä, joten
  -- raporttirivin tunniste ei muutu arkistoinnissa.
  select
    ar.id::text || ':paavari',
    coalesce(at.valmistunut, at.aloitettu),
    ar.osa_id,
    ar.vari_id,
    ar.kappalemaara,
    coalesce(ar.toteutunut_kulutus_g, ar.arvioitu_kulutus_g),
    'paavari',
    at.valmistui_id
  from arkistoidut_tyon_rivit ar
  join arkistoidut_tyot at on at.id = ar.tyo_id

  union all
  -- Arkistoidun työn pohjaväri tai lakka.
  select
    ar.id::text || ':toinen',
    coalesce(at.valmistunut, at.aloitettu),
    ar.osa_id,
    ar.toinen_vari_id,
    ar.kappalemaara,
    coalesce(ar.toinen_toteutunut_kulutus_g, ar.toinen_arvioitu_kulutus_g, 0),
    coalesce(ar.toinen_vari_rooli, 'toinen'),
    at.valmistui_id
  from arkistoidut_tyon_rivit ar
  join arkistoidut_tyot at on at.id = ar.tyo_id
  where ar.toinen_vari_id is not null

  union all
  -- Arkistoidun custom-työn lisävärit.
  select
    al.id::text || ':lisavari',
    coalesce(at.valmistunut, at.aloitettu),
    ar.osa_id,
    al.vari_id,
    ar.kappalemaara,
    coalesce(al.toteutunut_kulutus_g, al.arvioitu_kulutus_g),
    'lisavari',
    at.valmistui_id
  from arkistoidut_rivin_lisavarit al
  join arkistoidut_tyon_rivit ar on ar.id = al.rivi_id
  join arkistoidut_tyot at on at.id = ar.tyo_id

  union all
  -- Vanhat maalaustapahtumat: taulu on tyhjä, mutta jos rivejä on, ne eivät saa
  -- kadota raportilta.
  select
    m.id::text || ':paavari',
    m.luotu,
    m.osa_id,
    m.vari_id,
    m.kappalemaara,
    m.toteutunut_kulutus_g,
    'paavari',
    m.kayttaja_id
  from maalaustapahtumat m

  union all
  select
    m.id::text || ':toinen',
    m.luotu,
    m.osa_id,
    m.toinen_vari_id,
    m.kappalemaara,
    coalesce(m.toinen_toteutunut_kulutus_g, 0),
    coalesce(m.toinen_vari_rooli, 'toinen'),
    m.kayttaja_id
  from maalaustapahtumat m
  where m.toinen_vari_id is not null
)
select
  k.id,
  k.luotu,
  date_trunc('day', k.luotu) as paiva,
  date_trunc('week', k.luotu) as viikko,
  date_trunc('month', k.luotu) as kuukausi,
  date_trunc('year', k.luotu) as vuosi,
  k.osa_id,
  o.nimi as osa_nimi,
  k.vari_id,
  v.nimi as vari_nimi,
  k.rooli,
  k.kappalemaara,
  k.kulutus_g as toteutunut_kulutus_g,
  k.kulutus_g / 1000.0 as toteutunut_kulutus_kg,
  round(k.kulutus_g / 1000.0 * vari_kokonaishinta(k.vari_id), 2) as maalikustannus_eur,
  k.kayttaja_id
from kaytto k
join osat o on o.id = k.osa_id
join varit v on v.id = k.vari_id;

alter view public.maalinkulutus_raportoituna set (security_invoker = true);
grant select on public.maalinkulutus_raportoituna to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Värien suosio
-- ---------------------------------------------------------------------------
-- Arkistoitu työ on yhtä lailla käyttökerta: väri on oikeasti maalattu, eikä
-- suosituimmuus saa nollautua sitä mukaa kun vanhat työt arkistoituvat.
create or replace view public.varien_suosio as
select
  v.id as vari_id,
  count(r.tyo_id) as kayttokerrat
from varit v
left join (
  select tyo_id, vari_id from tyon_rivit
  union all
  select tyo_id, toinen_vari_id from tyon_rivit where toinen_vari_id is not null
  union all
  select tr.tyo_id, l.vari_id
  from tyon_rivin_lisavarit l
  join tyon_rivit tr on tr.id = l.rivi_id
  union all
  select tyo_id, vari_id from arkistoidut_tyon_rivit
  union all
  select tyo_id, toinen_vari_id from arkistoidut_tyon_rivit where toinen_vari_id is not null
  union all
  select ar.tyo_id, al.vari_id
  from arkistoidut_rivin_lisavarit al
  join arkistoidut_tyon_rivit ar on ar.id = al.rivi_id
) r on r.vari_id = v.id
group by v.id;

alter view public.varien_suosio set (security_invoker = true);
grant select on public.varien_suosio to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Kuukauden käytetyin väri
-- ---------------------------------------------------------------------------
-- Luki vain eläviä töitä eikä tuntenut custom-töiden lisävärejä lainkaan.
-- Molemmat korjataan lukemalla sama kulutusnäkymä kuin raporteissa, jolloin
-- lähde on jatkossa yksi eikä pääse erkanemaan.
create or replace function public.kuukauden_kaytetyin_vari(p_kuukausi date default date_trunc('month', now())::date)
returns table (
  vari_id uuid,
  vari_nimi text,
  yhteensa_g numeric,
  yhteensa_kg numeric,
  tapahtumia bigint
)
language sql
stable
set search_path = public
as $$
  select
    k.vari_id,
    k.vari_nimi,
    sum(k.toteutunut_kulutus_g) as yhteensa_g,
    sum(k.toteutunut_kulutus_g) / 1000.0 as yhteensa_kg,
    count(*) as tapahtumia
  from maalinkulutus_raportoituna k
  where k.kuukausi = date_trunc('month', p_kuukausi::timestamptz)
  group by k.vari_id, k.vari_nimi
  order by yhteensa_g desc
  limit 1;
$$;

grant execute on function public.kuukauden_kaytetyin_vari(date) to authenticated;
