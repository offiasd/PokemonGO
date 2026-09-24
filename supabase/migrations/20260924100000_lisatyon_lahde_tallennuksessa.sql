-- =====================================================================
-- Migraatio: lähdeviittaus tallennukseen
--
-- Automaattinen rivi tietää nyt mistä lähteestä se syntyi, mutta selain
-- ei voi lähettää lähteen id:tä: sitä ei ole olemassa ennen kuin rivi on
-- kirjoitettu. Selain lähettää siis oman avaimensa ja lähteen avaimen, ja
-- kanta ratkaisee viittauksen.
--
-- Id:t arvotaan CTE:ssä ennen kirjoitusta, jolloin sama lause voi liittää
-- automaattirivin lähteeseensä. Itseviittaus on siirrettävä (deferrable),
-- joten järjestys lauseen sisällä ei ratkaise.
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
  'Korvaa työn rivit lisäväreineen ja lisätöineen. Lisätöiden ajat luetaan katalogista ja osan poikkeuksista; automaattisen rivin lähde ratkaistaan selaimen avaimesta.';

revoke execute on function public.korvaa_tyon_rivit(uuid, jsonb) from public, anon;
grant execute on function public.korvaa_tyon_rivit(uuid, jsonb) to authenticated;
