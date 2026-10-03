-- =====================================================================
-- Migraatio: rivikorvaus sallii tyhjän listan, arkistointi muut työt
--
-- Työ voi koostua pelkistä muista töistä - esimerkiksi märkäpuhalluksesta
-- ilman maalausta - jolloin maalattavia osia ei ole yhtään. Vaatimus
-- "työssä pitää olla jotain" siirtyy palvelintoimintoon, joka näkee sekä
-- rivit että muut työt.
--
-- Samalla arkistointi kopioi muut työt arkistotauluun.
-- =====================================================================

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
  -- Tyhjä lista on sallittu: työssä voi olla pelkkiä muita töitä, esimerkiksi
  -- märkäpuhallus ilman maalausta. Se ettei työ saa olla kokonaan tyhjä
  -- tarkistetaan palvelintoiminnossa, joka näkee molemmat listat.

  delete from tyon_rivit where tyo_id = p_tyo_id;

  for v_rivi in select * from jsonb_array_elements(coalesce(p_rivit, '[]'::jsonb)) loop
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

    -- Ajat luetaan katalogista ja osan poikkeuksista, eivät selaimesta.
    -- Lähde ratkaistaan avaimella: selaimen avain -> tässä arvottu id.
    with syote as (
      select
        gen_random_uuid() as uusi_id,
        nullif(lt->>'avain', '') as avain,
        nullif(lt->>'lahde_avain', '') as lahde_avain,
        nullif(lt->>'lisatyo_id', '')::uuid as lisatyo_id,
        nullif(lt->>'vari_id', '')::uuid as vari_id,
        coalesce((lt->>'maara')::integer, 1) as maara,
        nullif(lt->>'osuus_prosentti', '')::numeric as osuus_prosentti,
        nullif(lt->>'kulutus_g', '')::numeric as kulutus_g,
        nullif(lt->>'hinta_eur', '')::numeric as hinta_eur,
        nullif(lt->>'automaattinen', '') as automaattinen,
        nullif(lt->>'lakkaus_laajuus', '') as lakkaus_laajuus,
        (lt_nro - 1)::integer as jarjestys
      from jsonb_array_elements(coalesce(v_rivi->'lisatyot', '[]'::jsonb))
        with ordinality as t(lt, lt_nro)
    )
    insert into tyon_rivin_lisatyot (
      id, tyon_rivi_id, lisatyo_id, vari_id, maara, osuus_prosentti,
      teippaus_min, maalaus_min, kulutus_g, hinta_eur, automaattinen,
      lahde_rivi_id, lakkaus_laajuus, jarjestys
    )
    select
      s.uusi_id,
      v_rivi_id,
      s.lisatyo_id,
      s.vari_id,
      s.maara,
      s.osuus_prosentti,
      coalesce(ol.teippaus_min, l.teippaus_min),
      coalesce(ol.maalaus_min, l.maalaus_min),
      s.kulutus_g,
      s.hinta_eur,
      s.automaattinen,
      lahde.uusi_id,
      s.lakkaus_laajuus,
      s.jarjestys
    from syote s
    left join syote lahde
      on s.lahde_avain is not null and lahde.avain = s.lahde_avain
    left join lisatyot l on l.id = s.lisatyo_id
    left join osa_lisatyot ol
      on ol.lisatyo_id = l.id
     and ol.osa_id = nullif(v_rivi->>'osa_id', '')::uuid;
  end loop;
end;
$$;


comment on function public.korvaa_tyon_rivit(uuid, jsonb) is
  'Korvaa työn rivit lisäväreineen ja lisätöineen. Tyhjä lista on sallittu: työ voi koostua pelkistä muista töistä.';

revoke execute on function public.korvaa_tyon_rivit(uuid, jsonb) from public, anon;
grant execute on function public.korvaa_tyon_rivit(uuid, jsonb) to authenticated;



-- ---------------------------------------------------------------------
-- Arkistointi ottaa muut työt mukaan
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

  -- Muut työt eivät varaa maalia, joten ne vain kopioidaan sellaisinaan.
  insert into arkistoidut_muut_tyot (id, tyo_id, kuvaus, hinta_eur, jarjestys)
  select mt.id, mt.tyo_id, mt.kuvaus, mt.hinta_eur, mt.jarjestys
  from tyon_muut_tyot mt
  where mt.tyo_id = p_tyo_id;

  delete from tyot where id = p_tyo_id;
end;
$$;

revoke all on function public.arkistoi_tyo(uuid, boolean) from public, anon;
grant execute on function public.arkistoi_tyo(uuid, boolean) to authenticated;


