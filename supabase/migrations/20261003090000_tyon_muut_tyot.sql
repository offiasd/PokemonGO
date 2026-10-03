-- =====================================================================
-- Migraatio: työn muut työt
--
-- Maalaamolla tehdään muutakin kuin maalausta: alumiiniosien
-- märkäpuhallusta, pinnavanteiden purkua ja rihtausta. Niillä ei ole
-- osaa, väriä eikä maalinkulutusta - vain kuvaus ja hinta.
--
-- Nämä eivät mene tyon_rivit-tauluun, koska siellä vari_id on pakollinen
-- ja jokainen rivi varaa maalia varastosta. Oma taulu pitää saldologiikan
-- koskemattomana: muu työ ei voi vahingossa varata tai kuluttaa maalia.
--
-- Katalogia ei tarvita. Työ kirjoitetaan kerran sille työlle jolle se
-- kuuluu, eikä se jää mihinkään listaan odottamaan uudelleenkäyttöä.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Taulu ja käytännöt
-- ---------------------------------------------------------------------

create table if not exists public.tyon_muut_tyot (
  id uuid primary key default gen_random_uuid(),
  tyo_id uuid not null references public.tyot(id) on delete cascade,
  kuvaus text not null check (btrim(kuvaus) <> ''),
  hinta_eur numeric(10, 2) not null default 0 check (hinta_eur >= 0),
  jarjestys integer not null default 0
);

comment on table public.tyon_muut_tyot is
  'Työn maalaamattomat työt: kuvaus ja hinta. Ei osaa, väriä eikä maalinkulutusta.';

create index if not exists tyon_muut_tyot_tyo_idx on public.tyon_muut_tyot (tyo_id);

alter table public.tyon_muut_tyot enable row level security;

-- Samat säännöt kuin työn riveillä: kaikki kirjautuneet lukevat, kesken
-- olevaa työtä käsittelee sen tekijä tai admin, ja vain admin poistaa.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tyon_muut_tyot'
      and policyname = 'Kirjautuneet lukevat muut työt'
  ) then
    create policy "Kirjautuneet lukevat muut työt" on public.tyon_muut_tyot
      for select using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tyon_muut_tyot'
      and policyname = 'Tekijä lisää muita töitä'
  ) then
    create policy "Tekijä lisää muita töitä" on public.tyon_muut_tyot
      for insert with check (
        exists (
          select 1 from public.tyot t
          where t.id = tyo_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tyon_muut_tyot'
      and policyname = 'Tekijä päivittää muita töitä'
  ) then
    create policy "Tekijä päivittää muita töitä" on public.tyon_muut_tyot
      for update using (
        exists (
          select 1 from public.tyot t
          where t.id = tyo_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
        )
      ) with check (
        exists (
          select 1 from public.tyot t
          where t.id = tyo_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tyon_muut_tyot'
      and policyname = 'Admin poistaa muita töitä'
  ) then
    create policy "Admin poistaa muita töitä" on public.tyon_muut_tyot
      for delete using (public.is_admin());
  end if;
end $$;

revoke all on public.tyon_muut_tyot from anon;
-- Hinta on asiakkaalle asetettu hinta, ei ostohinta: se kuuluu samaan
-- joukkoon kuin tyon_rivit.yksikkohinta_eur, jonka maalaajakin näkee.
grant select, insert, update, delete on public.tyon_muut_tyot to authenticated;


-- ---------------------------------------------------------------------
-- 2. Arkisto
-- ---------------------------------------------------------------------

create table if not exists public.arkistoidut_muut_tyot (
  id uuid primary key,
  tyo_id uuid not null references public.arkistoidut_tyot(id) on delete cascade,
  kuvaus text not null,
  hinta_eur numeric(10, 2) not null,
  jarjestys integer not null default 0
);

create index if not exists arkistoidut_muut_tyot_tyo_idx on public.arkistoidut_muut_tyot (tyo_id);

alter table public.arkistoidut_muut_tyot enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'arkistoidut_muut_tyot'
      and policyname = 'Kirjautuneet lukevat arkistoidut muut työt'
  ) then
    create policy "Kirjautuneet lukevat arkistoidut muut työt" on public.arkistoidut_muut_tyot
      for select using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'arkistoidut_muut_tyot'
      and policyname = 'Admin hallinnoi arkistoituja muita töitä'
  ) then
    create policy "Admin hallinnoi arkistoituja muita töitä" on public.arkistoidut_muut_tyot
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

revoke all on public.arkistoidut_muut_tyot from anon;
grant select on public.arkistoidut_muut_tyot to authenticated;
