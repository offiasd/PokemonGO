-- Valmiin työn poisto palauttaa myös lisätyörivien maalin varastoon.
--
-- poista_valmis_tyo palautti työrivin pääväri, vanhan toinen_vari-kerroksen ja
-- lisävärit, mutta ei tyon_rivin_lisatyot-rivejä. Niillä on automaattinen
-- pohjaväri ja lakka sekä värilliset lisätyöt, joten poistettu työ jätti ne
-- grammat pysyvästi pois varastosta. palauta_tyo_keskeneraiseksi osasi tämän
-- jo, poisto ei.
--
-- Samalla lisävärien palautus korjautuu: UPDATE ... FROM päivittää kohderivin
-- kerran vaikka liitos tuottaisi useamman osuman, joten saman värin kaksi
-- lisäväririviä palauttivat vain toisen. Kaikki kulutus lasketaan nyt yhteen
-- väreittäin ennen päivitystä.
create or replace function public.poista_valmis_tyo(
  p_tyo_id uuid,
  p_syy text,
  p_tarkennus text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tyo tyot%rowtype;
  v_tarkennus text := nullif(btrim(p_tarkennus), '');
begin
  select * into v_tyo from tyot where id = p_tyo_id for update;
  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila <> 'valmis' then
    raise exception 'Tämä toiminto on valmiille työlle. Keskeneräisen työn peruu peru_tyo.';
  end if;
  if p_syy is null or p_syy not in ('asiakas', 'virhe', 'muu') then
    raise exception 'Valitse peruutuksen syy.';
  end if;
  if p_syy = 'muu' and v_tarkennus is null then
    raise exception 'Kirjoita peruutuksen syy.';
  end if;

  -- Kulutus luetaan samalla varalla kuin valmistuessa vähennettiin:
  -- toteutunut, ja sen puuttuessa arvio. Varaukset on purettu jo
  -- valmistuessa, joten tässä kasvaa vain saldo.
  update varit v
  set saldo_g = v.saldo_g + s.kulutus_g
  from (
    select vari_id, sum(kulutus_g) as kulutus_g
    from (
      select r.vari_id, coalesce(r.toteutunut_kulutus_g, r.arvioitu_kulutus_g) as kulutus_g
      from tyon_rivit r
      where r.tyo_id = p_tyo_id
      union all
      select r.toinen_vari_id,
             coalesce(r.toinen_toteutunut_kulutus_g, r.toinen_arvioitu_kulutus_g, 0)
      from tyon_rivit r
      where r.tyo_id = p_tyo_id and r.toinen_vari_id is not null
      union all
      select l.vari_id, coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g)
      from tyon_rivin_lisavarit l
      join tyon_rivit r on r.id = l.rivi_id
      where r.tyo_id = p_tyo_id
      union all
      select lt.vari_id, coalesce(lt.toteutunut_kulutus_g, lt.kulutus_g, 0)
      from tyon_rivin_lisatyot lt
      join tyon_rivit r on r.id = lt.tyon_rivi_id
      where r.tyo_id = p_tyo_id and lt.vari_id is not null
    ) kaikki
    group by vari_id
  ) s
  where v.id = s.vari_id;

  insert into tyon_peruutukset (tyo_id, asiakas, aloitettu, syy, tarkennus, perui_id)
  values (v_tyo.id, v_tyo.asiakas, v_tyo.aloitettu, p_syy, v_tarkennus, auth.uid());

  delete from tyot where id = p_tyo_id;
end;
$function$;
