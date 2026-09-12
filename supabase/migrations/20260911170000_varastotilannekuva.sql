-- =====================================================================
-- Migraatio: varaston tilannekuva tilikauden päättyessä
--
-- Tausta:
--   Saldon voisi periaatteessa laskea tapahtumahistoriasta taaksepäin,
--   mutta se vaatisi että jokainen kulutus ja täydennys on kirjattu
--   aukottomasti koko vuodelta. Yksikin käsin tehty korjaus rikkoo
--   laskennan.
--
--   Hintaa ei saisi historiasta millään: ostohinta_per_kg on liukuva
--   keskihinta, joka elää jokaisen täydennyksen mukana eikä kerro mikä
--   se oli joulukuussa.
--
-- Ratkaisu:
--   Muutaman rivin taulu, johon luvut kopioidaan sellaisina kuin ne ovat
--   tilikauden päättyessä. Kopio, ei viittaus: väri voidaan myöhemmin
--   nimetä uudelleen, poistaa tai sen hinta muuttuu, eikä tilannekuva
--   saa muuttua sen mukana.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Taulut
-- ---------------------------------------------------------------------

create table if not exists public.varastotilannekuvat (
  id uuid primary key default gen_random_uuid(),
  tilikausi_paattyi date not null,
  otettu timestamptz not null default now(),
  ottaja_id uuid references public.profiles (id) on delete set null,
  yhteensa_eur numeric(12, 2),
  vareja integer,
  muistiinpano text,
  unique (tilikausi_paattyi)
);

comment on table public.varastotilannekuvat is
  'Varaston arvo tilikauden päättyessä. Yksi tilannekuva per tilikausi; uudelleenotto korvaa vanhan.';
comment on column public.varastotilannekuvat.yhteensa_eur is
  'Rivien arvojen summa. Nollasaldoiset värit ovat riveissä mukana mutta eivät kasvata tätä.';
comment on column public.varastotilannekuvat.vareja is
  'Kopioitujen värien määrä, myös nollasaldoiset.';

create table if not exists public.varastotilannekuvan_rivit (
  id uuid primary key default gen_random_uuid(),
  tilannekuva_id uuid not null
    references public.varastotilannekuvat (id) on delete cascade,
  -- Viite jää kulkuyhteydeksi värin sivulle, mutta raportti ei nojaa siihen:
  -- poistettu väri jättäisi rivin ilman nimeä.
  vari_id uuid references public.varit (id) on delete set null,
  vari_nimi    text not null,
  valmistaja   text,
  saldo_g      numeric(12, 2) not null,
  hinta_per_kg numeric(12, 4) not null,
  arvo_eur     numeric(12, 2) not null
);

comment on table public.varastotilannekuvan_rivit is
  'Tilannekuvan rivit. Nimi, saldo ja hinta ovat kopioita: tilannekuva ei muutu vaikka väri muuttuisi.';

create index if not exists varastotilannekuvan_rivit_kuva_idx
  on public.varastotilannekuvan_rivit (tilannekuva_id);

alter table public.varastotilannekuvat enable row level security;
alter table public.varastotilannekuvan_rivit enable row level security;

drop policy if exists "Admin hallinnoi tilannekuvia" on public.varastotilannekuvat;
create policy "Admin hallinnoi tilannekuvia" on public.varastotilannekuvat
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin hallinnoi tilannekuvan rivejä" on public.varastotilannekuvan_rivit;
create policy "Admin hallinnoi tilannekuvan rivejä" on public.varastotilannekuvan_rivit
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.varastotilannekuvat from anon;
revoke all on public.varastotilannekuvan_rivit from anon;


-- ---------------------------------------------------------------------
-- 2. Tilannekuvan ottaminen
--
-- Ei ajastusta. Ajastettu tehtävä voisi osua hetkeen jolloin joulukuun
-- viimeiset työt ovat vielä kirjaamatta, ja väärä tilannekuva on pahempi
-- kuin puuttuva - se näyttää oikealta. Admin painaa nappia silloin kun
-- tietää kirjausten olevan ajan tasalla.
-- ---------------------------------------------------------------------

create or replace function public.ota_varastotilannekuva(
  p_tilikausi_paattyi date,
  p_muistiinpano text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi ottaa varastotilannekuvan.';
  end if;

  -- Uudelleenotto korvaa vanhan. Puuttuva kirjaus huomataan usein vasta
  -- tilannekuvan jälkeen, joten korjaaminen on oltava mahdollista - rivit
  -- lähtevät cascadella, eikä samalta tilikaudelta jää kahta kuvaa.
  delete from public.varastotilannekuvat where tilikausi_paattyi = p_tilikausi_paattyi;

  insert into public.varastotilannekuvat (tilikausi_paattyi, ottaja_id, muistiinpano)
  values (p_tilikausi_paattyi, auth.uid(), nullif(btrim(coalesce(p_muistiinpano, '')), ''))
  returning id into v_id;

  -- Hinta luetaan rajaamattomasta funktiosta: vari_kokonaishinta palauttaa
  -- NULLin muille kuin adminille, ja tämä funktio ajetaan omistajan
  -- oikeuksin. Roolitarkistus on jo tehty yllä. Funktio hoitaa myös eron
  -- erähinnoiteltujen ja prosenttikaavalla laskettavien värien välillä.
  insert into public.varastotilannekuvan_rivit (
    tilannekuva_id, vari_id, vari_nimi, valmistaja, saldo_g, hinta_per_kg, arvo_eur
  )
  select
    v_id,
    v.id,
    v.nimi,
    v.valmistaja,
    v.saldo_g,
    coalesce(public.vari_kokonaishinta_rajaamaton(v.id), 0),
    round(v.saldo_g / 1000.0 * coalesce(public.vari_kokonaishinta_rajaamaton(v.id), 0), 2)
  from public.varit v
  where v.aktiivinen
  order by v.nimi;

  update public.varastotilannekuvat s
     set yhteensa_eur = coalesce(
           (select sum(r.arvo_eur) from public.varastotilannekuvan_rivit r
             where r.tilannekuva_id = v_id), 0),
         vareja = (select count(*) from public.varastotilannekuvan_rivit r
                    where r.tilannekuva_id = v_id)
   where s.id = v_id;

  return v_id;
end;
$$;

comment on function public.ota_varastotilannekuva(date, text) is
  'Kopioi aktiivisten värien saldot ja kilohinnat tilikauden tilannekuvaksi. Uudelleenotto korvaa saman tilikauden vanhan kuvan.';

revoke execute on function public.ota_varastotilannekuva(date, text) from public, anon;
grant execute on function public.ota_varastotilannekuva(date, text) to authenticated;
