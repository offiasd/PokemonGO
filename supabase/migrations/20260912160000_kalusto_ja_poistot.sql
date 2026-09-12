-- =====================================================================
-- Migraatio: kalustorekisteri ja menojäännöspoisto
--
-- Yli 1 200 euron hankinta ei ole pienhankinta vaan kalustoa, joka
-- vähennetään usean vuoden yli menojäännöspoistoina. Ketju on
-- vuosittainen: tämän vuoden loppusaldo on ensi vuoden alkusaldo.
--
-- Lakiperusta:
--   EVL 33 §  pienhankinta enintään 1 200 € (alv 0 %), vuosikatto 3 600 €
--   EVL 30 §  menojäännöspoisto enintään 25 %
--   EVL 54 §  verotuksessa ei voi vähentää enempää kuin kirjanpidossa
--
-- Rajaus: sovellus laskee enimmäismäärän, ei päätä poistoa. Se ei tiedä
-- mitä kirjanpidossa on vähennetty. Kirjanpitäjä päättää todellisen
-- poiston, ja sen voi kirjata käsin - silloin seuraavan vuoden
-- alkusaldo on oikea.
--
-- Korotetut poistot koskivat verovuosia 2020-2025 eivätkä ole voimassa,
-- joten niitä ei ole tässä.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Kalustorekisteri
-- ---------------------------------------------------------------------

create table if not exists public.kalusto (
  id uuid primary key default gen_random_uuid(),
  nimi text not null,
  kuvaus text,
  hankittu date not null,
  -- ALV 0 %, kuten pienhankintojen katossakin. Kuitilla lukeva summa on
  -- brutto, joten siirto kuitin riviltä purkaa veron kannalla.
  hankintameno_eur numeric(12, 2) not null check (hankintameno_eur >= 0),

  kuitti_id uuid references public.kuitit (id) on delete set null,
  -- Rivi on se tunniste jolla pienhankintojen katto tietää ettei tätä
  -- ostosta enää lasketa mukaan. Yksi rivi voi siirtyä vain kerran.
  kuitin_rivi_id uuid references public.kuitin_rivit (id) on delete set null,

  luovutettu date,
  luovutushinta_eur numeric(12, 2) check (luovutushinta_eur >= 0),

  muistiinpano text,
  luotu timestamptz not null default now(),
  luoja_id uuid references public.profiles (id) on delete set null
);

comment on table public.kalusto is
  'Yli 1 200 euron hankinnat, jotka vähennetään menojäännöspoistoina usean vuoden yli. Hankintameno ALV 0 %.';
comment on column public.kalusto.hankintameno_eur is
  'Hankintameno ilman arvonlisäveroa. Kuitin riviltä siirrettäessä brutto jaetaan rivin verokannalla.';
comment on column public.kalusto.kuitin_rivi_id is
  'Kuitin rivi josta hankinta on siirretty. Pienhankintojen katto jättää siirretyn rivin laskematta.';
comment on column public.kalusto.luovutushinta_eur is
  'Luovutushinta ALV 0 %. Vähennetään luovutusvuoden poistopohjasta. Myyntivoittoa ei lasketa erikseen.';

create unique index if not exists kalusto_kuitin_rivi_idx
  on public.kalusto (kuitin_rivi_id) where kuitin_rivi_id is not null;
create index if not exists kalusto_hankittu_idx on public.kalusto (hankittu);
create index if not exists kalusto_luovutettu_idx on public.kalusto (luovutettu)
  where luovutettu is not null;

-- Luovutushinta ilman luovutuspäivää jäisi laskennan ulkopuolelle, koska
-- laskenta kohdistaa sen päivän mukaan vuodelle.
alter table public.kalusto drop constraint if exists kalusto_luovutus_check;
alter table public.kalusto
  add constraint kalusto_luovutus_check
  check (luovutushinta_eur is null or luovutettu is not null);

alter table public.kalusto enable row level security;

drop policy if exists "Admin hallinnoi kalustoa" on public.kalusto;
create policy "Admin hallinnoi kalustoa" on public.kalusto
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.kalusto from anon;


-- ---------------------------------------------------------------------
-- 2. Tilikausikohtainen poistolaskelma
-- ---------------------------------------------------------------------

create table if not exists public.poistolaskelmat (
  id uuid primary key default gen_random_uuid(),
  tilikausi_paattyi date not null unique,

  menojaannos_alussa_eur numeric(12, 2) not null default 0,
  hankinnat_eur          numeric(12, 2) not null default 0,
  luovutushinnat_eur     numeric(12, 2) not null default 0,
  poistopohja_eur        numeric(12, 2) not null default 0,

  poisto_enintaan_eur    numeric(12, 2) not null default 0,
  -- Käsin kirjanpitäjältä. Null = enimmäismäärää käytetään laskennassa.
  poisto_toteutunut_eur  numeric(12, 2),
  kertapoisto boolean not null default false,

  menojaannos_lopussa_eur numeric(12, 2) not null default 0,

  laskettu timestamptz not null default now(),
  muistiinpano text
);

comment on table public.poistolaskelmat is
  'Tilikauden menojäännöspoiston laskelma. Yksi rivi per tilikausi, ketjutettu: loppusaldo on seuraavan vuoden alkusaldo.';
comment on column public.poistolaskelmat.poisto_enintaan_eur is
  'Poiston enimmäismäärä, ei poisto. Sovellus ei tiedä mitä kirjanpidossa on vähennetty (EVL 54 §).';
comment on column public.poistolaskelmat.poisto_toteutunut_eur is
  'Kirjanpitäjän ilmoittama todellinen poisto. Null = laskenta käyttää enimmäismäärää.';
comment on column public.poistolaskelmat.kertapoisto is
  'Poistopohja oli enintään 1 200 €, joten menojäännös saadaan poistaa kerralla.';

alter table public.poistolaskelmat enable row level security;

drop policy if exists "Admin hallinnoi poistolaskelmia" on public.poistolaskelmat;
create policy "Admin hallinnoi poistolaskelmia" on public.poistolaskelmat
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.poistolaskelmat from anon;


-- ---------------------------------------------------------------------
-- 3. Laskenta
--
-- Tilikausi on kalenterivuosi, joten vuoden alku johdetaan päättymis-
-- päivästä. Jos tilikausi joskus poikkeaa kalenterivuodesta, tämä on se
-- kohta joka muuttuu.
--
-- Ketju lasketaan aina ensimmäisestä hankinnasta alkaen eikä vain
-- pyydetyltä vuodelta. Muuten vuoden 2028 laskeminen ennen vuotta 2027
-- antaisi alkusaldoksi nollan, ja koko ketju olisi hiljaisesti väärä
-- ilman että mikään kertoisi siitä.
-- ---------------------------------------------------------------------

create or replace function public.laske_poistolaskelmat(p_tilikausi_paattyi date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ensimmainen int;
  v_viimeinen   int;
  v_vuosi       int;
  v_paattyi     date;
  v_alku        date;
  v_alussa      numeric := 0;
  v_hankinnat   numeric;
  v_luovutukset numeric;
  v_pohja       numeric;
  v_toteutunut  numeric;
  v_enintaan    numeric;
  v_kertapoisto boolean;
  v_lopussa     numeric;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi laskea poistolaskelmia.';
  end if;

  -- Ketjun alku: aikaisin vuosi jolla on hankinta, laskelma tai joka on
  -- pyydetty. Loppu: myöhäisin olemassa oleva laskelma tai pyydetty vuosi,
  -- jotta käsin kirjattu poisto valuu eteenpäin koko ketjuun.
  select least(
           coalesce(min(extract(year from k.hankittu))::int, 2147483647),
           coalesce((select min(extract(year from p.tilikausi_paattyi))::int
                       from public.poistolaskelmat p), 2147483647),
           extract(year from p_tilikausi_paattyi)::int
         )
    into v_ensimmainen
    from public.kalusto k;

  select greatest(
           coalesce((select max(extract(year from p.tilikausi_paattyi))::int
                       from public.poistolaskelmat p), -2147483648),
           extract(year from p_tilikausi_paattyi)::int
         )
    into v_viimeinen;

  for v_vuosi in v_ensimmainen..v_viimeinen loop
    v_paattyi := make_date(v_vuosi, 12, 31);
    v_alku := make_date(v_vuosi, 1, 1);

    select coalesce(sum(k.hankintameno_eur), 0)
      into v_hankinnat
      from public.kalusto k
     where k.hankittu >= v_alku and k.hankittu <= v_paattyi;

    select coalesce(sum(k.luovutushinta_eur), 0)
      into v_luovutukset
      from public.kalusto k
     where k.luovutettu >= v_alku and k.luovutettu <= v_paattyi;

    v_pohja := round(v_alussa + v_hankinnat - v_luovutukset, 2);

    select p.poisto_toteutunut_eur
      into v_toteutunut
      from public.poistolaskelmat p
     where p.tilikausi_paattyi = v_paattyi;

    if v_pohja <= 0 then
      -- Luovutushinnat ylittivät pohjan. Poistoa ei ole, ja miinusmerkkinen
      -- jäännös on veronalaista tuloa - se näytetään, ei piiloteta nollaan.
      v_enintaan := 0;
      v_kertapoisto := false;
    elsif v_pohja <= 1200 then
      -- Pienen jäännöksen kertapoisto: enintään 1 200 € saadaan poistaa
      -- kerralla.
      v_enintaan := v_pohja;
      v_kertapoisto := true;
    else
      v_enintaan := round(v_pohja * 0.25, 2);
      v_kertapoisto := false;
    end if;

    v_lopussa := round(v_pohja - coalesce(v_toteutunut, v_enintaan), 2);

    insert into public.poistolaskelmat as p (
      tilikausi_paattyi, menojaannos_alussa_eur, hankinnat_eur, luovutushinnat_eur,
      poistopohja_eur, poisto_enintaan_eur, kertapoisto, menojaannos_lopussa_eur, laskettu
    )
    values (
      v_paattyi, v_alussa, v_hankinnat, v_luovutukset,
      v_pohja, v_enintaan, v_kertapoisto, v_lopussa, now()
    )
    on conflict (tilikausi_paattyi) do update
      set menojaannos_alussa_eur = excluded.menojaannos_alussa_eur,
          hankinnat_eur = excluded.hankinnat_eur,
          luovutushinnat_eur = excluded.luovutushinnat_eur,
          poistopohja_eur = excluded.poistopohja_eur,
          poisto_enintaan_eur = excluded.poisto_enintaan_eur,
          kertapoisto = excluded.kertapoisto,
          menojaannos_lopussa_eur = excluded.menojaannos_lopussa_eur,
          laskettu = now();

    v_alussa := v_lopussa;
  end loop;
end;
$$;

comment on function public.laske_poistolaskelmat(date) is
  'Laskee poistoketjun ensimmäisestä hankintavuodesta annettuun tilikauteen. Jokainen vuosi säilyttää oman toteutuneen poistonsa, ja muutos valuu ketjussa eteenpäin.';

revoke execute on function public.laske_poistolaskelmat(date) from public, anon;
grant execute on function public.laske_poistolaskelmat(date) to authenticated;


-- Toteutunut poisto kirjataan omalla funktiollaan, jotta ketju lasketaan
-- varmasti uudelleen. Suora update jättäisi seuraavien vuosien alkusaldot
-- vanhoiksi.
create or replace function public.kirjaa_toteutunut_poisto(
  p_tilikausi_paattyi date,
  p_poisto_eur numeric,
  p_muistiinpano text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi kirjata toteutunutta poistoa.';
  end if;

  if p_poisto_eur is not null and p_poisto_eur < 0 then
    raise exception 'Poisto ei voi olla negatiivinen.';
  end if;

  -- Laskelma on oltava olemassa ennen kuin siihen kirjataan.
  perform public.laske_poistolaskelmat(p_tilikausi_paattyi);

  update public.poistolaskelmat
     set poisto_toteutunut_eur = p_poisto_eur,
         muistiinpano = coalesce(nullif(btrim(p_muistiinpano), ''), muistiinpano)
   where tilikausi_paattyi = p_tilikausi_paattyi;

  -- Ketju eteenpäin: tämän vuoden loppusaldo on seuraavan alkusaldo.
  perform public.laske_poistolaskelmat(p_tilikausi_paattyi);
end;
$$;

comment on function public.kirjaa_toteutunut_poisto(date, numeric, text) is
  'Kirjaa kirjanpitäjän ilmoittaman todellisen poiston ja laskee ketjun uudelleen. Null palauttaa enimmäismäärän käyttöön.';

revoke execute on function public.kirjaa_toteutunut_poisto(date, numeric, text) from public, anon;
grant execute on function public.kirjaa_toteutunut_poisto(date, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Siirto kuitin riviltä
--
-- Hankintameno on ALV 0 %, ja rivillä oleva summa on brutto. Vero puretaan
-- rivin omalla verokannalla samalla kaavalla kuin pienhankintojen katossa -
-- tämä on se kohta jossa on helppo erehtyä, koska yritys ei ole
-- ALV-rekisterissä eikä veroa näy missään muualla.
-- ---------------------------------------------------------------------

create or replace function public.siirra_rivi_kalustoon(
  p_rivi_id uuid,
  p_nimi text default null,
  p_hankittu date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r        record;
  v_netto  numeric;
  v_id     uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi siirtää hankintoja kalustoon.';
  end if;

  select kr.id, kr.teksti, kr.brutto_eur, kr.verokanta, kr.kuitti_id,
         k.paivays, k.toimittaja
    into r
    from public.kuitin_rivit kr
    join public.kuitit k on k.id = kr.kuitti_id
   where kr.id = p_rivi_id;

  if not found then
    raise exception 'Kuitin riviä ei löytynyt.';
  end if;

  if exists (select 1 from public.kalusto where kuitin_rivi_id = p_rivi_id) then
    raise exception 'Rivi on jo siirretty kalustoon.';
  end if;

  v_netto := case
    when coalesce(r.verokanta, 0) > 0
      then round(r.brutto_eur / (1 + r.verokanta / 100.0), 2)
    else round(r.brutto_eur, 2)
  end;

  insert into public.kalusto (
    nimi, kuvaus, hankittu, hankintameno_eur, kuitti_id, kuitin_rivi_id, luoja_id
  )
  values (
    coalesce(nullif(btrim(p_nimi), ''), r.teksti),
    case when r.toimittaja is null then null else 'Kuitilta: ' || r.toimittaja end,
    coalesce(p_hankittu, r.paivays),
    v_netto,
    r.kuitti_id,
    r.id,
    auth.uid()
  )
  returning id into v_id;

  perform public.laske_poistolaskelmat(make_date(extract(year from coalesce(p_hankittu, r.paivays))::int, 12, 31));

  return v_id;
end;
$$;

comment on function public.siirra_rivi_kalustoon(uuid, text, date) is
  'Siirtää kuitin rivin kalustorekisteriin. Bruttosummasta puretaan vero rivin verokannalla, koska hankintameno on ALV 0 %.';

revoke execute on function public.siirra_rivi_kalustoon(uuid, text, date) from public, anon;
grant execute on function public.siirra_rivi_kalustoon(uuid, text, date) to authenticated;
