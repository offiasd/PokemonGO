-- Jauhemaalaamon seurantasovellus – alkuperäinen tietokantarakenne
-- Taulut, indeksit, laskentafunktiot, triggerit ja RLS-käytännöt.

create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- =========================================================================
-- 1. PROFIILIT JA ROOLIT
-- =========================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('admin', 'maalaaja')),
  created_at timestamptz not null default now()
);

comment on table profiles is 'Käyttäjäprofiilit ja roolit (admin / maalaaja).';

-- Uusi auth.users-rivi luo automaattisesti profiles-rivin roolilla "maalaaja".
-- Ensimmäinen admin luodaan käsin (esim. Supabase-konsolista tai SQL-editorista).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'maalaaja')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- =========================================================================
-- 2. ASETUKSET (yleiset admin-hallinnoitavat oletusarvot)
-- =========================================================================

create table asetukset (
  id boolean primary key default true constraint asetukset_singleton check (id),
  oletus_halytysraja_g numeric(12, 2) not null default 500,
  tullimaksu_prosentti_oletus numeric(5, 2) not null default 0,
  alv_prosentti_oletus numeric(5, 2) not null default 25.5,
  kate_prosentti_oletus numeric(5, 2) not null default 30,
  nayta_hinnat_maalaajalle boolean not null default false,
  yleinen_tuntihinta numeric(10, 2) not null default 45,
  updated_at timestamptz not null default now()
);

comment on table asetukset is 'Yhden rivin globaalit asetukset (tulli/ALV-oletukset, hälytysraja, hinnoittelunäkyvyys).';

insert into asetukset (id) values (true);

-- =========================================================================
-- 3. MAALIT (VÄRIT)
-- =========================================================================

create table varit (
  id uuid primary key default gen_random_uuid(),
  nimi text not null,
  valmistaja text,
  alkupera text not null default 'EU' check (alkupera in ('EU', 'USA', 'muu')),
  ostohinta_per_kg numeric(10, 2) not null check (ostohinta_per_kg >= 0),
  tullimaksu_prosentti numeric(5, 2),
  alv_prosentti numeric(5, 2),
  toimituskulu_per_kg numeric(10, 2) not null default 0 check (toimituskulu_per_kg >= 0),
  myyja_linkki text,
  kuva_url text,
  ohjeet text,
  ohje_tiedosto_url text,
  saldo_g numeric(12, 2) not null default 0,
  halytysraja_g numeric(12, 2),
  aktiivinen boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table varit is 'Jauhemaalivärit ja niiden varastosaldo.';
comment on column varit.tullimaksu_prosentti is 'Väriä koskeva ylikirjoitus; null = käytä asetukset.tullimaksu_prosentti_oletus.';
comment on column varit.alv_prosentti is 'Väriä koskeva ylikirjoitus; null = käytä asetukset.alv_prosentti_oletus.';
comment on column varit.halytysraja_g is 'Väriä koskeva ylikirjoitus; null = käytä asetukset.oletus_halytysraja_g.';

create index varit_nimi_trgm_idx on varit using gin (nimi gin_trgm_ops);
create index varit_valmistaja_trgm_idx on varit using gin (valmistaja gin_trgm_ops);
create index varit_aktiivinen_idx on varit (aktiivinen);

-- Kokonaishinta €/kg: EU = ostohinta + toimituskulu. USA/muu = ostohinta + tulli% + ALV% + toimituskulu.
create function public.vari_kokonaishinta_per_kg(
  p_alkupera text,
  p_ostohinta numeric,
  p_tullimaksu_prosentti numeric,
  p_alv_prosentti numeric,
  p_toimituskulu numeric
)
returns numeric
language sql
stable
as $$
  select case
    when p_alkupera = 'EU' then
      round(coalesce(p_ostohinta, 0) + coalesce(p_toimituskulu, 0), 2)
    else
      round(
        (coalesce(p_ostohinta, 0) * (1 + coalesce(p_tullimaksu_prosentti, 0) / 100.0)
          * (1 + coalesce(p_alv_prosentti, 0) / 100.0))
        + coalesce(p_toimituskulu, 0),
        2
      )
  end;
$$;

create function public.vari_kokonaishinta(p_vari_id uuid)
returns numeric
language sql
stable
as $$
  select public.vari_kokonaishinta_per_kg(
    v.alkupera,
    v.ostohinta_per_kg,
    coalesce(v.tullimaksu_prosentti, a.tullimaksu_prosentti_oletus),
    coalesce(v.alv_prosentti, a.alv_prosentti_oletus),
    v.toimituskulu_per_kg
  )
  from varit v, asetukset a
  where v.id = p_vari_id;
$$;

create function public.vari_halytysraja(p_vari_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(v.halytysraja_g, a.oletus_halytysraja_g)
  from varit v, asetukset a
  where v.id = p_vari_id;
$$;

create function public.varit_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger varit_updated_at
  before update on varit
  for each row execute function public.varit_set_updated_at();

-- =========================================================================
-- 4. OSAT (autot, mopot, moottoripyörät)
-- =========================================================================

create table osat (
  id uuid primary key default gen_random_uuid(),
  nimi text not null,
  ajoneuvotyyppi text not null check (ajoneuvotyyppi in ('auto', 'mopo', 'moottoripyora')),
  merkki text,
  malli text,
  vari_tyyppi text not null default 'yksivarinen'
    check (vari_tyyppi in ('yksivarinen', 'candy', 'illusion', 'metallic', 'muu_erikois')),
  arvioitu_kulutus_g numeric(10, 2) not null default 0 check (arvioitu_kulutus_g >= 0),
  kuva_url text,
  kate_prosentti numeric(5, 2),
  kate_kiintea numeric(10, 2),
  manuaalinen_hinta numeric(10, 2),
  aktiivinen boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table osat is 'Maalattavat osat (auto/mopo/moottoripyörä) ja niiden hinnoittelutiedot.';
comment on column osat.kate_prosentti is 'Osakohtainen kate-ylikirjoitus; null = käytä asetukset.kate_prosentti_oletus.';
comment on column osat.manuaalinen_hinta is 'Jos asetettu, ohittaa lasketun suositushinnan kokonaan.';

create index osat_nimi_trgm_idx on osat using gin (nimi gin_trgm_ops);
create index osat_merkki_trgm_idx on osat using gin (merkki gin_trgm_ops);
create index osat_malli_trgm_idx on osat using gin (malli gin_trgm_ops);
create index osat_ajoneuvotyyppi_idx on osat (ajoneuvotyyppi);
create index osat_vari_tyyppi_idx on osat (vari_tyyppi);

create trigger osat_updated_at
  before update on osat
  for each row execute function public.varit_set_updated_at();

create table osa_tyovaiheet (
  id uuid primary key default gen_random_uuid(),
  osa_id uuid not null references osat(id) on delete cascade,
  vaihe text not null check (vaihe in ('pesu', 'maalinpoisto', 'puhallus', 'teippaus', 'maalaus')),
  tarvitaan boolean not null default true,
  arvioitu_kesto_min integer not null default 0 check (arvioitu_kesto_min >= 0),
  unique (osa_id, vaihe)
);

comment on table osa_tyovaiheet is 'Osan työvaiheet (kyllä/ei + arvioitu kesto).';

create table tuntiveloitukset (
  id uuid primary key default gen_random_uuid(),
  vaihe text unique check (vaihe in ('pesu', 'maalinpoisto', 'puhallus', 'teippaus', 'maalaus')),
  tuntihinta numeric(10, 2) not null check (tuntihinta >= 0)
);

comment on table tuntiveloitukset is 'Tuntiveloitus vaiheittain. Rivi jossa vaihe on null = ei käytössä; katso asetukset.yleinen_tuntihinta kiinteälle veloitukselle.';

-- Osan kokonaistyöaika (minuutteina) tarvittavista vaiheista.
create function public.osa_tyoaika_min(p_osa_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(arvioitu_kesto_min), 0)::integer
  from osa_tyovaiheet
  where osa_id = p_osa_id and tarvitaan;
$$;

-- Työn kustannus: vaihekohtainen tuntihinta jos asetettu, muuten yleinen tuntihinta.
create function public.osa_tyokustannus(p_osa_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    (ot.arvioitu_kesto_min / 60.0) *
    coalesce(
      (select t.tuntihinta from tuntiveloitukset t where t.vaihe = ot.vaihe),
      (select yleinen_tuntihinta from asetukset limit 1)
    )
  ), 0)
  from osa_tyovaiheet ot
  where ot.osa_id = p_osa_id and ot.tarvitaan;
$$;

-- Maalikustannus: arvioitu kulutus (g) muutettuna kiloiksi * värin kokonaishinta/kg.
-- p_vari_id on valinnainen, koska osalle ei ole kiinteää väriä ennen maalaustapahtumaa.
create function public.osa_maalikustannus(p_osa_id uuid, p_vari_id uuid)
returns numeric
language sql
stable
as $$
  select case when p_vari_id is null then 0 else
    round((o.arvioitu_kulutus_g / 1000.0) * public.vari_kokonaishinta(p_vari_id), 2)
  end
  from osat o
  where o.id = p_osa_id;
$$;

create function public.osa_kustannusarvio(p_osa_id uuid, p_vari_id uuid default null)
returns numeric
language sql
stable
as $$
  select round(
    public.osa_maalikustannus(p_osa_id, p_vari_id) + public.osa_tyokustannus(p_osa_id),
    2
  );
$$;

create function public.osa_suositushinta(p_osa_id uuid, p_vari_id uuid default null)
returns numeric
language sql
stable
as $$
  select coalesce(
    o.manuaalinen_hinta,
    round(
      public.osa_kustannusarvio(p_osa_id, p_vari_id) *
      (1 + coalesce(o.kate_prosentti, a.kate_prosentti_oletus) / 100.0)
      + coalesce(o.kate_kiintea, 0),
      2
    )
  )
  from osat o, asetukset a
  where o.id = p_osa_id;
$$;

-- =========================================================================
-- 5. MAALAUSTAPAHTUMAT JA VARASTOTÄYDENNYKSET
-- =========================================================================

create table maalaustapahtumat (
  id uuid primary key default gen_random_uuid(),
  osa_id uuid not null references osat(id),
  vari_id uuid not null references varit(id),
  kappalemaara integer not null check (kappalemaara > 0),
  arvioitu_kulutus_g numeric(12, 2) not null,
  toteutunut_kulutus_g numeric(12, 2) not null,
  kayttaja_id uuid references profiles(id),
  luotu timestamptz not null default now()
);

comment on table maalaustapahtumat is 'Kirjatut maalaustapahtumat; vähentävät värin saldoa triggerillä.';

create index maalaustapahtumat_vari_idx on maalaustapahtumat (vari_id);
create index maalaustapahtumat_osa_idx on maalaustapahtumat (osa_id);
create index maalaustapahtumat_luotu_idx on maalaustapahtumat (luotu);

create table varastotayennykset (
  id uuid primary key default gen_random_uuid(),
  vari_id uuid not null references varit(id),
  maara_g numeric(12, 2) not null check (maara_g > 0),
  kayttaja_id uuid references profiles(id),
  luotu timestamptz not null default now()
);

comment on table varastotayennykset is 'Värivaraston täydennykset; kasvattavat värin saldoa triggerillä.';

create index varastotayennykset_vari_idx on varastotayennykset (vari_id);

-- Esitäyttö: jos toteutunut_kulutus_g puuttuu, arvioidaan se kappalemaara * osan arvioitu_kulutus_g.
create function public.maalaustapahtuma_esitaytto()
returns trigger
language plpgsql
as $$
begin
  if new.arvioitu_kulutus_g is null then
    select o.arvioitu_kulutus_g * new.kappalemaara into new.arvioitu_kulutus_g
    from osat o where o.id = new.osa_id;
  end if;
  if new.toteutunut_kulutus_g is null then
    new.toteutunut_kulutus_g := new.arvioitu_kulutus_g;
  end if;
  return new;
end;
$$;

create trigger maalaustapahtuma_esitaytto_trg
  before insert on maalaustapahtumat
  for each row execute function public.maalaustapahtuma_esitaytto();

-- Varastosaldon ylläpito maalaustapahtumista (INSERT vähentää, UPDATE säätää erotuksen, DELETE palauttaa).
create function public.maalaustapahtuma_paivita_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update varit set saldo_g = saldo_g - new.toteutunut_kulutus_g where id = new.vari_id;
  elsif tg_op = 'UPDATE' then
    if new.vari_id <> old.vari_id then
      update varit set saldo_g = saldo_g + old.toteutunut_kulutus_g where id = old.vari_id;
      update varit set saldo_g = saldo_g - new.toteutunut_kulutus_g where id = new.vari_id;
    elsif new.toteutunut_kulutus_g <> old.toteutunut_kulutus_g then
      update varit set saldo_g = saldo_g + (old.toteutunut_kulutus_g - new.toteutunut_kulutus_g)
      where id = new.vari_id;
    end if;
  elsif tg_op = 'DELETE' then
    update varit set saldo_g = saldo_g + old.toteutunut_kulutus_g where id = old.vari_id;
  end if;
  return null;
end;
$$;

create trigger maalaustapahtuma_saldo_trg
  after insert or update or delete on maalaustapahtumat
  for each row execute function public.maalaustapahtuma_paivita_saldo();

-- Varastosaldon ylläpito täydennyksistä.
create function public.varastotayennys_paivita_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update varit set saldo_g = saldo_g + new.maara_g where id = new.vari_id;
  elsif tg_op = 'UPDATE' then
    if new.vari_id <> old.vari_id then
      update varit set saldo_g = saldo_g - old.maara_g where id = old.vari_id;
      update varit set saldo_g = saldo_g + new.maara_g where id = new.vari_id;
    elsif new.maara_g <> old.maara_g then
      update varit set saldo_g = saldo_g + (new.maara_g - old.maara_g) where id = new.vari_id;
    end if;
  elsif tg_op = 'DELETE' then
    update varit set saldo_g = saldo_g - old.maara_g where id = old.vari_id;
  end if;
  return null;
end;
$$;

create trigger varastotayennys_saldo_trg
  after insert or update or delete on varastotayennykset
  for each row execute function public.varastotayennys_paivita_saldo();

-- =========================================================================
-- 6. RIVITASON TIETOTURVA (RLS)
-- =========================================================================
-- Huom: Postgres RLS suodattaa rivejä, ei sarakkeita. Kilohintojen/tuntiveloitusten
-- piilottaminen maalaajalta (asetukset.nayta_hinnat_maalaajalle) toteutetaan
-- sovelluskerroksessa (palvelinkomponentit valitsevat näytettävät sarakkeet roolin
-- ja asetuksen perusteella) – kaikki roolit voivat teknisesti lukea rivit.

alter table profiles enable row level security;
alter table asetukset enable row level security;
alter table varit enable row level security;
alter table osat enable row level security;
alter table osa_tyovaiheet enable row level security;
alter table tuntiveloitukset enable row level security;
alter table maalaustapahtumat enable row level security;
alter table varastotayennykset enable row level security;

-- profiles
create policy "Käyttäjä näkee oman profiilinsa" on profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "Admin hallinnoi profiileja" on profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- asetukset
create policy "Kirjautuneet lukevat asetukset" on asetukset
  for select using (auth.role() = 'authenticated');
create policy "Admin muokkaa asetuksia" on asetukset
  for update using (public.is_admin()) with check (public.is_admin());

-- varit
create policy "Kirjautuneet lukevat värit" on varit
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi värejä" on varit
  for insert with check (public.is_admin());
create policy "Admin muokkaa värejä" on varit
  for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin poistaa värejä" on varit
  for delete using (public.is_admin());

-- osat
create policy "Kirjautuneet lukevat osat" on osat
  for select using (auth.role() = 'authenticated');
create policy "Admin lisää osia" on osat
  for insert with check (public.is_admin());
create policy "Admin muokkaa osia" on osat
  for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin poistaa osia" on osat
  for delete using (public.is_admin());

-- osa_tyovaiheet
create policy "Kirjautuneet lukevat työvaiheet" on osa_tyovaiheet
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi työvaiheita" on osa_tyovaiheet
  for all using (public.is_admin()) with check (public.is_admin());

-- tuntiveloitukset
create policy "Kirjautuneet lukevat tuntiveloitukset" on tuntiveloitukset
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi tuntiveloituksia" on tuntiveloitukset
  for all using (public.is_admin()) with check (public.is_admin());

-- maalaustapahtumat: admin ja maalaaja voivat kirjata; molemmat näkevät historian; muokkaus/poisto vain adminille.
create policy "Kirjautuneet lukevat maalaustapahtumat" on maalaustapahtumat
  for select using (auth.role() = 'authenticated');
create policy "Kirjautuneet kirjaavat maalaustapahtumia" on maalaustapahtumat
  for insert with check (auth.role() = 'authenticated' and kayttaja_id = auth.uid());
create policy "Admin muokkaa maalaustapahtumia" on maalaustapahtumat
  for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin poistaa maalaustapahtumia" on maalaustapahtumat
  for delete using (public.is_admin());

-- varastotayennykset: kuten yllä.
create policy "Kirjautuneet lukevat täydennykset" on varastotayennykset
  for select using (auth.role() = 'authenticated');
create policy "Kirjautuneet kirjaavat täydennyksiä" on varastotayennykset
  for insert with check (auth.role() = 'authenticated' and kayttaja_id = auth.uid());
create policy "Admin muokkaa täydennyksiä" on varastotayennykset
  for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin poistaa täydennyksiä" on varastotayennykset
  for delete using (public.is_admin());
