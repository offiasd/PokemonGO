-- Kahden värin maalaustapahtumat: candy tarvitsee pohjavärin, illusion
-- tarvitsee lakan, ja solid/RAL-väreille voi valinnaisesti lisätä lakkauksen.
-- Toteutetaan lisäämällä maalaustapahtumat-riville valinnainen "toinen väri"
-- (rooli + kulutus), ei erillisenä rivinä - yksi maalaustapahtuma on yksi
-- kirjattu työ, vaikka siihen kuluisi kaksi eri väriä.

alter table maalaustapahtumat
  add column toinen_vari_id uuid references varit(id),
  add column toinen_vari_rooli text check (toinen_vari_rooli in ('pohjavari', 'lakka')),
  add column toinen_arvioitu_kulutus_g numeric(12, 2),
  add column toinen_toteutunut_kulutus_g numeric(12, 2),
  add constraint maalaustapahtumat_toinen_vari_yhdenmukaisuus check (
    (toinen_vari_id is null) = (toinen_vari_rooli is null)
    and (toinen_vari_id is null) = (toinen_toteutunut_kulutus_g is null)
  );

comment on column maalaustapahtumat.toinen_vari_id is 'Valinnainen toinen väri samassa työssä: candyn pohjaväri tai illusionin lakka (tai solid-värin valinnainen lakkaus).';
comment on column maalaustapahtumat.toinen_vari_rooli is 'Toisen värin rooli: pohjavari (candy) tai lakka (illusion / valinnainen solid-lakkaus).';

create index maalaustapahtumat_toinen_vari_idx on maalaustapahtumat (toinen_vari_id);

-- Varastosaldon ylläpito: sama logiikka kuin päävärille, mutta toinen väri
-- voi puuttua kokonaan tai vaihtua/poistua päivityksen yhteydessä.
create or replace function public.maalaustapahtuma_paivita_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update varit set saldo_g = saldo_g - new.toteutunut_kulutus_g where id = new.vari_id;
    if new.toinen_vari_id is not null then
      update varit set saldo_g = saldo_g - coalesce(new.toinen_toteutunut_kulutus_g, 0)
      where id = new.toinen_vari_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.vari_id <> old.vari_id then
      update varit set saldo_g = saldo_g + old.toteutunut_kulutus_g where id = old.vari_id;
      update varit set saldo_g = saldo_g - new.toteutunut_kulutus_g where id = new.vari_id;
    elsif new.toteutunut_kulutus_g <> old.toteutunut_kulutus_g then
      update varit set saldo_g = saldo_g + (old.toteutunut_kulutus_g - new.toteutunut_kulutus_g)
      where id = new.vari_id;
    end if;

    if coalesce(old.toinen_vari_id, '00000000-0000-0000-0000-000000000000'::uuid)
       <> coalesce(new.toinen_vari_id, '00000000-0000-0000-0000-000000000000'::uuid) then
      if old.toinen_vari_id is not null then
        update varit set saldo_g = saldo_g + coalesce(old.toinen_toteutunut_kulutus_g, 0)
        where id = old.toinen_vari_id;
      end if;
      if new.toinen_vari_id is not null then
        update varit set saldo_g = saldo_g - coalesce(new.toinen_toteutunut_kulutus_g, 0)
        where id = new.toinen_vari_id;
      end if;
    elsif new.toinen_vari_id is not null
       and coalesce(new.toinen_toteutunut_kulutus_g, 0) <> coalesce(old.toinen_toteutunut_kulutus_g, 0) then
      update varit set saldo_g = saldo_g
        + (coalesce(old.toinen_toteutunut_kulutus_g, 0) - coalesce(new.toinen_toteutunut_kulutus_g, 0))
      where id = new.toinen_vari_id;
    end if;
  elsif tg_op = 'DELETE' then
    update varit set saldo_g = saldo_g + old.toteutunut_kulutus_g where id = old.vari_id;
    if old.toinen_vari_id is not null then
      update varit set saldo_g = saldo_g + coalesce(old.toinen_toteutunut_kulutus_g, 0)
      where id = old.toinen_vari_id;
    end if;
  end if;
  return null;
end;
$$;

-- Raportointinäkymä: mukaan toisen värin tiedot ja sen osuus kustannuksesta.
create or replace view maalaustapahtumat_raportoituna as
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
  round(
    (m.toteutunut_kulutus_g / 1000.0) * public.vari_kokonaishinta(m.vari_id)
    + coalesce(
        (m.toinen_toteutunut_kulutus_g / 1000.0) * public.vari_kokonaishinta(m.toinen_vari_id),
        0
      ),
    2
  ) as maalikustannus_eur,
  m.kayttaja_id,
  m.toinen_vari_id,
  tv.nimi as toinen_vari_nimi,
  m.toinen_vari_rooli,
  m.toinen_toteutunut_kulutus_g,
  m.toinen_toteutunut_kulutus_g / 1000.0 as toinen_toteutunut_kulutus_kg
from maalaustapahtumat m
join osat o on o.id = m.osa_id
join varit v on v.id = m.vari_id
left join varit tv on tv.id = m.toinen_vari_id;

comment on view maalaustapahtumat_raportoituna is 'Maalaustapahtumat esilaskettuine kg/€-arvoineen (sis. toisen värin osuuden), suodatettavissa päivä/viikko/kuukausi/vuosi tai väri/osa mukaan.';

alter view maalaustapahtumat_raportoituna set (security_invoker = true);

-- "Kuukauden käytetyin väri": lasketaan nyt sekä pää- että toisen värin kulutus yhteen per väri.
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
as $$
  select
    yhd.vari_id,
    v.nimi,
    sum(yhd.maara_g) as yhteensa_g,
    sum(yhd.maara_g) / 1000.0 as yhteensa_kg,
    count(*) as tapahtumia
  from (
    select vari_id, toteutunut_kulutus_g as maara_g, luotu from maalaustapahtumat
    union all
    select toinen_vari_id, toinen_toteutunut_kulutus_g, luotu
    from maalaustapahtumat
    where toinen_vari_id is not null
  ) yhd
  join varit v on v.id = yhd.vari_id
  where date_trunc('month', yhd.luotu) = date_trunc('month', p_kuukausi::timestamptz)
  group by yhd.vari_id, v.nimi
  order by yhteensa_g desc
  limit 1;
$$;
