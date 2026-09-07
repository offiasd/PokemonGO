-- Kuukauden luovutus kirjanpitäjälle.
--
-- Kuukausi kootaan paketiksi, tarkistetaan ja lähetetään. Lähetys lukitsee
-- kauden: kirjanpitäjälle mennyttä aineistoa ei voi perua, joten sen alta ei
-- saa vaihtaa kuitteja. Avaaminen on oma toimintonsa ja jää lokiin.
--
-- Tarkistukset lasketaan kannassa eikä sovelluksessa, koska sekä
-- käyttöliittymä että kuukausittainen automaatio tarvitsevat täsmälleen samat
-- luvut. Kaksi toteutusta ehtisi erkaantua toisistaan.

-- ---------------------------------------------------------------------------
-- 1. Luovutus ja sen loki
-- ---------------------------------------------------------------------------
create table if not exists public.luovutukset (
  id uuid primary key default gen_random_uuid(),
  -- Kuukauden ensimmäinen päivä. Yksi luovutus kautta kohden.
  kausi date not null unique,
  tila text not null default 'koottu',
  -- Tarkistusten tulos kokoamishetkellä, sellaisenaan näytettäväksi.
  tarkistukset jsonb,
  -- Vientiasetukset joilla kausi viimeksi lähetettiin.
  asetukset jsonb,
  kuitteja integer not null default 0,
  kuluina_eur numeric(12, 2) not null default 0,
  yhteensa_eur numeric(12, 2) not null default 0,
  koottu_at timestamptz not null default now(),
  lahetetty_at timestamptz,
  lahettaja_id uuid references auth.users (id) on delete set null
);

alter table public.luovutukset drop constraint if exists luovutukset_tila_check;
alter table public.luovutukset
  add constraint luovutukset_tila_check check (tila in ('koottu', 'lahetetty'));

comment on table public.luovutukset is
  'Yhden kuukauden luovutus kirjanpitäjälle. Tila lahetetty lukitsee kauden kuitit.';

-- Loki on tapahtumakohtainen eikä kausikohtainen: kausi voidaan avata ja
-- lähettää uudelleen, ja kirjanpitäjälle on mennyt silloin kaksi eri
-- aineistoa. Kumpikin tarvitaan jäljitettäväksi.
create table if not exists public.luovutuksen_loki (
  id uuid primary key default gen_random_uuid(),
  luovutus_id uuid not null references public.luovutukset (id) on delete cascade,
  tapahtuma text not null,
  asetukset jsonb,
  kuitti_idt uuid[] not null default '{}',
  kuitteja integer not null default 0,
  kuluina_eur numeric(12, 2) not null default 0,
  kayttaja_id uuid references auth.users (id) on delete set null,
  aika timestamptz not null default now()
);

alter table public.luovutuksen_loki drop constraint if exists luovutuksen_loki_tapahtuma_check;
alter table public.luovutuksen_loki
  add constraint luovutuksen_loki_tapahtuma_check check (tapahtuma in ('lahetetty', 'avattu'));

create index if not exists luovutuksen_loki_luovutus_idx
  on public.luovutuksen_loki (luovutus_id, aika desc);

alter table public.luovutukset enable row level security;
alter table public.luovutuksen_loki enable row level security;

drop policy if exists luovutukset_admin on public.luovutukset;
create policy luovutukset_admin on public.luovutukset
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists luovutuksen_loki_admin on public.luovutuksen_loki;
create policy luovutuksen_loki_admin on public.luovutuksen_loki
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Kauden lukitus
-- ---------------------------------------------------------------------------
create or replace function public.kausi_lukittu(p_paivays date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.luovutukset
    where tila = 'lahetetty'
      and kausi = date_trunc('month', p_paivays::timestamp)::date
  );
$$;

create or replace function public.esta_lukitun_kauden_muutos()
returns trigger
language plpgsql
as $$
declare
  v_paivays date;
begin
  v_paivays := coalesce(new.paivays, old.paivays);
  if public.kausi_lukittu(v_paivays) then
    raise exception
      'Kausi % on luovutettu kirjanpitäjälle. Avaa luovutus ennen muutoksia.',
      to_char(v_paivays, 'MM/YYYY');
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists kuitit_kauden_lukitus on public.kuitit;
create trigger kuitit_kauden_lukitus
  before insert or update or delete on public.kuitit
  for each row execute function public.esta_lukitun_kauden_muutos();

-- Rivit tarkistetaan emokuitin päiväyksestä: rivi ei tiedä omaa kauttaan.
create or replace function public.esta_lukitun_kauden_rivimuutos()
returns trigger
language plpgsql
as $$
declare
  v_paivays date;
begin
  select paivays into v_paivays
  from public.kuitit
  where id = coalesce(new.kuitti_id, old.kuitti_id);

  -- Kuitin poisto vie rivit mennessään; silloin emo on jo tarkistettu.
  if v_paivays is null then
    return coalesce(new, old);
  end if;

  if public.kausi_lukittu(v_paivays) then
    raise exception
      'Kausi % on luovutettu kirjanpitäjälle. Avaa luovutus ennen muutoksia.',
      to_char(v_paivays, 'MM/YYYY');
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists kuitin_rivit_kauden_lukitus on public.kuitin_rivit;
create trigger kuitin_rivit_kauden_lukitus
  before insert or update or delete on public.kuitin_rivit
  for each row execute function public.esta_lukitun_kauden_rivimuutos();

-- ---------------------------------------------------------------------------
-- 3. Tarkistukset
-- ---------------------------------------------------------------------------
-- Neljä tarkistusta ennen luovutusta. Jokainen palauttaa myös ne kuitit joita
-- se koskee, jotta käyttöliittymä voi linkittää suoraan korjattavaan.
--
-- Aukko tarkoittaa puuttuvaa tositetta: kuittiriviä, jonka takana ei ole
-- tiedostoa. Kalenteriaukkoja ei lasketa, koska hiljainen viikko on normaali
-- eikä puute.
-- Pelkkä laskenta ilman oikeustarkistusta. Ei annettu kenellekään suoraan:
-- kutsutaan vain alla olevista funktioista, jotka tarkistavat oikeuden itse.
-- Näin kuukausiautomaatti ja käyttöliittymä laskevat samasta määritelmästä.
create or replace function public.luovutuksen_tarkistukset_laskenta(p_kausi date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tulos jsonb;
begin
  with rajat as (
    select
      date_trunc('month', p_kausi::timestamp)::date as alku,
      (date_trunc('month', p_kausi::timestamp) + interval '1 month')::date as loppu
  ),
  kk as (
    select
      k.id, k.toimittaja, k.paivays, k.loppusumma_eur, k.tiedosto_polku,
      count(r.id)::integer as riveja,
      count(r.id) filter (where r.kayttotarkoitus is null)::integer as luokittelematta,
      coalesce(sum(r.brutto_eur), 0) as rivit_yhteensa,
      coalesce(sum(r.brutto_eur) filter (
        where r.kayttotarkoitus in ('yrityksen_tarvike', 'edustus', 'henkilokunnan_tarjoilu')
      ), 0) as kuluina
    from public.kuitit k
    cross join rajat
    left join public.kuitin_rivit r on r.kuitti_id = k.id
    where k.paivays >= rajat.alku and k.paivays < rajat.loppu
    group by k.id
  ),
  summat as (
    select
      count(*)::integer as kuitteja,
      coalesce(sum(kuluina), 0)::numeric(12, 2) as kuluina_eur,
      coalesce(sum(rivit_yhteensa), 0)::numeric(12, 2) as yhteensa_eur
    from kk
  ),
  luokittelematta as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'toimittaja', toimittaja, 'paivays', paivays,
      'syy', case when riveja = 0 then 'Ei rivejä'
                  else luokittelematta || ' riviä luokittelematta' end
    ) order by paivays), '[]'::jsonb) as kuitit
    from kk where riveja = 0 or luokittelematta > 0
  ),
  tasmaamatta as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'toimittaja', toimittaja, 'paivays', paivays,
      'syy', 'Rivit ' || to_char(rivit_yhteensa, 'FM999999990.00')
             || ' €, loppusumma ' || to_char(loppusumma_eur, 'FM999999990.00') || ' €'
    ) order by paivays), '[]'::jsonb) as kuitit
    from kk where riveja > 0 and abs(rivit_yhteensa - loppusumma_eur) > 0.01
  ),
  -- Sama ostos voi tulla sekä verkkokaupan PDF:nä että kuvattuna paperina,
  -- joten vertailu on sisällöstä eikä tiedostosta.
  kaksoiskappaleet as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'toimittaja', t.toimittaja, 'paivays', t.paivays,
      'syy', 'Sama toimittaja, päivä ja summa'
    ) order by t.paivays), '[]'::jsonb) as kuitit
    from kk t
    where exists (
      select 1 from kk m
      where m.id <> t.id
        and lower(coalesce(m.toimittaja, '')) = lower(coalesce(t.toimittaja, ''))
        and m.paivays = t.paivays
        and m.loppusumma_eur = t.loppusumma_eur
    )
  ),
  aukot as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'toimittaja', toimittaja, 'paivays', paivays,
      'syy', 'Tosite puuttuu'
    ) order by paivays), '[]'::jsonb) as kuitit
    from kk where tiedosto_polku is null
  )
  select jsonb_build_object(
    'kausi', (select alku from rajat),
    'kuitteja', s.kuitteja,
    'kuluina_eur', s.kuluina_eur,
    'yhteensa_eur', s.yhteensa_eur,
    'tarkistukset', jsonb_build_array(
      jsonb_build_object('avain', 'luokiteltu', 'nimi', 'Kaikki kuitit luokiteltu',
        'ok', jsonb_array_length(l.kuitit) = 0, 'kuitit', l.kuitit),
      jsonb_build_object('avain', 'tasmays', 'nimi', 'Summat täsmäävät',
        'ok', jsonb_array_length(t.kuitit) = 0, 'kuitit', t.kuitit),
      jsonb_build_object('avain', 'kaksoiskappaleet', 'nimi', 'Ei kaksoiskappaleita',
        'ok', jsonb_array_length(d.kuitit) = 0, 'kuitit', d.kuitit),
      jsonb_build_object('avain', 'aukot', 'nimi', 'Ei aukkoja kuukaudessa',
        'ok', jsonb_array_length(a.kuitit) = 0, 'kuitit', a.kuitit)
    ),
    -- Tyhjää kuukautta ei luovuteta: ei ole mitä luovuttaa.
    'kunnossa', s.kuitteja > 0
      and jsonb_array_length(l.kuitit) = 0
      and jsonb_array_length(t.kuitit) = 0
      and jsonb_array_length(d.kuitit) = 0
      and jsonb_array_length(a.kuitit) = 0
  )
  into v_tulos
  from summat s, luokittelematta l, tasmaamatta t, kaksoiskappaleet d, aukot a;

  return v_tulos;
end;
$$;

create or replace function public.luovutuksen_tarkistukset(p_kausi date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi tarkistaa luovutuksen.';
  end if;
  return public.luovutuksen_tarkistukset_laskenta(p_kausi);
end;
$$;

revoke all on function public.luovutuksen_tarkistukset_laskenta(date) from public;
revoke all on function public.luovutuksen_tarkistukset(date) from public;
grant execute on function public.luovutuksen_tarkistukset(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Kokoaminen, lähetys ja avaaminen
-- ---------------------------------------------------------------------------
-- Kokoaminen on sallittu myös service_rolelle, koska kuukausittainen
-- automaatio ajaa sen ilman kirjautunutta käyttäjää. Lähetys ja avaaminen
-- eivät ole: kirjanpitäjälle mennyttä aineistoa ei voi perua, joten sen takana
-- on aina ihminen.
create or replace function public.kokoa_luovutus(p_kausi date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kausi date := date_trunc('month', p_kausi::timestamp)::date;
  v_tarkistukset jsonb;
  v_tila text;
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'Vain admin voi koota luovutuksen.';
  end if;

  v_tarkistukset := public.luovutuksen_tarkistukset_laskenta(v_kausi);

  select tila into v_tila from public.luovutukset where kausi = v_kausi;

  -- Lähetettyä kautta ei koota uudelleen: sen aineisto on jo mennyt, ja
  -- luvut pysyvät sinä mitä lähetettiin.
  if v_tila = 'lahetetty' then
    return v_tarkistukset;
  end if;

  insert into public.luovutukset (
    kausi, tila, tarkistukset, kuitteja, kuluina_eur, yhteensa_eur, koottu_at
  )
  values (
    v_kausi, 'koottu', v_tarkistukset,
    (v_tarkistukset->>'kuitteja')::integer,
    (v_tarkistukset->>'kuluina_eur')::numeric,
    (v_tarkistukset->>'yhteensa_eur')::numeric,
    now()
  )
  on conflict (kausi) do update set
    tarkistukset = excluded.tarkistukset,
    kuitteja = excluded.kuitteja,
    kuluina_eur = excluded.kuluina_eur,
    yhteensa_eur = excluded.yhteensa_eur,
    koottu_at = now();

  return v_tarkistukset;
end;
$$;

create or replace function public.laheta_luovutus(p_kausi date, p_asetukset jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kausi date := date_trunc('month', p_kausi::timestamp)::date;
  v_tarkistukset jsonb;
  v_luovutus uuid;
  v_idt uuid[];
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi lähettää luovutuksen.';
  end if;

  v_tarkistukset := public.luovutuksen_tarkistukset_laskenta(v_kausi);
  -- Lähetysnappi on estetty kunnes puutteet on korjattu; sama sääntö
  -- toistetaan kannassa, jottei estoa voi kiertää.
  if not (v_tarkistukset->>'kunnossa')::boolean then
    raise exception 'Kaudella % on korjaamattomia puutteita.', to_char(v_kausi, 'MM/YYYY');
  end if;

  select array_agg(id order by paivays) into v_idt
  from public.kuitit
  where paivays >= v_kausi
    and paivays < (v_kausi + interval '1 month')::date;

  insert into public.luovutukset (
    kausi, tila, tarkistukset, asetukset, kuitteja, kuluina_eur, yhteensa_eur,
    lahetetty_at, lahettaja_id
  )
  values (
    v_kausi, 'lahetetty', v_tarkistukset, p_asetukset,
    (v_tarkistukset->>'kuitteja')::integer,
    (v_tarkistukset->>'kuluina_eur')::numeric,
    (v_tarkistukset->>'yhteensa_eur')::numeric,
    now(), auth.uid()
  )
  on conflict (kausi) do update set
    tila = 'lahetetty',
    tarkistukset = excluded.tarkistukset,
    asetukset = excluded.asetukset,
    kuitteja = excluded.kuitteja,
    kuluina_eur = excluded.kuluina_eur,
    yhteensa_eur = excluded.yhteensa_eur,
    lahetetty_at = now(),
    lahettaja_id = auth.uid()
  returning id into v_luovutus;

  insert into public.luovutuksen_loki (
    luovutus_id, tapahtuma, asetukset, kuitti_idt, kuitteja, kuluina_eur, kayttaja_id
  )
  values (
    v_luovutus, 'lahetetty', p_asetukset, coalesce(v_idt, '{}'),
    (v_tarkistukset->>'kuitteja')::integer,
    (v_tarkistukset->>'kuluina_eur')::numeric,
    auth.uid()
  );

  return v_tarkistukset;
end;
$$;

create or replace function public.avaa_luovutus(p_kausi date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kausi date := date_trunc('month', p_kausi::timestamp)::date;
  v_luovutus uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi avata luovutuksen.';
  end if;

  update public.luovutukset
  set tila = 'koottu'
  where kausi = v_kausi and tila = 'lahetetty'
  returning id into v_luovutus;

  if v_luovutus is null then
    raise exception 'Kautta % ei ole lukittu.', to_char(v_kausi, 'MM/YYYY');
  end if;

  insert into public.luovutuksen_loki (luovutus_id, tapahtuma, kayttaja_id)
  values (v_luovutus, 'avattu', auth.uid());
end;
$$;

revoke all on function public.kokoa_luovutus(date) from public;
revoke all on function public.laheta_luovutus(date, jsonb) from public;
revoke all on function public.avaa_luovutus(date) from public;
grant execute on function public.kokoa_luovutus(date) to authenticated, service_role;
grant execute on function public.laheta_luovutus(date, jsonb) to authenticated;
grant execute on function public.avaa_luovutus(date) to authenticated;
