-- Custom-työt: yksi työrivi, monta väriä, oma hinta ja kommentti.
--
-- Maalaamo tekee paljon töitä joissa yksi osa maalataan usealla värillä:
-- vanteet 50/50 kahdella värillä, satuloiden logot omalla sävyllään, tai kaksi
-- satulaa eri candy-sävyillä. Yhdistelmiä on rajattomasti, joten niitä ei voi
-- listata osiksi eikä hinnoitella etukäteen.
--
-- Työrivillä on jo kaksi värikenttää (pääväri + pohjaväri tai lakka), jotka
-- riittävät tavalliseen työhön. Custom-työssä värejä voi olla enemmän, joten
-- ylimääräiset saavat oman taulunsa: jokainen väri varaa ja kuluttaa omat
-- grammansa täsmälleen samoin kuin rivin kaksi omaa väriä. Näin varasto pysyy
-- oikeana ilman että työrivin rakennetta pitää muuttaa - ja tavalliset työt
-- kulkevat entistä reittiään koskematta.
--
-- Kulutus ja hinta ovat custom-työssä maalaajan päätettävissä: kategorian
-- esitäytetty kulutus on vain lähtöarvo, jonka voi jakaa väreille haluamallaan
-- tavalla. Kommenttiin kirjataan mistä on kyse ("50/50 vanteet").

-- ---------------------------------------------------------------------------
-- 1. Edellinen yritys pois
-- ---------------------------------------------------------------------------
-- Osalle nimetyt poikkeukset kiinteine lisähintoineen korvautuvat tällä
-- vapaammalla mallilla: hinnan ja kulutuksen säätäminen suoraan työrivillä
-- kattaa samat tapaukset ilman että jokainen yhdistelmä pitää määritellä
-- etukäteen osan sivulla.
drop table if exists public.osan_poikkeukset;

alter table public.tyon_rivit
  drop column if exists poikkeus,
  drop column if exists lisavari;
alter table public.arkistoidut_tyon_rivit
  drop column if exists poikkeus,
  drop column if exists lisavari;

-- ---------------------------------------------------------------------------
-- 2. Kommentti ja custom-merkintä
-- ---------------------------------------------------------------------------
alter table public.tyon_rivit
  add column if not exists kommentti text,
  add column if not exists custom boolean not null default false;
alter table public.arkistoidut_tyon_rivit
  add column if not exists kommentti text,
  add column if not exists custom boolean not null default false;

comment on column public.tyon_rivit.kommentti is
  'Custom-työn selite, esim. "50/50 vanteet" tai "satuloiden logot värillä".';
comment on column public.tyon_rivit.custom is
  'Rivin kulutus ja hinta on säädetty käsin, eivätkä ne seuraa kategorian oletuksia.';

-- ---------------------------------------------------------------------------
-- 3. Rivin lisävärit
-- ---------------------------------------------------------------------------
-- Rivin kolmas, neljäs, ... väri. Kaksi ensimmäistä ovat rivillä itsellään.
create table if not exists public.tyon_rivin_lisavarit (
  id uuid primary key default gen_random_uuid(),
  rivi_id uuid not null references public.tyon_rivit (id) on delete cascade,
  vari_id uuid not null references public.varit (id),
  arvioitu_kulutus_g numeric(10, 2) not null check (arvioitu_kulutus_g > 0),
  toteutunut_kulutus_g numeric(10, 2),
  -- Sama merkitys kuin tyon_rivit.varaus_purettu: kaskadipoistossa emorivi on
  -- jo poissa, joten tieto varauksen purkamisesta on oltava rivillä itsellään.
  varaus_purettu boolean not null default false,
  jarjestys integer not null default 0,
  unique (rivi_id, vari_id)
);

comment on table public.tyon_rivin_lisavarit is
  'Työrivin kolmas ja sitä seuraavat värit custom-työssä. Jokainen varaa ja kuluttaa omat grammansa.';

create index if not exists tyon_rivin_lisavarit_rivi_idx
  on public.tyon_rivin_lisavarit (rivi_id);

alter table public.tyon_rivin_lisavarit enable row level security;

-- Samat oikeudet kuin työriveillä: kirjautunut kokoaa ja muokkaa työtä, mutta
-- rivien poisto kulkee admin-oikeuksien tai security definer -funktioiden
-- kautta, jottei varausta pureta ohi töiden hallinnan.
create policy "Kirjautuneet lukevat rivin lisävärit" on public.tyon_rivin_lisavarit
  for select using (auth.role() = 'authenticated');
create policy "Kirjautuneet lisäävät rivin lisävärejä" on public.tyon_rivin_lisavarit
  for insert with check (auth.role() = 'authenticated');
create policy "Kirjautuneet päivittävät rivin lisävärejä" on public.tyon_rivin_lisavarit
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Admin poistaa rivin lisävärejä" on public.tyon_rivin_lisavarit
  for delete using (public.is_admin());

create table if not exists public.arkistoidut_rivin_lisavarit (
  id uuid primary key,
  rivi_id uuid not null references public.arkistoidut_tyon_rivit (id) on delete cascade,
  vari_id uuid not null references public.varit (id),
  arvioitu_kulutus_g numeric(10, 2) not null,
  toteutunut_kulutus_g numeric(10, 2),
  jarjestys integer not null default 0
);

create index if not exists arkistoidut_rivin_lisavarit_rivi_idx
  on public.arkistoidut_rivin_lisavarit (rivi_id);

alter table public.arkistoidut_rivin_lisavarit enable row level security;

create policy "Kirjautuneet lukevat arkistoidut lisävärit" on public.arkistoidut_rivin_lisavarit
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi arkistoituja lisävärejä" on public.arkistoidut_rivin_lisavarit
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Varaus
-- ---------------------------------------------------------------------------
create or replace function public.rivin_lisavari_varaa_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update varit set varattu_g = varattu_g + new.arvioitu_kulutus_g where id = new.vari_id;
  elsif tg_op = 'DELETE' then
    if old.varaus_purettu then
      return null;
    end if;
    update varit set varattu_g = varattu_g - old.arvioitu_kulutus_g where id = old.vari_id;
  end if;
  return null;
end;
$$;

drop trigger if exists rivin_lisavari_varaa_saldo on public.tyon_rivin_lisavarit;
create trigger rivin_lisavari_varaa_saldo
  after insert or delete on public.tyon_rivin_lisavarit
  for each row execute function public.rivin_lisavari_varaa_saldo();

-- ---------------------------------------------------------------------------
-- 5. Valmistuminen, palautus ja poisto huomioivat lisävärit
-- ---------------------------------------------------------------------------
create or replace function public.tyo_valmistuu_paivita_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rivi record;
begin
  if new.tila = 'valmis' and old.tila is distinct from 'valmis' then
    for rivi in select * from tyon_rivit where tyo_id = new.id loop
      update varit
      set varattu_g = varattu_g - rivi.arvioitu_kulutus_g,
          saldo_g = saldo_g - coalesce(rivi.toteutunut_kulutus_g, rivi.arvioitu_kulutus_g)
      where id = rivi.vari_id;

      if rivi.toinen_vari_id is not null then
        update varit
        set varattu_g = varattu_g - coalesce(rivi.toinen_arvioitu_kulutus_g, 0),
            saldo_g = saldo_g
              - coalesce(rivi.toinen_toteutunut_kulutus_g, rivi.toinen_arvioitu_kulutus_g, 0)
        where id = rivi.toinen_vari_id;
      end if;
    end loop;

    update varit v
    set varattu_g = v.varattu_g - l.arvioitu_kulutus_g,
        saldo_g = v.saldo_g - coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g)
    from tyon_rivin_lisavarit l
    join tyon_rivit r on r.id = l.rivi_id
    where r.tyo_id = new.id and v.id = l.vari_id;

    update tyon_rivit set varaus_purettu = true where tyo_id = new.id;
    update tyon_rivin_lisavarit l set varaus_purettu = true
    from tyon_rivit r where r.id = l.rivi_id and r.tyo_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.palauta_tyo_keskeneraiseksi(p_tyo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tila text;
  rivi record;
begin
  select tila into v_tila from tyot where id = p_tyo_id for update;
  if v_tila is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tila <> 'valmis' then
    raise exception 'Työ on jo keskeneräinen.';
  end if;

  for rivi in select * from tyon_rivit where tyo_id = p_tyo_id loop
    update varit
    set saldo_g = saldo_g + coalesce(rivi.toteutunut_kulutus_g, rivi.arvioitu_kulutus_g),
        varattu_g = varattu_g + rivi.arvioitu_kulutus_g
    where id = rivi.vari_id;

    if rivi.toinen_vari_id is not null then
      update varit
      set saldo_g = saldo_g
            + coalesce(rivi.toinen_toteutunut_kulutus_g, rivi.toinen_arvioitu_kulutus_g, 0),
          varattu_g = varattu_g + coalesce(rivi.toinen_arvioitu_kulutus_g, 0)
      where id = rivi.toinen_vari_id;
    end if;
  end loop;

  update varit v
  set saldo_g = v.saldo_g + coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g),
      varattu_g = v.varattu_g + l.arvioitu_kulutus_g
  from tyon_rivin_lisavarit l
  join tyon_rivit r on r.id = l.rivi_id
  where r.tyo_id = p_tyo_id and v.id = l.vari_id;

  update tyon_rivit set varaus_purettu = false where tyo_id = p_tyo_id;
  update tyon_rivin_lisavarit l set varaus_purettu = false
  from tyon_rivit r where r.id = l.rivi_id and r.tyo_id = p_tyo_id;

  update tyot
  set tila = 'vaiheessa', valmistui_id = null, valmistunut = null
  where id = p_tyo_id;
end;
$$;

create or replace function public.poista_valmis_tyo(p_tyo_id uuid, p_syy text, p_tarkennus text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tyo tyot%rowtype;
  v_tarkennus text := nullif(btrim(p_tarkennus), '');
  rivi record;
begin
  select * into v_tyo from tyot where id = p_tyo_id for update;
  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila <> 'valmis' then
    raise exception 'Tämä toiminto on valmiille työlle. Keskeneräisen työn peruu peru_tyo.';
  end if;
  if p_syy is null or p_syy not in ('asiakas', 'virhe', 'muu') then
    raise exception 'Valitse peruutuksen syy.';
  end if;
  if p_syy = 'muu' and v_tarkennus is null then
    raise exception 'Kirjoita peruutuksen syy.';
  end if;

  for rivi in select * from tyon_rivit where tyo_id = p_tyo_id loop
    update varit
    set saldo_g = saldo_g + coalesce(rivi.toteutunut_kulutus_g, rivi.arvioitu_kulutus_g)
    where id = rivi.vari_id;

    if rivi.toinen_vari_id is not null then
      update varit
      set saldo_g = saldo_g
            + coalesce(rivi.toinen_toteutunut_kulutus_g, rivi.toinen_arvioitu_kulutus_g, 0)
      where id = rivi.toinen_vari_id;
    end if;
  end loop;

  update varit v
  set saldo_g = v.saldo_g + coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g)
  from tyon_rivin_lisavarit l
  join tyon_rivit r on r.id = l.rivi_id
  where r.tyo_id = p_tyo_id and v.id = l.vari_id;

  insert into tyon_peruutukset (tyo_id, asiakas, aloitettu, syy, tarkennus, perui_id)
  values (v_tyo.id, v_tyo.asiakas, v_tyo.aloitettu, p_syy, v_tarkennus, auth.uid());

  delete from tyot where id = p_tyo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Rivien korvaus välittää lisävärit
-- ---------------------------------------------------------------------------
-- Rivit lisätään yksitellen, koska jokaisen lisävärit tarvitsevat juuri luodun
-- rivin id:n. Määrät ovat pieniä (korillinen osia), joten silmukka riittää.
create or replace function public.korvaa_tyon_rivit(p_tyo_id uuid, p_rivit jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tila text;
  v_rivi jsonb;
  v_rivi_id uuid;
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

  for v_rivi in select * from jsonb_array_elements(p_rivit) loop
    insert into tyon_rivit (
      tyo_id, osa_id, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
      toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g, kommentti, custom
    )
    values (
      p_tyo_id,
      (v_rivi->>'osa_id')::uuid,
      (v_rivi->>'vari_id')::uuid,
      coalesce((v_rivi->>'kappalemaara')::integer, 1),
      (v_rivi->>'arvioitu_kulutus_g')::numeric,
      (v_rivi->>'yksikkohinta_eur')::numeric,
      nullif(v_rivi->>'toinen_vari_id', '')::uuid,
      nullif(v_rivi->>'toinen_vari_rooli', ''),
      nullif(v_rivi->>'toinen_arvioitu_kulutus_g', '')::numeric,
      nullif(btrim(coalesce(v_rivi->>'kommentti', '')), ''),
      coalesce((v_rivi->>'custom')::boolean, false)
    )
    returning id into v_rivi_id;

    insert into tyon_rivin_lisavarit (rivi_id, vari_id, arvioitu_kulutus_g, jarjestys)
    select
      v_rivi_id,
      (lisa->>'vari_id')::uuid,
      (lisa->>'arvioitu_kulutus_g')::numeric,
      (lisa_nro - 1)::integer
    from jsonb_array_elements(coalesce(v_rivi->'lisavarit', '[]'::jsonb))
      with ordinality as t(lisa, lisa_nro);
  end loop;
end;
$$;

revoke all on function public.korvaa_tyon_rivit(uuid, jsonb) from public, anon;
grant execute on function public.korvaa_tyon_rivit(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Arkistointi säilyttää lisävärit ja kommentin
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
    toinen_toteutunut_kulutus_g, kommentti, custom
  )
  select
    r.id, r.tyo_id, r.osa_id, r.vari_id, r.kappalemaara, r.arvioitu_kulutus_g,
    r.yksikkohinta_eur, r.toteutunut_kulutus_g, r.toinen_vari_id, r.toinen_vari_rooli,
    r.toinen_arvioitu_kulutus_g, r.toinen_toteutunut_kulutus_g, r.kommentti, r.custom
  from tyon_rivit r
  where r.tyo_id = p_tyo_id;

  insert into arkistoidut_rivin_lisavarit (
    id, rivi_id, vari_id, arvioitu_kulutus_g, toteutunut_kulutus_g, jarjestys
  )
  select l.id, l.rivi_id, l.vari_id, l.arvioitu_kulutus_g, l.toteutunut_kulutus_g, l.jarjestys
  from tyon_rivin_lisavarit l
  join tyon_rivit r on r.id = l.rivi_id
  where r.tyo_id = p_tyo_id;

  delete from tyot where id = p_tyo_id;
end;
$$;

revoke all on function public.arkistoi_tyo(uuid, boolean) from public, anon;
grant execute on function public.arkistoi_tyo(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Raportit ja suosio laskevat lisävärit mukaan
-- ---------------------------------------------------------------------------
-- Lisäväri on yhtä lailla käytettyä maalia kuin pääväri ja pohjaväri, joten se
-- kuuluu sekä kulutusraporttiin että värin käyttökertoihin. Ilman tätä
-- custom-työn kolmas väri katoaisi raporteilta kokonaan.
create or replace view public.varien_suosio as
select
  v.id as vari_id,
  count(r.tyo_id) as kayttokerrat
from varit v
left join (
  select tyo_id, vari_id from tyon_rivit
  union all
  select tyo_id, toinen_vari_id as vari_id from tyon_rivit where toinen_vari_id is not null
  union all
  select tr.tyo_id, l.vari_id
  from tyon_rivin_lisavarit l
  join tyon_rivit tr on tr.id = l.rivi_id
) r on r.vari_id = v.id
group by v.id;

alter view public.varien_suosio set (security_invoker = true);
grant select on public.varien_suosio to authenticated;

create or replace view public.maalinkulutus_raportoituna as
with kaytto as (
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
