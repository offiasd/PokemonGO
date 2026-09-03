-- Osakohtaiset poikkeukset ja monivärityöt.
--
-- Maalaamo tekee paljon custom-töitä, joissa sama osa maalataan usealla
-- värillä: kaksi jarrusatulaa eri candy-sävyillä, tai vanteet 50/50 kahdella
-- värillä. Näitä ei kannata listata osiksi, koska yhdistelmiä on rajattomasti.
--
-- Ratkaisu on kaksiosainen:
--
-- 1. Poikkeus on osalle nimetty lisätyö omalla hinnallaan ("50/50 perusvärit
--    +60 €"). Admin määrittelee ne osan sivulla ja maalaaja valitsee työtä
--    kootessaan. Nimi tallennetaan työriville, jotta työ näyttää mitä tehtiin
--    silloinkin kun osan poikkeuslistaa muutetaan myöhemmin.
--
-- 2. Sama osa voidaan lisätä koriin useaan kertaan eri väreillä, jolloin
--    jokainen rivi varaa ja kuluttaa omat grammansa. Lisäväriroriginaali ei
--    veloita osaa uudelleen: lisavari-lippu kertoo että rivi on saman osan
--    toinen väri, ja sen hinta on nolla.
--
-- Näin varasto pysyy oikeana ilman että työrivin värimalli pitää räjäyttää
-- moneen väriin - jokainen väri on oma rivinsä omalla kulutuksellaan.

create table if not exists public.osan_poikkeukset (
  id uuid primary key default gen_random_uuid(),
  osa_id uuid not null references public.osat (id) on delete cascade,
  nimi text not null,
  lisahinta_eur numeric(10, 2) not null default 0 check (lisahinta_eur >= 0),
  jarjestys integer not null default 0,
  unique (osa_id, nimi)
);

comment on table public.osan_poikkeukset is
  'Osalle nimetyt lisätyöt omalla hinnallaan, esim. "50/50 kahdella värillä". Valitaan työtä koottaessa.';

create index if not exists osan_poikkeukset_osa_idx on public.osan_poikkeukset (osa_id);

alter table public.osan_poikkeukset enable row level security;

create policy "Kirjautuneet lukevat poikkeukset" on public.osan_poikkeukset
  for select using (auth.role() = 'authenticated');
create policy "Admin muokkaa poikkeuksia" on public.osan_poikkeukset
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Työrivin tiedot
-- ---------------------------------------------------------------------------
alter table public.tyon_rivit
  add column if not exists poikkeus text,
  add column if not exists lisavari boolean not null default false;

alter table public.arkistoidut_tyon_rivit
  add column if not exists poikkeus text,
  add column if not exists lisavari boolean not null default false;

comment on column public.tyon_rivit.poikkeus is
  'Valitun poikkeuksen nimi työn tekohetkellä, esim. "50/50 perusvärit".';
comment on column public.tyon_rivit.lisavari is
  'Rivi on saman osan toinen väri: varaa maalia mutta ei veloita osaa uudelleen.';

-- ---------------------------------------------------------------------------
-- Rivien korvaus välittää uudet kentät
-- ---------------------------------------------------------------------------
create or replace function public.korvaa_tyon_rivit(p_tyo_id uuid, p_rivit jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tila text;
begin
  select tila into v_tila from tyot where id = p_tyo_id for update;

  if v_tila is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tila = 'valmis' then
    raise exception 'Valmiin työn rivejä ei voi muokata.';
  end if;
  if p_rivit is null or jsonb_array_length(p_rivit) = 0 then
    raise exception 'Työssä pitää olla vähintään yksi osa.';
  end if;

  delete from tyon_rivit where tyo_id = p_tyo_id;

  insert into tyon_rivit (
    tyo_id, osa_id, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
    toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g, poikkeus, lisavari
  )
  select
    p_tyo_id,
    (rivi->>'osa_id')::uuid,
    (rivi->>'vari_id')::uuid,
    coalesce((rivi->>'kappalemaara')::integer, 1),
    (rivi->>'arvioitu_kulutus_g')::numeric,
    (rivi->>'yksikkohinta_eur')::numeric,
    nullif(rivi->>'toinen_vari_id', '')::uuid,
    nullif(rivi->>'toinen_vari_rooli', ''),
    nullif(rivi->>'toinen_arvioitu_kulutus_g', '')::numeric,
    nullif(rivi->>'poikkeus', ''),
    coalesce((rivi->>'lisavari')::boolean, false)
  from jsonb_array_elements(p_rivit) as rivi;
end;
$$;

revoke all on function public.korvaa_tyon_rivit(uuid, jsonb) from public, anon;
grant execute on function public.korvaa_tyon_rivit(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Arkistointi säilyttää poikkeuksen
-- ---------------------------------------------------------------------------
create or replace function public.arkistoi_tyo(p_tyo_id uuid, p_automaattinen boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tyo tyot%rowtype;
begin
  select * into v_tyo from tyot where id = p_tyo_id for update;

  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila <> 'valmis' then
    raise exception 'Vain valmiin työn voi arkistoida.';
  end if;

  insert into arkistoidut_tyot (
    id, asiakas, aloitti_id, aloitettu, valmistui_id, valmistunut, alennus_prosentti,
    arkistoi_id, automaattinen
  )
  values (
    v_tyo.id, v_tyo.asiakas, v_tyo.aloitti_id, v_tyo.aloitettu, v_tyo.valmistui_id,
    v_tyo.valmistunut, v_tyo.alennus_prosentti,
    case when p_automaattinen then null else auth.uid() end,
    p_automaattinen
  );

  insert into arkistoidut_tyon_rivit (
    id, tyo_id, osa_id, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
    toteutunut_kulutus_g, toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g,
    toinen_toteutunut_kulutus_g, poikkeus, lisavari
  )
  select
    r.id, r.tyo_id, r.osa_id, r.vari_id, r.kappalemaara, r.arvioitu_kulutus_g,
    r.yksikkohinta_eur, r.toteutunut_kulutus_g, r.toinen_vari_id, r.toinen_vari_rooli,
    r.toinen_arvioitu_kulutus_g, r.toinen_toteutunut_kulutus_g, r.poikkeus, r.lisavari
  from tyon_rivit r
  where r.tyo_id = p_tyo_id;

  delete from tyot where id = p_tyo_id;
end;
$$;

revoke all on function public.arkistoi_tyo(uuid, boolean) from public, anon;
grant execute on function public.arkistoi_tyo(uuid, boolean) to authenticated;
