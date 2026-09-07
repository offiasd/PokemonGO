-- Monen kuitin lisäys kerralla: liitteet omaan tauluun, erä ja lukujono.
--
-- kuitit.tiedosto_polku on yksikkömuodossa, eikä syy vaihtaa sitä ole
-- massalisäys vaan pitkä kassakuitti: Puuilon kuitti ei mahdu yhteen kuvaan,
-- jolloin samaan kuittiin tarvitaan 2-3 kuvaa oikeassa järjestyksessä.
--
-- Vanhoja sarakkeita ei poisteta tässä. Ne jäävät ensimmäisen liitteen
-- peilikuvaksi, jota trigger pitää ajan tasalla: näin luovutuspaketti,
-- tarkistukset ja Storage-politiikat toimivat muuttumattomina, ja sarakkeet
-- voi poistaa vasta kun siirto on käytössä varmistettu.

-- ---------------------------------------------------------------------------
-- 1. Tuontierä
-- ---------------------------------------------------------------------------

create table if not exists public.kuittierat (
  id uuid primary key default gen_random_uuid(),
  luoja_id uuid references public.profiles(id),
  tiedostoja integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.kuittierat is
  'Yksi latauskerta. Ilman erää 20 kuitin latauksen jälkeen ei tiedä mitä onnistui.';

alter table public.kuittierat enable row level security;

drop policy if exists "Admin hallinnoi kuittieria" on public.kuittierat;
create policy "Admin hallinnoi kuittieria" on public.kuittierat
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.kuitit
  add column if not exists era_id uuid references public.kuittierat(id) on delete set null;

create index if not exists kuitit_era_idx on public.kuitit (era_id);

-- ---------------------------------------------------------------------------
-- 2. Liitteet
-- ---------------------------------------------------------------------------

create table if not exists public.kuitin_liitteet (
  id uuid primary key default gen_random_uuid(),
  kuitti_id uuid not null references public.kuitit(id) on delete cascade,
  polku text not null,
  tyyppi text not null,
  jarjestys integer not null default 0,
  -- Sama tiedosto tulee helposti kahdesti kun valitsee galleriasta, joten
  -- kaksoiskappale tunnistetaan sisällöstä eikä nimestä.
  tiiviste text,
  created_at timestamptz not null default now()
);

comment on table public.kuitin_liitteet is
  'Kuitin kuvat ja PDF:t järjestyksessä. Pitkä kassakuitti on monta kuvaa.';
comment on column public.kuitin_liitteet.tiiviste is
  'Tiedoston SHA-256 heksana. Kaksoiskappaleiden tunnistus latausvaiheessa.';

create index if not exists kuitin_liitteet_kuitti_idx
  on public.kuitin_liitteet (kuitti_id, jarjestys);
create index if not exists kuitin_liitteet_tiiviste_idx
  on public.kuitin_liitteet (tiiviste);

alter table public.kuitin_liitteet enable row level security;

drop policy if exists "Admin hallinnoi kuitin liitteita" on public.kuitin_liitteet;
create policy "Admin hallinnoi kuitin liitteita" on public.kuitin_liitteet
  for all using (public.is_admin()) with check (public.is_admin());

-- Ensimmäinen liite peilataan kuitille. Näin kaikki vanha koodi - luovutuksen
-- "Tosite puuttuu" -tarkistus, paketin kokoaja ja Storage-politiikat - näkee
-- kuitin kuten ennenkin, vaikka liitteitä olisi kolme.
create or replace function public.paivita_kuitin_ensimmainen_liite()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kuitti uuid := coalesce(new.kuitti_id, old.kuitti_id);
  v_polku text;
  v_tyyppi text;
begin
  select polku, tyyppi into v_polku, v_tyyppi
  from public.kuitin_liitteet
  where kuitti_id = v_kuitti
  order by jarjestys, created_at
  limit 1;

  update public.kuitit
  set tiedosto_polku = v_polku,
      tiedosto_tyyppi = v_tyyppi
  where id = v_kuitti
    and (tiedosto_polku is distinct from v_polku or tiedosto_tyyppi is distinct from v_tyyppi);

  return coalesce(new, old);
end;
$$;

drop trigger if exists kuitin_liitteet_peilaus on public.kuitin_liitteet;
create trigger kuitin_liitteet_peilaus
after insert or update or delete on public.kuitin_liitteet
for each row execute function public.paivita_kuitin_ensimmainen_liite();

-- Vanhat kuitit uuteen tauluun. Peilaustrigger kirjoittaa saman polun
-- takaisin kuitille, joten siirto ei muuta mitään näkyvää.
insert into public.kuitin_liitteet (kuitti_id, polku, tyyppi, jarjestys)
select k.id, k.tiedosto_polku, coalesce(k.tiedosto_tyyppi, 'image/jpeg'), 0
from public.kuitit k
where k.tiedosto_polku is not null
  and not exists (select 1 from public.kuitin_liitteet l where l.kuitti_id = k.id);

-- ---------------------------------------------------------------------------
-- 3. Lukujono
-- ---------------------------------------------------------------------------

-- Kahdenkymmenen kuitin lukeminen samassa pyynnössä kaatuisi Edge Functionin
-- aikarajaan, joten tiedostot tallennetaan ensin ja luku ajetaan jonosta
-- muutama kerrallaan. Tila on kannassa, joten näkymän voi sulkea kesken.
alter table public.kuitit
  add column if not exists poiminnan_tila text not null default 'ei_luettu',
  add column if not exists poiminnan_virhe text,
  add column if not exists poiminnan_yritykset integer not null default 0,
  add column if not exists poiminta_alkoi_at timestamptz;

alter table public.kuitit
  drop constraint if exists kuitit_poiminnan_tila;
alter table public.kuitit
  add constraint kuitit_poiminnan_tila
  check (poiminnan_tila in ('ei_luettu', 'jonossa', 'luetaan', 'luettu', 'virhe'));

create index if not exists kuitit_poiminnan_jono_idx
  on public.kuitit (poiminnan_tila, created_at)
  where poiminnan_tila in ('jonossa', 'luetaan');

comment on column public.kuitit.poiminnan_tila is
  'Lukujonon tila: ei_luettu, jonossa, luetaan, luettu, virhe.';

-- ---------------------------------------------------------------------------
-- 4. Erän luonti
-- ---------------------------------------------------------------------------

-- Yläraja suojaa sekä Storage-tilaa että API-kuluja: kahtakymmentä enempää ei
-- kerralla oteta vastaan.
create or replace function public.luo_kuittiera(p_tiedostoja integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi lisätä kuitteja.';
  end if;
  if coalesce(p_tiedostoja, 0) < 1 then
    raise exception 'Erässä on oltava vähintään yksi tiedosto.';
  end if;
  if p_tiedostoja > 20 then
    raise exception 'Kerralla voi lisätä enintään 20 tiedostoa.';
  end if;

  insert into public.kuittierat (luoja_id, tiedostoja)
  values (auth.uid(), p_tiedostoja)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.luo_kuittiera(integer) from public;
grant execute on function public.luo_kuittiera(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Poiminnan tallennus
-- ---------------------------------------------------------------------------

-- Jonosta luettu kuitti tallentuu kannassa eikä lomakkeella, joten sama
-- kirjoitus tehdään yhtenä toimintona: otsikkotiedot, rivit ja aiemmin
-- opitut luokittelut. Käyttäjä tarkistaa tuloksen kuitin sivulla.
create or replace function public.tallenna_poiminta(p_kuitti_id uuid, p_poiminta jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rivi jsonb;
  v_jarjestys integer := 0;
  v_kayttotarkoitus text;
  v_kululuokka uuid;
begin
  update public.kuitit
  set toimittaja = coalesce(nullif(p_poiminta->>'toimittaja', ''), toimittaja),
      paivays = coalesce((p_poiminta->>'paivays')::date, paivays),
      maksupaiva = coalesce((p_poiminta->>'maksupaiva')::date, maksupaiva),
      loppusumma_eur = coalesce((p_poiminta->>'loppusumma_eur')::numeric, loppusumma_eur),
      alv_erittely = case
        when jsonb_typeof(p_poiminta->'alv_erittely') = 'array' then p_poiminta->'alv_erittely'
        else alv_erittely
      end,
      updated_at = now()
  where id = p_kuitti_id;

  if not found then
    raise exception 'Kuittia ei löytynyt.';
  end if;

  delete from public.kuitin_rivit where kuitti_id = p_kuitti_id;

  for v_rivi in select * from jsonb_array_elements(coalesce(p_poiminta->'rivit', '[]'::jsonb))
  loop
    -- Aiemmin luokiteltu sama tuoteteksti esitäyttyy: luokittelu on tieto
    -- tuotteesta, ei yksittäisestä kuitista.
    -- Avain normalisoidaan samalla tavalla kuin sovelluksessa: pienet
    -- kirjaimet ja yhdet välilyönnit.
    v_kayttotarkoitus := null;
    v_kululuokka := null;
    select o.kayttotarkoitus, o.kululuokka_id
    into v_kayttotarkoitus, v_kululuokka
    from public.kuittirivin_oppi o
    where o.teksti = btrim(lower(regexp_replace(coalesce(v_rivi->>'teksti', ''), '\s+', ' ', 'g')));

    insert into public.kuitin_rivit (
      kuitti_id, teksti, maara, brutto_eur, verokanta, kayttotarkoitus, kululuokka_id, jarjestys
    )
    values (
      p_kuitti_id,
      coalesce(nullif(btrim(v_rivi->>'teksti'), ''), 'Rivi'),
      (v_rivi->>'maara')::numeric,
      coalesce((v_rivi->>'brutto_eur')::numeric, 0),
      (v_rivi->>'verokanta')::numeric,
      v_kayttotarkoitus,
      v_kululuokka,
      v_jarjestys
    );

    v_jarjestys := v_jarjestys + 1;
  end loop;

  -- Luettu kuitti odottaa aina ihmisen silmää: poiminta on ehdotus, ei totuus.
  update public.kuitit
  set tila = 'tarkistettava',
      poiminnan_tila = 'luettu',
      poiminnan_virhe = null,
      updated_at = now()
  where id = p_kuitti_id;
end;
$$;

revoke execute on function public.tallenna_poiminta(uuid, jsonb) from public;
grant execute on function public.tallenna_poiminta(uuid, jsonb) to service_role;

create or replace function public.merkitse_poiminta_virheeksi(p_kuitti_id uuid, p_virhe text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.kuitit
  set poiminnan_tila = 'virhe',
      poiminnan_virhe = left(coalesce(p_virhe, 'Tuntematon virhe'), 500),
      updated_at = now()
  where id = p_kuitti_id;
end;
$$;

revoke execute on function public.merkitse_poiminta_virheeksi(uuid, text) from public;
grant execute on function public.merkitse_poiminta_virheeksi(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Jonon ajo
-- ---------------------------------------------------------------------------

-- Avain ja osoite ovat vaultissa, koska cron kutsuu Edge Functionia HTTP:llä
-- eikä kannassa ole muuta paikkaa palvelinavaimelle.
create or replace function public.aseta_kuittijonon_avain(p_avain text, p_url text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi asettaa jonon avaimen.';
  end if;
  if coalesce(btrim(p_avain), '') = '' or coalesce(btrim(p_url), '') = '' then
    raise exception 'Anna sekä avain että osoite.';
  end if;

  select id into v_id from vault.secrets where name = 'kuittijono_avain';
  if v_id is null then
    perform vault.create_secret(btrim(p_avain), 'kuittijono_avain', 'Palvelinavain kuittijonon Edge Function -kutsuihin');
  else
    perform vault.update_secret(v_id, btrim(p_avain));
  end if;

  select id into v_id from vault.secrets where name = 'kuittijono_url';
  if v_id is null then
    perform vault.create_secret(btrim(p_url), 'kuittijono_url', 'lue-kuitti-funktion osoite');
  else
    perform vault.update_secret(v_id, btrim(p_url));
  end if;
end;
$$;

revoke execute on function public.aseta_kuittijonon_avain(text, text) from public;
grant execute on function public.aseta_kuittijonon_avain(text, text) to authenticated;

-- Jono etenee muutama kerrallaan: kolme rinnakkaista lukua riittää pitämään
-- kahdenkymmenen kuitin erän liikkeessä ilman että rajapinnan käyttöraja tai
-- Edge Functionin aikaraja tulee vastaan.
create or replace function public.kuittijonon_ajo(p_maara integer default 3)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_avain text;
  v_url text;
  v_kuitti record;
  v_lahetetty integer := 0;
begin
  select decrypted_secret into v_avain from vault.decrypted_secrets where name = 'kuittijono_avain';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'kuittijono_url';
  if v_avain is null or v_url is null then
    return 0;
  end if;

  -- Kesken jäänyt luku palaa jonoon: Edge Function on voinut kaatua kesken
  -- kutsun, jolloin kuitti jäisi muuten ikuisesti "luetaan"-tilaan.
  update public.kuitit
  set poiminnan_tila = case when poiminnan_yritykset >= 3 then 'virhe' else 'jonossa' end,
      poiminnan_virhe = case
        when poiminnan_yritykset >= 3 then 'Luku ei valmistunut kolmella yrityksellä.'
        else poiminnan_virhe
      end
  where poiminnan_tila = 'luetaan'
    and poiminta_alkoi_at < now() - interval '5 minutes';

  for v_kuitti in
    select id from public.kuitit
    where poiminnan_tila = 'jonossa'
      and tiedosto_polku is not null
    order by created_at
    limit greatest(coalesce(p_maara, 3), 1)
    for update skip locked
  loop
    update public.kuitit
    set poiminnan_tila = 'luetaan',
        poiminnan_yritykset = poiminnan_yritykset + 1,
        poiminta_alkoi_at = now()
    where id = v_kuitti.id;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_avain
      ),
      body := jsonb_build_object('kuitti_id', v_kuitti.id, 'jono', true),
      timeout_milliseconds := 120000
    );

    v_lahetetty := v_lahetetty + 1;
  end loop;

  return v_lahetetty;
end;
$$;

revoke execute on function public.kuittijonon_ajo(integer) from public;

select cron.unschedule('kuittijono')
where exists (select 1 from cron.job where jobname = 'kuittijono');

select cron.schedule('kuittijono', '* * * * *', $cron$select public.kuittijonon_ajo()$cron$);

-- ---------------------------------------------------------------------------
-- 7. Storage: liitteet mukaan poistosuojaan
-- ---------------------------------------------------------------------------

-- Suoja koski vain kuitit.tiedosto_polkua. Nyt luovutetun kuitin mikä tahansa
-- liite on suojattu, ei vain ensimmäinen.
drop policy if exists "Admin poistaa kuittitiedostot" on storage.objects;

create policy "Admin poistaa kuittitiedostot"
on storage.objects for delete
using (
  bucket_id = 'kuitit'
  and public.is_admin()
  and not exists (
    select 1
    from public.kuitin_liitteet l
    join public.kuitit k on k.id = l.kuitti_id
    where l.polku = storage.objects.name
      and k.luovutettu_at is not null
  )
  and not exists (
    select 1 from public.kuitit k
    where k.tiedosto_polku = storage.objects.name
      and k.luovutettu_at is not null
  )
);

-- ---------------------------------------------------------------------------
-- 8. Poisto vie kaikki liitteet
-- ---------------------------------------------------------------------------

-- Rivit katoavat cascadella, mutta Storage-tiedostot on poistettava erikseen.
-- Funktio palauttaa kaikki polut, jotta sovellus siivoaa ne kerralla.
-- Paluutyyppi muuttuu tekstistä taulukoksi, joten vanha versio poistetaan.
drop function if exists public.poista_kuitti_pysyvasti(uuid);

create function public.poista_kuitti_pysyvasti(p_kuitti_id uuid)
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_polut text[];
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi poistaa kuitin.';
  end if;

  select array_remove(array_agg(distinct polku), null) into v_polut
  from (
    select l.polku from public.kuitin_liitteet l where l.kuitti_id = p_kuitti_id
    union
    select k.tiedosto_polku from public.kuitit k where k.id = p_kuitti_id
  ) polut;

  if not exists (select 1 from public.kuitit where id = p_kuitti_id) then
    raise exception 'Kuittia ei löytynyt.';
  end if;

  delete from public.kuitit where id = p_kuitti_id;

  return coalesce(v_polut, '{}');
end;
$$;

revoke execute on function public.poista_kuitti_pysyvasti(uuid) from public;
grant execute on function public.poista_kuitti_pysyvasti(uuid) to authenticated;

-- Erän poisto heti latauksen jälkeen: kaikki erän kuitit kerralla, samalla
-- säilytyssäännöllä kuin yksittäinen kuitti.
create or replace function public.poista_kuittiera(p_era_id uuid)
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_polut text[] := '{}';
  v_kuitti record;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi poistaa kuitteja.';
  end if;

  for v_kuitti in select id from public.kuitit where era_id = p_era_id
  loop
    v_polut := v_polut || public.poista_kuitti_pysyvasti(v_kuitti.id);
  end loop;

  delete from public.kuittierat where id = p_era_id;

  return v_polut;
end;
$$;

revoke execute on function public.poista_kuittiera(uuid) from public;
grant execute on function public.poista_kuittiera(uuid) to authenticated;
