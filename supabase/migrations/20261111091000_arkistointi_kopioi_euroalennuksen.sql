-- Arkistointi kopioi myös työn euroalennuksen.
--
-- arkistoi_tyo luettelee kopioitavat sarakkeet nimeltä, joten uusi
-- alennus_summa_eur olisi jäänyt arkistoon nollaksi ja arkistoidun työn
-- loppusumma olisi kasvanut alennuksen verran.
create or replace function public.arkistoi_tyo(
  p_tyo_id uuid,
  p_automaattinen boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    alennus_summa_eur, arkistoi_id, automaattinen
  )
  values (
    v_tyo.id, v_tyo.asiakas, v_tyo.aloitti_id, v_tyo.aloitettu, v_tyo.valmistui_id,
    v_tyo.valmistunut, v_tyo.alennus_prosentti, v_tyo.alennus_summa_eur,
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
$function$;
