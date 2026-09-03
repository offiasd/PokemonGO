-- Valmiin työn peruminen, palautus keskeneräiseksi ja arkistointi.
--
-- Valmiiksi merkitseminen on helppo tehdä vahingossa liian aikaisin, eikä
-- siitä päässyt takaisin mitenkään. Nyt valmiille työlle on kolme toimintoa:
--
--   palauta keskeneräiseksi - maali palaa varastoon ja takaisin varaukseen
--   poista                  - maali palaa varastoon, työ katoaa (syy lokiin)
--   arkistoi                - tiedot siirtyvät arkistoon, saldoihin ei kosketa
--
-- Lisäksi valmiit työt arkistoituvat itsestään 12 kk kuluttua.

-- ---------------------------------------------------------------------------
-- 1. Varauksen purku merkitään riville
-- ---------------------------------------------------------------------------
-- Rivitriggeri vapauttaa varauksen aina kun rivi poistuu. Valmiissa työssä
-- varaus on jo purettu valmistumisen yhteydessä, joten rivin poisto vähensi
-- varattu_g:tä toiseen kertaan ja saldo saattoi mennä pakkaselle. Vika ei
-- ollut ennen sovelluksen kautta saavutettavissa, mutta arkistointi ja valmiin
-- työn poisto osuisivat siihen suoraan.
--
-- Kaskadipoistossa emorivi on jo poistettu, joten triggeri ei voi katsoa työn
-- tilaa. Siksi tieto tallennetaan riville: valmistuminen merkitsee varauksen
-- puretuksi, palautus keskeneräiseksi ottaa merkinnän pois.
alter table tyon_rivit add column varaus_purettu boolean not null default false;

comment on column tyon_rivit.varaus_purettu is
  'Onko rivin varaus (varit.varattu_g) jo purettu. Valmistuminen merkitsee tämän, jolloin rivin poisto ei pura varausta toiseen kertaan.';

update tyon_rivit r
set varaus_purettu = true
from tyot t
where t.id = r.tyo_id and t.tila = 'valmis';

create or replace function public.tyon_rivi_varaa_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update varit set varattu_g = varattu_g + new.arvioitu_kulutus_g where id = new.vari_id;
    if new.toinen_vari_id is not null then
      update varit set varattu_g = varattu_g + coalesce(new.toinen_arvioitu_kulutus_g, 0)
      where id = new.toinen_vari_id;
    end if;
  elsif tg_op = 'DELETE' then
    -- Valmistuneen työn varaus on jo purettu, joten sitä ei pureta uudelleen.
    if old.varaus_purettu then
      return null;
    end if;
    update varit set varattu_g = varattu_g - old.arvioitu_kulutus_g where id = old.vari_id;
    if old.toinen_vari_id is not null then
      update varit set varattu_g = varattu_g - coalesce(old.toinen_arvioitu_kulutus_g, 0)
      where id = old.toinen_vari_id;
    end if;
  end if;
  return null;
end;
$$;

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

    update tyon_rivit set varaus_purettu = true where tyo_id = new.id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Arkisto
-- ---------------------------------------------------------------------------
-- Arkistoitu työ ei ole enää töiden joukossa eikä sitä voi muokata, mutta
-- tiedot säilyvät sellaisenaan. Sama id kuin alkuperäisellä työllä, jolloin
-- vanhat viittaukset (esim. peruutusloki) osoittavat yhä samaan työhön.
create table arkistoidut_tyot (
  id uuid primary key,
  asiakas text,
  aloitti_id uuid references profiles(id),
  aloitettu timestamptz not null,
  valmistui_id uuid references profiles(id),
  valmistunut timestamptz,
  alennus_prosentti numeric(5, 2) not null default 0,
  arkistoitu timestamptz not null default now(),
  arkistoi_id uuid references profiles(id),
  automaattinen boolean not null default false
);

create table arkistoidut_tyon_rivit (
  id uuid primary key,
  tyo_id uuid not null references arkistoidut_tyot(id) on delete cascade,
  osa_id uuid not null references osat(id),
  vari_id uuid not null references varit(id),
  kappalemaara integer not null,
  arvioitu_kulutus_g numeric(10, 2) not null,
  yksikkohinta_eur numeric(10, 2) not null,
  toteutunut_kulutus_g numeric(10, 2),
  toinen_vari_id uuid references varit(id),
  toinen_vari_rooli text,
  toinen_arvioitu_kulutus_g numeric(10, 2),
  toinen_toteutunut_kulutus_g numeric(10, 2)
);

create index arkistoidut_tyot_valmistunut_idx on arkistoidut_tyot (valmistunut desc);
create index arkistoidut_tyon_rivit_tyo_idx on arkistoidut_tyon_rivit (tyo_id);

comment on table arkistoidut_tyot is
  'Arkistoidut valmiit työt. Arkistointi ei kosketa värisaldoja - maali on kulutettu jo valmistuessa.';

alter table arkistoidut_tyot enable row level security;
alter table arkistoidut_tyon_rivit enable row level security;

create policy "Kirjautuneet lukevat arkistoidut työt" on arkistoidut_tyot
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi arkistoituja töitä" on arkistoidut_tyot
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Kirjautuneet lukevat arkistoidut rivit" on arkistoidut_tyon_rivit
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi arkistoituja rivejä" on arkistoidut_tyon_rivit
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Toiminnot
-- ---------------------------------------------------------------------------

-- Palauttaa valmiin työn keskeneräiseksi ja peruu kulutuksen: maali palaa
-- varastoon ja samalla takaisin varaukseen, koska työ jatkuu.
create function public.palauta_tyo_keskeneraiseksi(p_tyo_id uuid)
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

  update tyon_rivit set varaus_purettu = false where tyo_id = p_tyo_id;
  update tyot
  set tila = 'vaiheessa', valmistui_id = null, valmistunut = null
  where id = p_tyo_id;
end;
$$;

comment on function public.palauta_tyo_keskeneraiseksi(uuid) is
  'Palauttaa valmiin työn keskeneräiseksi ja kumoaa kulutuksen: saldo ja varaus palautuvat valmistumista edeltäneeseen tilaan.';

-- Poistaa valmiin työn ja palauttaa kulutetun maalin varastoon. Varausta ei
-- palauteta, koska työ katoaa kokonaan.
create function public.poista_valmis_tyo(p_tyo_id uuid, p_syy text, p_tarkennus text default null)
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

  insert into tyon_peruutukset (tyo_id, asiakas, aloitettu, syy, tarkennus, perui_id)
  values (v_tyo.id, v_tyo.asiakas, v_tyo.aloitettu, p_syy, v_tarkennus, auth.uid());

  -- Rivit poistuvat kaskadina. Varausta ei pureta uudelleen, koska rivit on
  -- merkitty puretuiksi valmistumisen yhteydessä.
  delete from tyot where id = p_tyo_id;
end;
$$;

comment on function public.poista_valmis_tyo(uuid, text, text) is
  'Poistaa valmiin työn, palauttaa kulutetun maalin varastoon ja kirjaa syyn peruutuslokiin.';

-- Siirtää valmiin työn arkistoon. Saldoihin ei kosketa: maali on jo kulutettu.
create function public.arkistoi_tyo(p_tyo_id uuid, p_automaattinen boolean default false)
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
    id, asiakas, aloitti_id, aloitettu, valmistui_id, valmistunut,
    alennus_prosentti, arkistoi_id, automaattinen
  )
  values (
    v_tyo.id, v_tyo.asiakas, v_tyo.aloitti_id, v_tyo.aloitettu, v_tyo.valmistui_id,
    v_tyo.valmistunut, v_tyo.alennus_prosentti,
    case when p_automaattinen then null else auth.uid() end, p_automaattinen
  );

  insert into arkistoidut_tyon_rivit (
    id, tyo_id, osa_id, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
    toteutunut_kulutus_g, toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g,
    toinen_toteutunut_kulutus_g
  )
  select
    r.id, r.tyo_id, r.osa_id, r.vari_id, r.kappalemaara, r.arvioitu_kulutus_g,
    r.yksikkohinta_eur, r.toteutunut_kulutus_g, r.toinen_vari_id, r.toinen_vari_rooli,
    r.toinen_arvioitu_kulutus_g, r.toinen_toteutunut_kulutus_g
  from tyon_rivit r
  where r.tyo_id = p_tyo_id;

  delete from tyot where id = p_tyo_id;
end;
$$;

comment on function public.arkistoi_tyo(uuid, boolean) is
  'Siirtää valmiin työn ja sen rivit arkistotauluihin ja poistaa sen töistä. Ei muuta värisaldoja.';

-- Arkistoi kaikki yli 12 kk sitten valmistuneet työt. Ajetaan pg_cronilla.
create function public.arkistoi_vanhat_tyot(p_ika interval default interval '12 months')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_maara integer := 0;
begin
  for v_id in
    select id from tyot
    where tila = 'valmis' and coalesce(valmistunut, aloitettu) < now() - p_ika
    order by valmistunut
  loop
    perform arkistoi_tyo(v_id, true);
    v_maara := v_maara + 1;
  end loop;
  return v_maara;
end;
$$;

comment on function public.arkistoi_vanhat_tyot(interval) is
  'Arkistoi valmiit työt, joiden valmistumisesta on kulunut annettu aika (oletus 12 kk). Ajastettu pg_cronilla.';

revoke all on function public.palauta_tyo_keskeneraiseksi(uuid) from public;
revoke all on function public.poista_valmis_tyo(uuid, text, text) from public;
revoke all on function public.arkistoi_tyo(uuid, boolean) from public;
revoke all on function public.arkistoi_vanhat_tyot(interval) from public;
grant execute on function public.palauta_tyo_keskeneraiseksi(uuid) to authenticated;
grant execute on function public.poista_valmis_tyo(uuid, text, text) to authenticated;
grant execute on function public.arkistoi_tyo(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Raportti ottaa arkiston mukaan
-- ---------------------------------------------------------------------------
-- Arkistointi ei saa kadottaa kulutushistoriaa raportilta.
create or replace view maalinkulutus_raportoituna as
with kaytto as (
  select
    tr.id::text || ':paavari' as id,
    coalesce(t.valmistunut, t.aloitettu) as luotu,
    tr.osa_id, tr.vari_id, tr.kappalemaara,
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
    tr.osa_id, tr.toinen_vari_id, tr.kappalemaara,
    coalesce(tr.toinen_toteutunut_kulutus_g, tr.toinen_arvioitu_kulutus_g, 0),
    coalesce(tr.toinen_vari_rooli, 'toinen'),
    t.valmistui_id
  from tyon_rivit tr
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis' and tr.toinen_vari_id is not null

  union all
  select
    ar.id::text || ':paavari',
    coalesce(at.valmistunut, at.aloitettu),
    ar.osa_id, ar.vari_id, ar.kappalemaara,
    coalesce(ar.toteutunut_kulutus_g, ar.arvioitu_kulutus_g),
    'paavari',
    at.valmistui_id
  from arkistoidut_tyon_rivit ar
  join arkistoidut_tyot at on at.id = ar.tyo_id

  union all
  select
    ar.id::text || ':toinen',
    coalesce(at.valmistunut, at.aloitettu),
    ar.osa_id, ar.toinen_vari_id, ar.kappalemaara,
    coalesce(ar.toinen_toteutunut_kulutus_g, ar.toinen_arvioitu_kulutus_g, 0),
    coalesce(ar.toinen_vari_rooli, 'toinen'),
    at.valmistui_id
  from arkistoidut_tyon_rivit ar
  join arkistoidut_tyot at on at.id = ar.tyo_id
  where ar.toinen_vari_id is not null

  union all
  select
    m.id::text || ':paavari', m.luotu, m.osa_id, m.vari_id, m.kappalemaara,
    m.toteutunut_kulutus_g, 'paavari', m.kayttaja_id
  from maalaustapahtumat m

  union all
  select
    m.id::text || ':toinen', m.luotu, m.osa_id, m.toinen_vari_id, m.kappalemaara,
    coalesce(m.toinen_toteutunut_kulutus_g, 0), coalesce(m.toinen_vari_rooli, 'toinen'),
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

alter view maalinkulutus_raportoituna set (security_invoker = true);
grant select on maalinkulutus_raportoituna to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Automaattinen arkistointi
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'arkistoi-vanhat-tyot',
  '30 3 * * *',
  $cron$select public.arkistoi_vanhat_tyot()$cron$
);
