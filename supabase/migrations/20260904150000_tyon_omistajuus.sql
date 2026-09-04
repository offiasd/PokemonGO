-- Työ on yhden tekijän hallussa, ja vain admin kirjaa töitä.
--
-- Vastaanotetun työn nappaaminen oli jo kilpailuturvallinen: aloita_vastaanotettu_tyo
-- lukitsee rivin (for update) ja tarkistaa tilan uudelleen, joten kahdesta
-- yhtäaikaisesta yrityksestä vain ensimmäinen onnistuu.
--
-- Kesken oleva työ oli silti kenen tahansa: rivitason käytäntö salli päivityksen
-- kaikille kirjautuneille, joten toinen maalaaja saattoi merkitä toisen työn
-- valmiiksi, muokata sen rivejä tai perua sen. Testissä juuri niin kävikin.
--
-- Työnkulku on nyt:
--
--   admin      kirjaa työn vastaanotetuksi ja hallinnoi sitä
--   maalaaja   nappaa vastaanotetun työn itselleen ja tekee sen valmiiksi
--
-- Napattu työ kuuluu aloittajalleen: vain hän tai admin voi muokata, perua tai
-- merkitä sen valmiiksi. Valmis työ on jälleen adminin hallussa.

-- ---------------------------------------------------------------------------
-- 1. Kuka saa käsitellä työtä
-- ---------------------------------------------------------------------------
-- Puhdas funktio työn kentistä, jotta samaa sääntöä voi käyttää sekä rivitason
-- käytännöissä että security definer -funktioissa ilman kehäviittausta.
create or replace function public.saa_kasitella_tyon(p_tila text, p_aloitti_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_admin() or (p_tila = 'vaiheessa' and p_aloitti_id = auth.uid());
$$;

comment on function public.saa_kasitella_tyon(text, uuid) is
  'Saako kutsuja käsitellä työtä: admin aina, maalaaja vain oman kesken olevan työnsä.';

-- Millaiseksi työn saa jättää. Erillinen säännöstä yllä, koska valmistuminen
-- vaihtaa tilan pois vaiheessa-tilasta - muuten oman työn saisi aloittaa mutta
-- ei koskaan lopettaa.
create or replace function public.saa_jattaa_tyon(p_aloitti_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_admin() or p_aloitti_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 2. Töiden käytännöt
-- ---------------------------------------------------------------------------
-- Työn kirjaaminen on adminin tehtävä: maalaaja ei vastaanota töitä vaan ottaa
-- valmiiksi kirjatun työn itselleen.
drop policy if exists "Kirjautuneet kirjaavat töitä" on public.tyot;
drop policy if exists "Kirjautuneet aloittavat töitä" on public.tyot;

create policy "Admin kirjaa töitä" on public.tyot
  for insert with check (public.is_admin());

drop policy if exists "Kirjautuneet päivittävät töitä" on public.tyot;

create policy "Tekijä päivittää työtä" on public.tyot
  for update
  using (public.saa_kasitella_tyon(tila, aloitti_id))
  with check (public.saa_jattaa_tyon(aloitti_id));

-- ---------------------------------------------------------------------------
-- 3. Työn rivit seuraavat työn omistajuutta
-- ---------------------------------------------------------------------------
drop policy if exists "Kirjautuneet lisäävät työn rivejä" on public.tyon_rivit;
drop policy if exists "Kirjautuneet päivittävät työn rivejä" on public.tyon_rivit;

create policy "Tekijä lisää työn rivejä" on public.tyon_rivit
  for insert with check (
    exists (
      select 1 from public.tyot t
      where t.id = tyo_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
    )
  );

create policy "Tekijä päivittää työn rivejä" on public.tyon_rivit
  for update
  using (
    exists (
      select 1 from public.tyot t
      where t.id = tyo_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
    )
  )
  with check (
    exists (
      select 1 from public.tyot t
      where t.id = tyo_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
    )
  );

drop policy if exists "Kirjautuneet lisäävät rivin lisävärejä" on public.tyon_rivin_lisavarit;
drop policy if exists "Kirjautuneet päivittävät rivin lisävärejä" on public.tyon_rivin_lisavarit;

create policy "Tekijä lisää rivin lisävärejä" on public.tyon_rivin_lisavarit
  for insert with check (
    exists (
      select 1 from public.tyon_rivit r
      join public.tyot t on t.id = r.tyo_id
      where r.id = rivi_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
    )
  );

create policy "Tekijä päivittää rivin lisävärejä" on public.tyon_rivin_lisavarit
  for update
  using (
    exists (
      select 1 from public.tyon_rivit r
      join public.tyot t on t.id = r.tyo_id
      where r.id = rivi_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
    )
  )
  with check (
    exists (
      select 1 from public.tyon_rivit r
      join public.tyot t on t.id = r.tyo_id
      where r.id = rivi_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Security definer -funktiot tarkistavat omistajuuden itse
-- ---------------------------------------------------------------------------
-- Nämä ohittavat rivitason käytännöt, joten sääntö on toistettava niissä.
create or replace function public.korvaa_tyon_rivit(p_tyo_id uuid, p_rivit jsonb)
returns void
language plpgsql
security definer
set search_path = public
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

-- Perumisen saa tehdä työn tekijä tai admin. Aiemmin kuka tahansa kirjautunut
-- saattoi perua toisen kesken olevan työn.
create or replace function public.peru_tyo(p_tyo_id uuid, p_syy text, p_tarkennus text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tyo tyot%rowtype;
  v_tarkennus text := nullif(btrim(p_tarkennus), '');
begin
  -- for update lukitsee työn, jottei kaksi yhtäaikaista perumista kirjaisi
  -- kahta lokiriviä samasta työstä.
  select * into v_tyo from tyot where id = p_tyo_id for update;

  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila = 'valmis' then
    raise exception 'Valmista työtä ei voi perua.';
  end if;
  if not (public.is_admin() or (v_tyo.tila = 'vaiheessa' and v_tyo.aloitti_id = auth.uid())) then
    raise exception 'Työ on toisen tekijän hallussa.';
  end if;
  if p_syy is null or p_syy not in ('asiakas', 'virhe', 'muu') then
    raise exception 'Valitse peruutuksen syy.';
  end if;
  if p_syy = 'muu' and v_tarkennus is null then
    raise exception 'Kirjoita peruutuksen syy.';
  end if;

  insert into tyon_peruutukset (tyo_id, asiakas, aloitettu, syy, tarkennus, perui_id)
  values (v_tyo.id, v_tyo.asiakas, v_tyo.aloitettu, p_syy, v_tarkennus, auth.uid());

  -- Rivit poistuvat kaskadina ja rivitriggeri vapauttaa varaukset varastoon.
  delete from tyot where id = p_tyo_id;
end;
$$;

revoke all on function public.peru_tyo(uuid, text, text) from public, anon;
grant execute on function public.peru_tyo(uuid, text, text) to authenticated;

-- Valmiin työn palautus keskeneräiseksi purkaa kulutuksen varastosta, joten se
-- kuuluu adminille.
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

  update tyon_rivit set varaus_purettu = false where tyo_id = p_tyo_id;
  update tyon_rivin_lisavarit l set varaus_purettu = false
  from tyon_rivit r where r.id = l.rivi_id and r.tyo_id = p_tyo_id;

  update tyot
  set tila = 'vaiheessa', valmistui_id = null, valmistunut = null
  where id = p_tyo_id;
end;
$$;

revoke all on function public.palauta_tyo_keskeneraiseksi(uuid) from public, anon;
grant execute on function public.palauta_tyo_keskeneraiseksi(uuid) to authenticated;
