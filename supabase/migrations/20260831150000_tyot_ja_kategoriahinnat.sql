-- "Kirjaa maalaus" -sivun korvaava Työt-järjestelmä + osan kategoriahinnoittelu.
--
-- Työnkulku: työntekijä kokoaa "korin" (osa + väri(t) + kpl) ja aloittaa työn ->
-- rivit luodaan kerralla, maali VARATAAN varastosta (varattu_g, ei vielä oikeaa
-- kulutusta) -> työ merkitään valmiiksi -> varaus vapautuu ja maali kuluu
-- oikeasti (saldo_g vähenee). Vanha maalaustapahtumat-taulu ja sen data
-- säilytetään koskemattomana historiana, uusi järjestelmä ei kirjoita siihen.
--
-- Hinnoittelu: admin asettaa osalle kiinteän asiakashinnan per maalityyppi-
-- kategoria (solid/metallic/candy/illusion) - ei tarvitse hinnoitella jokaista
-- väriä erikseen. Yksittäiselle värille voi asettaa hintalisä-%:n (esim.
-- poikkeuksellisen kallis candy-sävy), joka kertautuu kategoriahintaan
-- automaattisesti kaikissa osissa. Solid-väreille voi lisätä valinnaisen
-- lakkauksen (kirkas topcoat) kiinteällä lisähinnalla per osa.

alter table varit
  add column hintalisa_prosentti numeric(5, 2) not null default 0,
  add column varattu_g numeric(12, 2) not null default 0;

comment on column varit.hintalisa_prosentti is 'Asiakashinnan lisä-% kun tätä väriä käytetään (esim. poikkeuksellisen kallis sävy). Kerrotaan osan kategoriahintaan.';
comment on column varit.varattu_g is 'Keskeneräisiin töihin varattu määrä - ei vielä oikeasti kulutettu. Käytettävissä = saldo_g - varattu_g.';

alter table osat
  add column lakkaus_lisahinta numeric(10, 2);

comment on column osat.lakkaus_lisahinta is 'Valinnaisen lakkauksen (kirkas topcoat solid-värin päälle) lisähinta asiakkaalle tälle osalle.';

-- =========================================================================
-- Osan kategoriahinnat
-- =========================================================================

create table osa_kategoriahinnat (
  id uuid primary key default gen_random_uuid(),
  osa_id uuid not null references osat(id) on delete cascade,
  maali_tyyppi text not null check (maali_tyyppi in ('solid', 'metallic', 'candy', 'illusion')),
  hinta numeric(10, 2) not null check (hinta >= 0),
  unique (osa_id, maali_tyyppi)
);

comment on table osa_kategoriahinnat is 'Osan asiakashinta maalityyppikategoriaa kohden (esim. Solid 120e, Candy 200e). Puuttuva rivi = kategoriaa ei myydä tälle osalle.';

create index osa_kategoriahinnat_osa_idx on osa_kategoriahinnat (osa_id);

alter table osa_kategoriahinnat enable row level security;

create policy "Kirjautuneet lukevat kategoriahinnat" on osa_kategoriahinnat
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi kategoriahintoja" on osa_kategoriahinnat
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- Työt ja työn rivit
-- =========================================================================

create table tyot (
  id uuid primary key default gen_random_uuid(),
  asiakas text,
  tila text not null default 'vaiheessa' check (tila in ('vaiheessa', 'valmis')),
  aloitti_id uuid references profiles(id),
  aloitettu timestamptz not null default now(),
  valmistui_id uuid references profiles(id),
  valmistunut timestamptz
);

comment on table tyot is 'Työt (asiakastyöt): kattaa yhden tai useamman osan + värit. Vaiheessa = maali varattu varastosta; valmis = maali kulutettu oikeasti.';

create index tyot_tila_idx on tyot (tila);

create table tyon_rivit (
  id uuid primary key default gen_random_uuid(),
  tyo_id uuid not null references tyot(id) on delete cascade,
  osa_id uuid not null references osat(id),
  vari_id uuid not null references varit(id),
  toinen_vari_id uuid references varit(id),
  toinen_vari_rooli text check (toinen_vari_rooli in ('pohjavari', 'lakka')),
  kappalemaara integer not null default 1 check (kappalemaara > 0),
  arvioitu_kulutus_g numeric(12, 2) not null,
  toinen_arvioitu_kulutus_g numeric(12, 2),
  toteutunut_kulutus_g numeric(12, 2),
  toinen_toteutunut_kulutus_g numeric(12, 2),
  yksikkohinta_eur numeric(10, 2) not null check (yksikkohinta_eur >= 0),
  constraint tyon_rivit_toinen_vari_yhdenmukaisuus check (
    (toinen_vari_id is null) = (toinen_vari_rooli is null)
  )
);

comment on table tyon_rivit is 'Työn rivit: yksi osa + väri(t) + kappalemäärä + hinta yhdessä työssä. yksikkohinta_eur on hinta per kappale työn lisäyshetkellä (snapshot).';

create index tyon_rivit_tyo_idx on tyon_rivit (tyo_id);
create index tyon_rivit_vari_idx on tyon_rivit (vari_id);
create index tyon_rivit_toinen_vari_idx on tyon_rivit (toinen_vari_id);

alter table tyot enable row level security;
alter table tyon_rivit enable row level security;

create policy "Kirjautuneet lukevat työt" on tyot
  for select using (auth.role() = 'authenticated');
create policy "Kirjautuneet aloittavat töitä" on tyot
  for insert with check (auth.role() = 'authenticated' and aloitti_id = auth.uid());
create policy "Kirjautuneet päivittävät töitä" on tyot
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Admin poistaa töitä" on tyot
  for delete using (public.is_admin());

create policy "Kirjautuneet lukevat työn rivit" on tyon_rivit
  for select using (auth.role() = 'authenticated');
create policy "Kirjautuneet lisäävät työn rivejä" on tyon_rivit
  for insert with check (auth.role() = 'authenticated');
create policy "Kirjautuneet päivittävät työn rivejä" on tyon_rivit
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Admin poistaa työn rivejä" on tyon_rivit
  for delete using (public.is_admin());

-- Varaa maali (varattu_g) kun työn rivi lisätään; vapauta jos rivi poistetaan
-- (esim. admin peruu keskeneräisen työn, jolloin rivit poistuvat kaskadina).
create function public.tyon_rivi_varaa_saldo()
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
    update varit set varattu_g = varattu_g - old.arvioitu_kulutus_g where id = old.vari_id;
    if old.toinen_vari_id is not null then
      update varit set varattu_g = varattu_g - coalesce(old.toinen_arvioitu_kulutus_g, 0)
      where id = old.toinen_vari_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger tyon_rivi_varaa_saldo_trg
  after insert or delete on tyon_rivit
  for each row execute function public.tyon_rivi_varaa_saldo();

-- Kun työ merkitään valmiiksi: vapauta varaus ja kuluta oikeasti (toteutunut,
-- tai arvioitu jos toteutunutta ei erikseen syötetty) jokaiselle työn riville.
create function public.tyo_valmistuu_paivita_saldo()
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
  end if;
  return new;
end;
$$;

create trigger tyo_valmistuu_saldo_trg
  after update on tyot
  for each row execute function public.tyo_valmistuu_paivita_saldo();

-- Hälytysnäkymä huomioi jatkossa varatun määrän - varattu maali ei ole
-- oikeasti käytettävissä uusiin töihin.
create or replace view varit_halytykset as
select
  v.*,
  public.vari_halytysraja(v.id) as efektiivinen_halytysraja_g
from varit v
where v.aktiivinen
  and (v.saldo_g - v.varattu_g) <= public.vari_halytysraja(v.id);

alter view varit_halytykset set (security_invoker = true);

-- "Kuukauden käytetyin väri": lasketaan sekä vanhasta maalaustapahtumat-
-- historiasta että uusista valmistuneista töistä, jotta dashboard pysyy oikeana.
create or replace function public.kuukauden_kaytetyin_vari(p_kuukausi date default date_trunc('month', now())::date)
returns table (
  vari_id uuid,
  vari_nimi text,
  yhteensa_g numeric,
  yhteensa_kg numeric,
  tapahtumia bigint
)
language sql
stable
as $$
  select
    yhd.vari_id,
    v.nimi,
    sum(yhd.maara_g) as yhteensa_g,
    sum(yhd.maara_g) / 1000.0 as yhteensa_kg,
    count(*) as tapahtumia
  from (
    select vari_id, toteutunut_kulutus_g as maara_g, luotu from maalaustapahtumat
    union all
    select toinen_vari_id, toinen_toteutunut_kulutus_g, luotu
    from maalaustapahtumat
    where toinen_vari_id is not null
    union all
    select tr.vari_id, coalesce(tr.toteutunut_kulutus_g, tr.arvioitu_kulutus_g), t.valmistunut
    from tyon_rivit tr
    join tyot t on t.id = tr.tyo_id
    where t.tila = 'valmis'
    union all
    select tr.toinen_vari_id, coalesce(tr.toinen_toteutunut_kulutus_g, tr.toinen_arvioitu_kulutus_g), t.valmistunut
    from tyon_rivit tr
    join tyot t on t.id = tr.tyo_id
    where t.tila = 'valmis' and tr.toinen_vari_id is not null
  ) yhd
  join varit v on v.id = yhd.vari_id
  where date_trunc('month', yhd.luotu) = date_trunc('month', p_kuukausi::timestamptz)
  group by yhd.vari_id, v.nimi
  order by yhteensa_g desc
  limit 1;
$$;
