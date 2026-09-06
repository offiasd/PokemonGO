-- Kuitit ja kulut.
--
-- Kuitti on kirjanpidon tosite: se kuvataan kassalla, luokitellaan sovelluksessa
-- ja luovutetaan kuukausittain kirjanpitäjälle. Alkuperäinen tiedosto säilyy
-- muuttumattomana Storagessa, ja kaikki luokittelu elää kannassa sen rinnalla.
--
-- Rakenne on jaettu kolmeen tasoon:
--   kuitit        yksi ostotapahtuma, toimittaja ja loppusumma
--   kuitin_rivit  ostoksen rivit, kukin omalla käyttötarkoituksellaan
--   kululuokat    käyttäjän oma seuranta, erillään verokohtelusta
--
-- Käyttötarkoitus vastaa kysymykseen "mihin ostos meni", ei siihen mikä on sen
-- verokohtelu. Kirjanpitäjä ratkaisee kohtelun, jolloin sovellus pysyy oikeassa
-- vaikka verosäännöt muuttuvat.

-- ---------------------------------------------------------------------------
-- 1. Yrityksen asetukset
-- ---------------------------------------------------------------------------
alter table public.asetukset
  add column if not exists yritysmuoto text not null default 'toiminimi',
  add column if not exists tyontekijoita boolean not null default false,
  add column if not exists alv_rekisterissa boolean not null default false;

alter table public.asetukset
  drop constraint if exists asetukset_yritysmuoto_check;
alter table public.asetukset
  add constraint asetukset_yritysmuoto_check check (yritysmuoto in ('toiminimi', 'oy'));

comment on column public.asetukset.yritysmuoto is
  'Yritysmuoto. Ohjaa käytettävissä olevia kuittirivin käyttötarkoituksia.';
comment on column public.asetukset.tyontekijoita is
  'Onko yrityksellä työntekijöitä. Vasta silloin henkilökunnan tarjoilu on mahdollinen käyttötarkoitus.';
comment on column public.asetukset.alv_rekisterissa is
  'Onko yritys arvonlisäverorekisterissä. Vaikuttaa vain siihen näytetäänkö ALV-tiedot - tiedot tallennetaan joka tapauksessa.';

-- ---------------------------------------------------------------------------
-- 2. Kululuokat
-- ---------------------------------------------------------------------------
-- Käyttäjän omaa seurantaa varten, muokattavissa asetuksissa. Polttoainetta ei
-- ole listalla tarkoituksella: ajoneuvo on yksityisvarallisuutta, joten
-- polttoainekuitit ovat yksityisottoja.
create table if not exists public.kululuokat (
  id uuid primary key default gen_random_uuid(),
  nimi text not null,
  jarjestys integer not null default 0,
  aktiivinen boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists kululuokat_nimi_uniikki on public.kululuokat (lower(nimi));

insert into public.kululuokat (nimi, jarjestys)
select nimi, jarjestys
from (values
  ('Maalit ja lakat', 10),
  ('Puhallusaine ja hiomatarvikkeet', 20),
  ('Kemikaalit ja pesuaineet', 30),
  ('Pakkaus ja lähetys', 40),
  ('Työkalut ja laitteet', 50),
  ('Suojaimet ja työvaatteet', 60),
  ('Energia ja kaasu', 70),
  ('Toimisto ja ohjelmistot', 80),
  ('Muut', 90)
) as v(nimi, jarjestys)
where not exists (select 1 from public.kululuokat);

-- ---------------------------------------------------------------------------
-- 3. Kuitit
-- ---------------------------------------------------------------------------
create table if not exists public.kuitit (
  id uuid primary key default gen_random_uuid(),
  toimittaja text,
  paivays date not null,
  -- Maksupäivä vain jos eri kuin laskupäivä; muuten null.
  maksupaiva date,
  loppusumma_eur numeric(12, 2) not null default 0,
  lahde text not null default 'kamera',
  -- Storage-polku, ei julkinen osoite: kuitit ovat yksityisiä ja luetaan
  -- allekirjoitetulla linkillä.
  tiedosto_polku text,
  tiedosto_tyyppi text,
  tila text not null default 'luonnos',
  muistiinpano text,
  -- Poiminnan lukema ALV-erittely kannoittain. Tallennetaan vaikka yritys ei
  -- olisi ALV-rekisterissä: täsmäytys nojaa siihen, ja rekisteröitymisen
  -- tullessa ajankohtaiseksi historia on valmiina.
  alv_erittely jsonb,
  -- Kirjanpitolaki 2:10 §: tosite on säilytettävä vähintään 6 vuotta sen
  -- kalenterivuoden lopusta, jonka aikana tilikausi päättyi.
  -- Vuoden alusta vuosi eteenpäin miinus päivä = saman vuoden 31.12., ja siitä
  -- kuusi vuotta eteenpäin. Tilikausi on kalenterivuosi.
  sailytettava_asti date generated always as (
    (date_trunc('year', paivays::timestamp)
      + interval '1 year' - interval '1 day' + interval '6 years')::date
  ) stored,
  luoja_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kuitit drop constraint if exists kuitit_lahde_check;
alter table public.kuitit
  add constraint kuitit_lahde_check check (lahde in ('kamera', 'tiedosto', 'sahkoposti'));

alter table public.kuitit drop constraint if exists kuitit_tila_check;
alter table public.kuitit
  add constraint kuitit_tila_check check (tila in ('luonnos', 'tarkistettava', 'valmis'));

comment on column public.kuitit.sailytettava_asti is
  'Kirjanpitolain 2:10 §:n mukainen säilytysajan päättymispäivä: tilikauden päättymisvuoden 31.12. + 6 vuotta.';

create index if not exists kuitit_paivays_idx on public.kuitit (paivays desc);
-- Kaksoiskappaleiden etsintä: sama ostos voi tulla sekä PDF:nä että kuvattuna.
create index if not exists kuitit_kaksoiskappale_idx
  on public.kuitit (paivays, loppusumma_eur, lower(coalesce(toimittaja, '')));

-- ---------------------------------------------------------------------------
-- 4. Kuitin rivit
-- ---------------------------------------------------------------------------
create table if not exists public.kuitin_rivit (
  id uuid primary key default gen_random_uuid(),
  kuitti_id uuid not null references public.kuitit (id) on delete cascade,
  -- Rivin teksti sellaisenaan. Nimet ovat lyhenteitä ja katkaistuja, mutta
  -- juuri sellaisena ne tunnistetaan ja niistä opitaan.
  teksti text not null,
  maara numeric(12, 3),
  brutto_eur numeric(12, 2) not null default 0,
  -- Verokanta luetaan kuitista, ei päätellä tuoteryhmästä: kannat ovat
  -- muuttuneet kolmesti kahdessa vuodessa, ja kuitissa lukee ostohetken oikea
  -- kanta.
  verokanta numeric(5, 2),
  kayttotarkoitus text,
  kululuokka_id uuid references public.kululuokat (id) on delete set null,
  muistiinpano text,
  jarjestys integer not null default 0
);

alter table public.kuitin_rivit drop constraint if exists kuitin_rivit_kayttotarkoitus_check;
alter table public.kuitin_rivit
  add constraint kuitin_rivit_kayttotarkoitus_check check (
    kayttotarkoitus is null
    or kayttotarkoitus in ('yrityksen_tarvike', 'edustus', 'yksityisotto', 'henkilokunnan_tarjoilu')
  );

create index if not exists kuitin_rivit_kuitti_idx on public.kuitin_rivit (kuitti_id, jarjestys);

-- ---------------------------------------------------------------------------
-- 5. Oppiminen
-- ---------------------------------------------------------------------------
-- Kun sama tuoteteksti on kerran luokiteltu, se esitäytetään seuraavalla
-- kerralla. Ehdotus, ei automaatti - käyttäjä vahvistaa aina.
create table if not exists public.kuittirivin_oppi (
  teksti text primary key,
  kayttotarkoitus text not null,
  kululuokka_id uuid references public.kululuokat (id) on delete set null,
  paivitetty timestamptz not null default now()
);

comment on table public.kuittirivin_oppi is
  'Muistetut luokittelut rivin tekstin perusteella. Avain on normalisoitu teksti (pienet kirjaimet, ylimääräiset välit pois).';

-- ---------------------------------------------------------------------------
-- 6. Säilytysajan suoja
-- ---------------------------------------------------------------------------
-- Poisto estetään myös kantatasolla, ei pelkässä käyttöliittymässä: tosite on
-- säilytettävä lain mukaan, eikä sitä saa hävittää vahingossakaan.
create or replace function public.esta_kuitin_poisto()
returns trigger
language plpgsql
as $$
begin
  if current_date <= old.sailytettava_asti then
    raise exception
      'Kuittia ei voi poistaa ennen %: kirjanpitolaki vaatii tositteen säilyttämisen.',
      to_char(old.sailytettava_asti, 'DD.MM.YYYY');
  end if;
  return old;
end;
$$;

drop trigger if exists kuitit_sailytysaika on public.kuitit;
create trigger kuitit_sailytysaika
  before delete on public.kuitit
  for each row execute function public.esta_kuitin_poisto();

-- ---------------------------------------------------------------------------
-- 7. Kuukausikooste
-- ---------------------------------------------------------------------------
-- Kulut kuukausittain etusivun korttia ja Kulut-välilehteä varten.
--
-- Kaksi lukua: kuluina se mikä on yrityksen kulua, ja yhteensä kuitin koko
-- summa. Ero on yksityisottoja ja luokittelemattomia rivejä. Kirjanpidon
-- kannalta merkitsevä on ensimmäinen, mutta toista tarvitaan täsmäytykseen.
create or replace view public.kulut_kuukausittain as
select
  date_trunc('month', k.paivays::timestamp)::date as kuukausi,
  sum(r.brutto_eur) filter (
    where r.kayttotarkoitus in ('yrityksen_tarvike', 'edustus', 'henkilokunnan_tarjoilu')
  ) as kuluina_eur,
  sum(r.brutto_eur) as yhteensa_eur,
  count(distinct k.id) as kuitteja,
  count(*) filter (where r.kayttotarkoitus is null) as luokittelemattomia
from public.kuitit k
join public.kuitin_rivit r on r.kuitti_id = k.id
group by 1;

alter view public.kulut_kuukausittain set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 8. Käyttöoikeudet
-- ---------------------------------------------------------------------------
-- Kuitit ovat yrityksen taloustietoa, joten ne ovat adminin näkymässä samoin
-- kuin hinnoittelu ja katteet.
alter table public.kululuokat enable row level security;
alter table public.kuitit enable row level security;
alter table public.kuitin_rivit enable row level security;
alter table public.kuittirivin_oppi enable row level security;

drop policy if exists "Kirjautuneet lukevat kululuokat" on public.kululuokat;
create policy "Kirjautuneet lukevat kululuokat" on public.kululuokat
  for select using (auth.role() = 'authenticated');
drop policy if exists "Admin hallinnoi kululuokkia" on public.kululuokat;
create policy "Admin hallinnoi kululuokkia" on public.kululuokat
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin hallinnoi kuitteja" on public.kuitit;
create policy "Admin hallinnoi kuitteja" on public.kuitit
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin hallinnoi kuitin rivejä" on public.kuitin_rivit;
create policy "Admin hallinnoi kuitin rivejä" on public.kuitin_rivit
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin hallinnoi oppimista" on public.kuittirivin_oppi;
create policy "Admin hallinnoi oppimista" on public.kuittirivin_oppi
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.kululuokat to authenticated;
grant select, insert, update, delete on public.kuitit to authenticated;
grant select, insert, update, delete on public.kuitin_rivit to authenticated;
grant select, insert, update, delete on public.kuittirivin_oppi to authenticated;
grant insert, update, delete on public.kululuokat to authenticated;
grant select on public.kulut_kuukausittain to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Tiedostojen säilytys
-- ---------------------------------------------------------------------------
-- Yksityinen ämpäri: kuitit sisältävät ostotietoja eivätkä kuulu julkiseen
-- osoitteeseen kuten värikuvat. Ne luetaan allekirjoitetulla linkillä.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kuitit',
  'kuitit',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin lukee kuittitiedostot" on storage.objects;
create policy "Admin lukee kuittitiedostot" on storage.objects
  for select using (bucket_id = 'kuitit' and public.is_admin());

drop policy if exists "Admin tallentaa kuittitiedostot" on storage.objects;
create policy "Admin tallentaa kuittitiedostot" on storage.objects
  for insert with check (bucket_id = 'kuitit' and public.is_admin());

drop policy if exists "Admin poistaa kuittitiedostot" on storage.objects;
create policy "Admin poistaa kuittitiedostot" on storage.objects
  for delete using (bucket_id = 'kuitit' and public.is_admin());
