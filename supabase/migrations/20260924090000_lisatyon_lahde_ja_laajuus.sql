-- =====================================================================
-- Migraatio: automaattisen rivin lähde ja lakkauksen laajuus
--
-- Kahden candy-sävyn vannekehä sai lakkauksen jota se ei tarvitse, ja
-- pohjaväriä varattiin vain lisätyön osuuden verran.
--
-- Juurisyy ei ollut hinnoittelun lisatyon_varikategoria-funktiossa vaan
-- siinä, mitkä rivit kelpasivat lähteiksi: laskenta katsoi lakkaustarpeen
-- kaikista riveistä sen jälkeen kun automaattinen pohjaväririvi oli jo
-- lisätty joukkoon. Kaikki neljä pohjaväriä (Super Chrome Plus, Alien
-- Silver, BMW Silver, Polished Aluminium) ovat metallicia joilla
-- vaatii_lakkauksen on tosi, joten pohja tilasi lakan itselleen vaikka
-- candy on sen päällä pintana.
--
-- Rakenteellinen korjaus: automaattinen rivi tietää mistä lähteestä se
-- syntyi. Sama väri voi tulla useasta lähteestä, ja kutakin riviä pitää
-- voida muokata itsenäisesti.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Lähde ja laajuus
-- ---------------------------------------------------------------------

alter table public.tyon_rivin_lisatyot
  add column if not exists lahde_rivi_id uuid,
  add column if not exists lakkaus_laajuus text,
  -- Toteutunut kulutus kuuluu myös lisätyöriville: pohjaväri ja lakkaus
  -- siirtyvät tänne työrivin toinen_vari-kentistä, joissa maalaaja saattoi
  -- korjata todellisen menekin valmistumisen yhteydessä.
  add column if not exists toteutunut_kulutus_g numeric(10, 2);

-- Lähde ja sen synnyttämä automaattinen rivi kirjoitetaan samassa
-- lauseessa, joten viite on tarkistettava vasta transaktion lopussa.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tyon_rivin_lisatyot_lahde_fkey'
  ) then
    alter table public.tyon_rivin_lisatyot
      add constraint tyon_rivin_lisatyot_lahde_fkey
      foreign key (lahde_rivi_id) references public.tyon_rivin_lisatyot(id)
      on delete cascade deferrable initially deferred;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tyon_rivin_lisatyot_lakkaus_laajuus_check'
  ) then
    alter table public.tyon_rivin_lisatyot
      add constraint tyon_rivin_lisatyot_lakkaus_laajuus_check
      check (lakkaus_laajuus is null
             or lakkaus_laajuus in ('koko_osa', 'lahteen_osuus'));
  end if;
end $$;

comment on column public.tyon_rivin_lisatyot.lahde_rivi_id is
  'Lisätyörivi jonka väri synnytti tämän automaattisen rivin. Null = lähde on työn pääväri.';
comment on column public.tyon_rivin_lisatyot.lakkaus_laajuus is
  'Vain lakkariveillä: koko_osa tai lahteen_osuus. Pohjaväririveillä null.';
comment on column public.tyon_rivin_lisatyot.toteutunut_kulutus_g is
  'Valmistumisessa kirjattu todellinen menekki. Null = arvio kelpaa.';

create index if not exists tyon_rivin_lisatyot_lahde_idx
  on public.tyon_rivin_lisatyot (lahde_rivi_id);

-- Sarakeoikeudet: toteutunut kulutus on maalaajan kirjattavissa, lähde ja
-- laajuus luettavissa. Ajat ja kustannukset pysyvät poissa kuten ennenkin.
grant select (lahde_rivi_id, lakkaus_laajuus, toteutunut_kulutus_g)
  on public.tyon_rivin_lisatyot to authenticated;

alter table public.arkistoidut_rivin_lisatyot
  add column if not exists lahde_rivi_id uuid,
  add column if not exists lakkaus_laajuus text,
  add column if not exists toteutunut_kulutus_g numeric(10, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'arkistoidut_rivin_lisatyot_lahde_fkey'
  ) then
    alter table public.arkistoidut_rivin_lisatyot
      add constraint arkistoidut_rivin_lisatyot_lahde_fkey
      foreign key (lahde_rivi_id) references public.arkistoidut_rivin_lisatyot(id)
      on delete cascade deferrable initially deferred;
  end if;
end $$;

grant select (lahde_rivi_id, lakkaus_laajuus, toteutunut_kulutus_g)
  on public.arkistoidut_rivin_lisatyot to authenticated;


-- ---------------------------------------------------------------------
-- 2. Olemassa olevat rivit
--
-- Lähdettä ei arvata jälkikäteen: vanhat automaattiset rivit tulkitaan
-- päävärin riveiksi (lahde_rivi_id jää nulliksi). Lakkariveille nykyinen
-- käytös eli koko osa. Lukittuja hintoja ja kulutuksia ei lasketa
-- uudelleen - historia ei muutu takautuvasti.
-- ---------------------------------------------------------------------

update public.tyon_rivin_lisatyot
set lakkaus_laajuus = 'koko_osa'
where automaattinen = 'lakka' and lakkaus_laajuus is null;

update public.arkistoidut_rivin_lisatyot
set lakkaus_laajuus = 'koko_osa'
where automaattinen = 'lakka' and lakkaus_laajuus is null;


-- ---------------------------------------------------------------------
-- 3. Arkistointi säilyttää lähteen ja laajuuden
-- ---------------------------------------------------------------------

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
    id, tyo_id, osa_id, oma_kuvaus, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
    toteutunut_kulutus_g, toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g,
    toinen_toteutunut_kulutus_g, kommentti, custom,
    vari_hinta_per_kg, toinen_vari_hinta_per_kg, maalikustannus_eur, hinta_lukittu_at
  )
  select
    r.id, r.tyo_id, r.osa_id, r.oma_kuvaus, r.vari_id, r.kappalemaara, r.arvioitu_kulutus_g,
    r.yksikkohinta_eur, r.toteutunut_kulutus_g, r.toinen_vari_id, r.toinen_vari_rooli,
    r.toinen_arvioitu_kulutus_g, r.toinen_toteutunut_kulutus_g, r.kommentti, r.custom,
    r.vari_hinta_per_kg, r.toinen_vari_hinta_per_kg, r.maalikustannus_eur, r.hinta_lukittu_at
  from tyon_rivit r
  where r.tyo_id = p_tyo_id;

  insert into arkistoidut_rivin_lisavarit (
    id, rivi_id, vari_id, arvioitu_kulutus_g, toteutunut_kulutus_g, jarjestys,
    vari_hinta_per_kg, maalikustannus_eur, hinta_lukittu_at
  )
  select l.id, l.rivi_id, l.vari_id, l.arvioitu_kulutus_g, l.toteutunut_kulutus_g, l.jarjestys,
         l.vari_hinta_per_kg, l.maalikustannus_eur, l.hinta_lukittu_at
  from tyon_rivin_lisavarit l
  join tyon_rivit r on r.id = l.rivi_id
  where r.tyo_id = p_tyo_id;

  -- Lähdeviittaus säilyy, koska rivien id:t kopioidaan sellaisinaan.
  insert into arkistoidut_rivin_lisatyot (
    id, rivi_id, lisatyo_id, vari_id, maara, osuus_prosentti, teippaus_min, maalaus_min,
    kulutus_g, toteutunut_kulutus_g, hinta_eur, vari_hinta_per_kg, maalikustannus_eur,
    hinta_lukittu_at, automaattinen, lahde_rivi_id, lakkaus_laajuus, jarjestys
  )
  select
    lt.id, lt.tyon_rivi_id, lt.lisatyo_id, lt.vari_id, lt.maara, lt.osuus_prosentti,
    lt.teippaus_min, lt.maalaus_min, lt.kulutus_g, lt.toteutunut_kulutus_g, lt.hinta_eur,
    lt.vari_hinta_per_kg, lt.maalikustannus_eur, lt.hinta_lukittu_at, lt.automaattinen,
    lt.lahde_rivi_id, lt.lakkaus_laajuus, lt.jarjestys
  from tyon_rivin_lisatyot lt
  join tyon_rivit r on r.id = lt.tyon_rivi_id
  where r.tyo_id = p_tyo_id;

  delete from tyot where id = p_tyo_id;
end;
$$;

revoke all on function public.arkistoi_tyo(uuid, boolean) from public, anon;
grant execute on function public.arkistoi_tyo(uuid, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Toteutunut kulutus mukaan saldoon, kustannukseen ja raportteihin
--
-- Lisätyörivi sai toteutunut_kulutus_g-sarakkeen, joten kaikkien sitä
-- lukevien on käytettävä samaa coalesce-sääntöä kuin lisäväreillä.
-- ---------------------------------------------------------------------

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
            saldo_g = saldo_g - coalesce(rivi.toinen_toteutunut_kulutus_g, rivi.toinen_arvioitu_kulutus_g, 0)
        where id = rivi.toinen_vari_id;
      end if;
    end loop;

    update varit v
    set varattu_g = v.varattu_g - s.varaus_g,
        saldo_g = v.saldo_g - s.kulutus_g
    from (
      select l.vari_id,
             sum(l.arvioitu_kulutus_g) as varaus_g,
             sum(coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g)) as kulutus_g
      from tyon_rivin_lisavarit l
      join tyon_rivit r on r.id = l.rivi_id
      where r.tyo_id = new.id
      group by l.vari_id
    ) s
    where v.id = s.vari_id;

    update varit v
    set varattu_g = v.varattu_g - s.varaus_g,
        saldo_g = v.saldo_g - s.kulutus_g
    from (
      select lt.vari_id,
             sum(coalesce(lt.kulutus_g, 0)) as varaus_g,
             sum(coalesce(lt.toteutunut_kulutus_g, lt.kulutus_g, 0)) as kulutus_g
      from tyon_rivin_lisatyot lt
      join tyon_rivit r on r.id = lt.tyon_rivi_id
      where r.tyo_id = new.id and lt.vari_id is not null
      group by lt.vari_id
    ) s
    where v.id = s.vari_id;

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
      set saldo_g = saldo_g + coalesce(rivi.toinen_toteutunut_kulutus_g, rivi.toinen_arvioitu_kulutus_g, 0),
          varattu_g = varattu_g + coalesce(rivi.toinen_arvioitu_kulutus_g, 0)
      where id = rivi.toinen_vari_id;
    end if;
  end loop;

  update varit v
  set saldo_g = v.saldo_g + s.kulutus_g,
      varattu_g = v.varattu_g + s.varaus_g
  from (
    select l.vari_id,
           sum(l.arvioitu_kulutus_g) as varaus_g,
           sum(coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g)) as kulutus_g
    from tyon_rivin_lisavarit l
    join tyon_rivit r on r.id = l.rivi_id
    where r.tyo_id = p_tyo_id
    group by l.vari_id
  ) s
  where v.id = s.vari_id;

  update varit v
  set saldo_g = v.saldo_g + s.kulutus_g,
      varattu_g = v.varattu_g + s.varaus_g
  from (
    select lt.vari_id,
           sum(coalesce(lt.kulutus_g, 0)) as varaus_g,
           sum(coalesce(lt.toteutunut_kulutus_g, lt.kulutus_g, 0)) as kulutus_g
    from tyon_rivin_lisatyot lt
    join tyon_rivit r on r.id = lt.tyon_rivi_id
    where r.tyo_id = p_tyo_id and lt.vari_id is not null
    group by lt.vari_id
  ) s
  where v.id = s.vari_id;

  update tyon_rivit set varaus_purettu = false where tyo_id = p_tyo_id;
  update tyon_rivin_lisavarit l set varaus_purettu = false
  from tyon_rivit r where r.id = l.rivi_id and r.tyo_id = p_tyo_id;
  update tyon_rivin_lisatyot lt set varaus_purettu = false
  from tyon_rivit r where r.id = lt.tyon_rivi_id and r.tyo_id = p_tyo_id;

  update tyot set tila = 'vaiheessa', valmistui_id = null, valmistunut = null where id = p_tyo_id;
end;
$$;

revoke execute on function public.palauta_tyo_keskeneraiseksi(uuid) from public, anon;
grant execute on function public.palauta_tyo_keskeneraiseksi(uuid) to authenticated;
