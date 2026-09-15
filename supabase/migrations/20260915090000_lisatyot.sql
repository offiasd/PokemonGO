-- =====================================================================
-- Migraatio: lisätyöt omana rakenteenaan
--
-- Monivärisyys, tekstit ja logot tehtiin tähän asti custom-työnä käsin
-- syötetyllä hinnalla. Lisätyön kustannus ei kuitenkaan synny maalista vaan
-- teippauksesta ja toisesta maalauksesta - se on aikaa, ja aika on jo
-- mallinnettuna tuntiveloitukset-taulussa.
--
-- Hinta lasketaan siis ajoista eikä kiinteistä summista: kun tuntiveloitus
-- nousee, kaikki lisätyöt seuraavat perässä ilman yhtäkään käsin tehtyä
-- muutosta.
--
-- Katalogi kertoo mitä, osa kertoo paljonko. Osan arvo on null kun se
-- periytyy katalogista. Ilman periytymistä 34 osaa neljällä lisätyöllä
-- olisi 136 riviä ylläpidettävää, ja hinnan korotus vaatisi 34 muutosta.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tuntiveloituksen haku omaksi funktiokseen
--
-- Sama haku oli osa_tyokustannus-funktion sisällä. Lisätyön hinta tarvitsee
-- täsmälleen saman säännön - vaiheen oma hinta, muuten yleinen tuntihinta -
-- joten se nostetaan omaksi funktiokseen eikä kirjoiteta toiseen kertaan.
-- ---------------------------------------------------------------------

create or replace function public.vaiheen_tuntiveloitus(p_vaihe text)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select t.tuntihinta from tuntiveloitukset t where t.vaihe = p_vaihe),
    (select yleinen_tuntihinta from asetukset limit 1),
    0
  );
$$;

comment on function public.vaiheen_tuntiveloitus(text) is
  'Työvaiheen tuntiveloitus: vaiheen oma hinta, muuten asetusten yleinen tuntihinta.';

revoke execute on function public.vaiheen_tuntiveloitus(text) from anon;
grant execute on function public.vaiheen_tuntiveloitus(text) to authenticated;

-- Osan työkustannus käyttää nyt samaa hakua.
create or replace function public.osa_tyokustannus(p_osa_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_admin() then
    coalesce(sum(
      (ot.arvioitu_kesto_min / 60.0) * public.vaiheen_tuntiveloitus(ot.vaihe)
    ), 0)
  end
  from osa_tyovaiheet ot
  where ot.osa_id = p_osa_id and ot.tarvitaan;
$$;

comment on function public.osa_tyokustannus(uuid) is
  'Osan työkustannus tuntiveloituksista. NULL muille kuin adminille.';


-- ---------------------------------------------------------------------
-- 2. Katalogi
--
-- Vain kaksi aikakenttää. Pesu, maalinpoisto ja puhallus tehdään osalle
-- kerran riippumatta väreistä - ne ovat osan työvaiheita, eivät lisätyön.
-- ---------------------------------------------------------------------

create table if not exists public.lisatyot (
  id uuid primary key default gen_random_uuid(),
  nimi text not null,
  ryhma text,
  teippaus_min integer not null default 0 check (teippaus_min >= 0),
  maalaus_min integer not null default 0 check (maalaus_min >= 0),
  lisakulutus_g numeric(10, 2) not null default 0 check (lisakulutus_g >= 0),
  -- Jaettu pinta käyttäytyy eri tavalla: ei kappalemäärää, ja kulutus
  -- jakautuu osan kokonaiskulutuksesta sen sijaan että lisäytyisi päälle.
  on_jako boolean not null default false,
  aktiivinen boolean not null default true,
  jarjestys integer not null default 0
);

comment on table public.lisatyot is
  'Lisätöiden katalogi. Oletusajat periytyvät osille, jotka voivat poiketa niistä.';
comment on column public.lisatyot.on_jako is
  'Jaettu pinta: kulutus jakautuu osan kokonaiskulutuksesta eikä lisäydy päälle, eikä kappalemäärää ole.';
comment on column public.lisatyot.lisakulutus_g is
  'Lisätyön oma maalinkulutus. Jaoissa merkityksetön - niissä kulutus tulee osuutena.';

create index if not exists lisatyot_jarjestys_idx on public.lisatyot (jarjestys, nimi);

alter table public.lisatyot enable row level security;

-- Hinnoittelutietoa: luku kaikille kirjautuneille, muokkaus adminille.
-- Maalaaja tarvitsee nimen ja ajat nähdäkseen mitä työhön kuuluu.
drop policy if exists "Lisätyöt näkyvät kirjautuneille" on public.lisatyot;
create policy "Lisätyöt näkyvät kirjautuneille" on public.lisatyot
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admin hallinnoi lisätöitä" on public.lisatyot;
create policy "Admin hallinnoi lisätöitä" on public.lisatyot
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.lisatyot from anon;


-- ---------------------------------------------------------------------
-- 3. Osan lisätyöt
--
-- Rivin olemassaolo = lisätyö on mahdollinen tälle osalle. Null-arvo =
-- peritään katalogista.
-- ---------------------------------------------------------------------

create table if not exists public.osa_lisatyot (
  id uuid primary key default gen_random_uuid(),
  osa_id uuid not null references public.osat (id) on delete cascade,
  lisatyo_id uuid not null references public.lisatyot (id) on delete cascade,
  teippaus_min integer check (teippaus_min >= 0),
  maalaus_min integer check (maalaus_min >= 0),
  lisakulutus_g numeric(10, 2) check (lisakulutus_g >= 0),
  unique (osa_id, lisatyo_id)
);

comment on table public.osa_lisatyot is
  'Mitkä lisätyöt ovat mahdollisia osalle. Null-arvo periytyy katalogista.';

create index if not exists osa_lisatyot_osa_idx on public.osa_lisatyot (osa_id);
create index if not exists osa_lisatyot_lisatyo_idx on public.osa_lisatyot (lisatyo_id);

alter table public.osa_lisatyot enable row level security;

drop policy if exists "Osan lisätyöt näkyvät kirjautuneille" on public.osa_lisatyot;
create policy "Osan lisätyöt näkyvät kirjautuneille" on public.osa_lisatyot
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admin hallinnoi osan lisätöitä" on public.osa_lisatyot;
create policy "Admin hallinnoi osan lisätöitä" on public.osa_lisatyot
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.osa_lisatyot from anon;


-- ---------------------------------------------------------------------
-- 4. Työn rivin lisätyöt
--
-- Ajat, kulutus ja hinta lukitaan riville kuten tyon_rivit-taulussa: hinnan
-- muuttuminen myöhemmin ei saa kirjoittaa tehtyä työtä uusiksi.
-- ---------------------------------------------------------------------

create table if not exists public.tyon_rivin_lisatyot (
  id uuid primary key default gen_random_uuid(),
  tyon_rivi_id uuid not null references public.tyon_rivit (id) on delete cascade,
  lisatyo_id uuid references public.lisatyot (id) on delete set null,
  vari_id uuid references public.varit (id),
  maara integer not null default 1 check (maara >= 1),
  -- Vain jaoille. Perusvärin osuus on jäännös eikä sitä säädetä suoraan.
  osuus_prosentti numeric(5, 2) check (osuus_prosentti > 0 and osuus_prosentti <= 100),

  -- Lukitaan kulutushetkellä.
  teippaus_min integer,
  maalaus_min integer,
  kulutus_g numeric(10, 2),
  hinta_eur numeric(10, 2),
  vari_hinta_per_kg numeric(12, 4),
  maalikustannus_eur numeric(12, 2),
  hinta_lukittu_at timestamptz,

  -- Sovelluksen lisäämä pohjaväri tai lakka merkitään, jotta käyttäjä
  -- erottaa mitä hän valitsi ja mitä sovellus päätteli.
  automaattinen text,
  -- Sama kuin työn riveillä: valmistuminen purkaa varauksen ja merkitsee
  -- sen tähän, jottei rivin poisto jälkikäteen purkaisi sitä toiseen kertaan.
  varaus_purettu boolean not null default false,
  jarjestys integer not null default 0
);

comment on table public.tyon_rivin_lisatyot is
  'Työn rivin lisätyöt. Ajat, kulutus ja hinta ovat kopioita kulutushetkeltä, eivät viittauksia.';
comment on column public.tyon_rivin_lisatyot.osuus_prosentti is
  'Jaetun pinnan osuus. Perusvärin osuus on 100 miinus muiden summa, laskettuna jäännöksenä.';
comment on column public.tyon_rivin_lisatyot.automaattinen is
  'pohjavari tai lakka kun sovellus lisäsi rivin itse. Null = käyttäjän valitsema lisätyö.';
comment on column public.tyon_rivin_lisatyot.hinta_eur is
  'Lisätyön asiakashinta ajoista laskettuna. Asiakashinta näkyy myös maalaajalle.';

alter table public.tyon_rivin_lisatyot drop constraint if exists tyon_rivin_lisatyot_automaattinen_check;
alter table public.tyon_rivin_lisatyot
  add constraint tyon_rivin_lisatyot_automaattinen_check
  check (automaattinen is null or automaattinen in ('pohjavari', 'lakka'));

create index if not exists tyon_rivin_lisatyot_rivi_idx on public.tyon_rivin_lisatyot (tyon_rivi_id);

alter table public.tyon_rivin_lisatyot enable row level security;

-- Sama rajaus kuin tyon_rivin_lisavarit-taulussa: oikeus seuraa työn riviä.
drop policy if exists "Lisätyöt seuraavat työn riviä" on public.tyon_rivin_lisatyot;
create policy "Lisätyöt seuraavat työn riviä" on public.tyon_rivin_lisatyot
  for all
  using (
    exists (
      select 1 from public.tyon_rivit r join public.tyot t on t.id = r.tyo_id
      where r.id = tyon_rivin_lisatyot.tyon_rivi_id
        and (public.is_admin() or auth.role() = 'authenticated')
    )
  )
  with check (
    exists (
      select 1 from public.tyon_rivit r join public.tyot t on t.id = r.tyo_id
      where r.id = tyon_rivin_lisatyot.tyon_rivi_id
        and (public.is_admin() or auth.role() = 'authenticated')
    )
  );

revoke all on public.tyon_rivin_lisatyot from anon;

-- Kustannuskentät ovat taloustietoa: maalaaja saa kirjoittaa rivin mutta ei
-- lukea maalin hintaa. Asiakashinta hinta_eur näkyy, kuten yksikkohinta_eur
-- työn rivillä. RLS toimii riveillä, ei sarakkeilla - siksi sarakeoikeudet.
revoke all on public.tyon_rivin_lisatyot from authenticated;
grant select (
  id, tyon_rivi_id, lisatyo_id, vari_id, maara, osuus_prosentti,
  teippaus_min, maalaus_min, kulutus_g, hinta_eur, automaattinen, jarjestys
) on public.tyon_rivin_lisatyot to authenticated;
grant insert, update, delete, references on public.tyon_rivin_lisatyot to authenticated;


-- ---------------------------------------------------------------------
-- 5. Lisätyön hinta ajoista
-- ---------------------------------------------------------------------

create or replace function public.lisatyon_hinta(p_teippaus_min integer, p_maalaus_min integer)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select round(
    coalesce(p_teippaus_min, 0) / 60.0 * public.vaiheen_tuntiveloitus('teippaus')
    + coalesce(p_maalaus_min, 0) / 60.0 * public.vaiheen_tuntiveloitus('maalaus'),
    2
  );
$$;

comment on function public.lisatyon_hinta(integer, integer) is
  'Lisätyön asiakashinta teippaus- ja maalausajasta. Ei kiinteitä summia - tuntiveloituksen korotus näkyy heti kaikissa lisätöissä.';

revoke execute on function public.lisatyon_hinta(integer, integer) from anon;
grant execute on function public.lisatyon_hinta(integer, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 6. Osan lisätyöt voimassa olevine arvoineen
--
-- Yksi funktio kahdelle kutsujalle: osan sivu näyttää kaikki katalogin
-- lisätyöt rasteineen, työn sivu suodattaa valitut. Näin periytymissääntö
-- on yhdessä paikassa.
-- ---------------------------------------------------------------------

create or replace function public.osan_lisatyot(p_osa_id uuid)
returns table (
  lisatyo_id uuid,
  nimi text,
  ryhma text,
  on_jako boolean,
  jarjestys integer,
  valittu boolean,
  teippaus_min integer,
  maalaus_min integer,
  lisakulutus_g numeric,
  teippaus_oma boolean,
  maalaus_oma boolean,
  lisakulutus_oma boolean,
  hinta_eur numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.id,
    l.nimi,
    l.ryhma,
    l.on_jako,
    l.jarjestys,
    ol.id is not null,
    coalesce(ol.teippaus_min, l.teippaus_min),
    coalesce(ol.maalaus_min, l.maalaus_min),
    coalesce(ol.lisakulutus_g, l.lisakulutus_g),
    ol.teippaus_min is not null,
    ol.maalaus_min is not null,
    ol.lisakulutus_g is not null,
    public.lisatyon_hinta(
      coalesce(ol.teippaus_min, l.teippaus_min),
      coalesce(ol.maalaus_min, l.maalaus_min)
    )
  from public.lisatyot l
  left join public.osa_lisatyot ol on ol.lisatyo_id = l.id and ol.osa_id = p_osa_id
  where l.aktiivinen
  order by l.jarjestys, l.nimi;
$$;

comment on function public.osan_lisatyot(uuid) is
  'Osan lisätyöt voimassa olevine arvoineen. valittu kertoo onko lisätyö mahdollinen osalle, *_oma kertoo onko arvo osan oma vai katalogista peritty.';

revoke execute on function public.osan_lisatyot(uuid) from anon;
grant execute on function public.osan_lisatyot(uuid) to authenticated;


-- Katalogin hallintanäkymä tarvitsee käyttömäärän: kahdeksalla osalla
-- käytössä olevaa lisätyötä ei kannata poistaa vaan merkitä pois käytöstä,
-- jolloin vanhat työt säilyttävät hintansa.
create or replace function public.lisatyoluettelo()
returns table (
  id uuid,
  nimi text,
  ryhma text,
  teippaus_min integer,
  maalaus_min integer,
  lisakulutus_g numeric,
  on_jako boolean,
  aktiivinen boolean,
  jarjestys integer,
  hinta_eur numeric,
  osia integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.id, l.nimi, l.ryhma, l.teippaus_min, l.maalaus_min, l.lisakulutus_g,
    l.on_jako, l.aktiivinen, l.jarjestys,
    public.lisatyon_hinta(l.teippaus_min, l.maalaus_min),
    (select count(*)::integer from public.osa_lisatyot ol where ol.lisatyo_id = l.id)
  from public.lisatyot l
  order by l.jarjestys, l.nimi;
$$;

comment on function public.lisatyoluettelo() is
  'Katalogi hintoineen ja käyttömäärineen. Käyttömäärä on turvaverkko poistolle.';

revoke execute on function public.lisatyoluettelo() from anon;
grant execute on function public.lisatyoluettelo() to authenticated;


-- ---------------------------------------------------------------------
-- 7. Saldovaraus ja hinnan lukitus
--
-- Molemmat ovat tyon_rivin_lisavarit-taulun triggerien kaksoiskappaleita:
-- lisätyön kulutus varaa saldoa kuten muukin työn kulutus, ja maalin hinta
-- lukitaan kulutushetkeen vari_kokonaishinta_rajaamaton-funktiolla.
-- ---------------------------------------------------------------------

create or replace function public.rivin_lisatyo_varaa_saldo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.vari_id is not null then
      update varit set varattu_g = varattu_g + coalesce(new.kulutus_g, 0) where id = new.vari_id;
    end if;
  elsif tg_op = 'DELETE' then
    -- Valmistuminen on jo purkanut varauksen ja vähentänyt saldon.
    if old.varaus_purettu then
      return null;
    end if;
    if old.vari_id is not null then
      update varit set varattu_g = varattu_g - coalesce(old.kulutus_g, 0) where id = old.vari_id;
    end if;
  end if;
  return null;
end;
$$;

comment on function public.rivin_lisatyo_varaa_saldo() is
  'Lisätyön kulutus varaa saldoa kuten muukin työn kulutus, myös automaattinen pohjaväri ja lakka.';

create or replace function public.rivin_lisatyo_lukitse_maalikustannus()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.vari_id is null then
    new.vari_hinta_per_kg := null;
    new.maalikustannus_eur := null;
    return new;
  end if;

  if new.hinta_lukittu_at is null then
    new.vari_hinta_per_kg := null;
    new.maalikustannus_eur := null;
    return new;
  end if;

  if new.vari_hinta_per_kg is null then
    new.vari_hinta_per_kg := public.vari_kokonaishinta_rajaamaton(new.vari_id);
  end if;

  new.maalikustannus_eur := round(
    coalesce(new.kulutus_g, 0) / 1000.0 * coalesce(new.vari_hinta_per_kg, 0), 2
  );
  return new;
end;
$$;

drop trigger if exists rivin_lisatyo_lukitse_trg on public.tyon_rivin_lisatyot;
create trigger rivin_lisatyo_lukitse_trg
  before insert or update on public.tyon_rivin_lisatyot
  for each row execute function public.rivin_lisatyo_lukitse_maalikustannus();

drop trigger if exists rivin_lisatyo_saldo_trg on public.tyon_rivin_lisatyot;
create trigger rivin_lisatyo_saldo_trg
  after insert or delete on public.tyon_rivin_lisatyot
  for each row execute function public.rivin_lisatyo_varaa_saldo();

revoke execute on function public.rivin_lisatyo_varaa_saldo() from public, anon, authenticated;
revoke execute on function public.rivin_lisatyo_lukitse_maalikustannus() from public, anon, authenticated;


-- Valmistuminen purkaa varauksen ja vähentää saldon myös lisätöiltä.
-- Lisätyöllä ei ole erillistä toteutunutta kulutusta: kulutus_g on se määrä
-- joka varattiin ja joka kuluu.
create or replace function public.tyo_valmistuu_paivita_saldo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

    update varit v
    set varattu_g = v.varattu_g - coalesce(lt.kulutus_g, 0),
        saldo_g = v.saldo_g - coalesce(lt.kulutus_g, 0)
    from tyon_rivin_lisatyot lt
    join tyon_rivit r on r.id = lt.tyon_rivi_id
    where r.tyo_id = new.id and v.id = lt.vari_id;

    update tyon_rivit set varaus_purettu = true where tyo_id = new.id;
    update tyon_rivin_lisavarit l set varaus_purettu = true
    from tyon_rivit r where r.id = l.rivi_id and r.tyo_id = new.id;
    update tyon_rivin_lisatyot lt set varaus_purettu = true
    from tyon_rivit r where r.id = lt.tyon_rivi_id and r.tyo_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.tyo_valmistuu_paivita_saldo() from public, anon, authenticated;


-- Palautus keskeneräiseksi palauttaa myös lisätöiden varaukset ja saldon.
-- Tämä on valmistumisen peilikuva: jos vain toinen suunta tuntee lisätyöt,
-- saldo ajautuu pysyvästi väärään suuntaan jokaisella palautuksella.
create or replace function public.palauta_tyo_keskeneraiseksi(p_tyo_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tila text;
  rivi record;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi palauttaa valmiin työn keskeneräiseksi.';
  end if;

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

  update varit v
  set saldo_g = v.saldo_g + coalesce(lt.kulutus_g, 0),
      varattu_g = v.varattu_g + coalesce(lt.kulutus_g, 0)
  from tyon_rivin_lisatyot lt
  join tyon_rivit r on r.id = lt.tyon_rivi_id
  where r.tyo_id = p_tyo_id and v.id = lt.vari_id;

  update tyon_rivit set varaus_purettu = false where tyo_id = p_tyo_id;
  update tyon_rivin_lisavarit l set varaus_purettu = false
  from tyon_rivit r where r.id = l.rivi_id and r.tyo_id = p_tyo_id;
  update tyon_rivin_lisatyot lt set varaus_purettu = false
  from tyon_rivit r where r.id = lt.tyon_rivi_id and r.tyo_id = p_tyo_id;

  update tyot
  set tila = 'vaiheessa', valmistui_id = null, valmistunut = null
  where id = p_tyo_id;
end;
$$;

revoke execute on function public.palauta_tyo_keskeneraiseksi(uuid) from anon;
grant execute on function public.palauta_tyo_keskeneraiseksi(uuid) to authenticated;


-- Työn valmistuminen lukitsee myös lisätyörivit.
create or replace function public.tyo_valmistuu_lukitse_hinnat()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.tila = 'valmis' and old.tila is distinct from 'valmis' then
    -- Rivien omat triggerit hakevat hinnat ja laskevat kustannuksen; tässä
    -- riittää merkitä hetki. Jo lukittuihin riveihin ei kosketa.
    update tyon_rivit
    set hinta_lukittu_at = now()
    where tyo_id = new.id and hinta_lukittu_at is null;

    update tyon_rivin_lisavarit l
    set hinta_lukittu_at = now()
    from tyon_rivit r
    where r.id = l.rivi_id and r.tyo_id = new.id and l.hinta_lukittu_at is null;

    update tyon_rivin_lisatyot lt
    set hinta_lukittu_at = now()
    from tyon_rivit r
    where r.id = lt.tyon_rivi_id and r.tyo_id = new.id and lt.hinta_lukittu_at is null;
  end if;
  return null;
end;
$$;

revoke execute on function public.tyo_valmistuu_lukitse_hinnat() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. Katalogin aloitussisältö
--
-- Ilman yhtäkään riviä ominaisuus on näkymätön. Nämä ovat lähtöarvoja
-- joita admin muokkaa tai merkitsee pois käytöstä - ei totuuksia.
-- Hinnat 90 euron tuntiveloituksella: kapea teksti 45, laaja 90, logo 60,
-- jaettu pinta 75 euroa.
-- ---------------------------------------------------------------------

insert into public.lisatyot (nimi, ryhma, teippaus_min, maalaus_min, lisakulutus_g, on_jako, jarjestys)
select * from (values
  ('Kapea teksti', 'Tekstit', 20, 10, 3.0, false, 10),
  ('Laaja teksti', 'Tekstit', 45, 15, 6.0, false, 20),
  ('Logo',         'Kuviot',  30, 10, 3.0, false, 30),
  ('Jaettu pinta', 'Värijaot', 30, 20, 0.0, true, 40)
) as t(nimi, ryhma, teippaus_min, maalaus_min, lisakulutus_g, on_jako, jarjestys)
where not exists (select 1 from public.lisatyot);


-- ---------------------------------------------------------------------
-- 9. Työn rivien tallennus kirjoittaa lisätyöt
--
-- Ajat, kulutus ja hinta tulevat kutsusta kopioina eivätkä viittauksina:
-- katalogin muutos ei saa kirjoittaa jo kirjattua työtä uusiksi. Frontend
-- lukee arvot osan_lisatyot-funktiosta, joka on sama lähde kuin osan sivulla.
-- ---------------------------------------------------------------------

create or replace function public.korvaa_tyon_rivit(p_tyo_id uuid, p_rivit jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tyo tyot%rowtype;
  v_rivi jsonb;
  v_rivi_id uuid;
begin
  select * into v_tyo from tyot where id = p_tyo_id for update;

  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila = 'valmis' then
    raise exception 'Valmiin työn rivejä ei voi muokata.';
  end if;
  if not (public.is_admin() or (v_tyo.tila = 'vaiheessa' and v_tyo.aloitti_id = auth.uid())) then
    raise exception 'Työ on toisen tekijän hallussa.';
  end if;
  if p_rivit is null or jsonb_array_length(p_rivit) = 0 then
    raise exception 'Työssä pitää olla vähintään yksi osa.';
  end if;

  delete from tyon_rivit where tyo_id = p_tyo_id;

  for v_rivi in select * from jsonb_array_elements(p_rivit) loop
    insert into tyon_rivit (
      tyo_id, osa_id, oma_kuvaus, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
      toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g, kommentti, custom
    )
    values (
      p_tyo_id,
      nullif(v_rivi->>'osa_id', '')::uuid,
      nullif(btrim(coalesce(v_rivi->>'oma_kuvaus', '')), ''),
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

    insert into tyon_rivin_lisatyot (
      tyon_rivi_id, lisatyo_id, vari_id, maara, osuus_prosentti,
      teippaus_min, maalaus_min, kulutus_g, hinta_eur, automaattinen, jarjestys
    )
    select
      v_rivi_id,
      nullif(lt->>'lisatyo_id', '')::uuid,
      nullif(lt->>'vari_id', '')::uuid,
      coalesce((lt->>'maara')::integer, 1),
      nullif(lt->>'osuus_prosentti', '')::numeric,
      nullif(lt->>'teippaus_min', '')::integer,
      nullif(lt->>'maalaus_min', '')::integer,
      nullif(lt->>'kulutus_g', '')::numeric,
      nullif(lt->>'hinta_eur', '')::numeric,
      nullif(lt->>'automaattinen', ''),
      (lt_nro - 1)::integer
    from jsonb_array_elements(coalesce(v_rivi->'lisatyot', '[]'::jsonb))
      with ordinality as t(lt, lt_nro);
  end loop;
end;
$$;

comment on function public.korvaa_tyon_rivit(uuid, jsonb) is
  'Korvaa työn rivit lisäväreineen ja lisätöineen. Lisätöiden ajat, kulutus ja hinta tallentuvat kopioina kulutushetkeltä.';

revoke execute on function public.korvaa_tyon_rivit(uuid, jsonb) from anon;
grant execute on function public.korvaa_tyon_rivit(uuid, jsonb) to authenticated;
