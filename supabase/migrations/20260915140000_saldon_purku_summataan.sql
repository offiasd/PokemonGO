-- =====================================================================
-- Migraatio: saldon purku summataan väreittäin
--
-- Kaksi illusion-logoa samalla värillä varasi kuusi grammaa, mutta työn
-- valmistuessa vapautui vain kolme. Syy on Postgresin UPDATE ... FROM
-- -semantiikassa: kohderivi päivitetään kerran, vaikka lähdepuoli
-- tarjoaisi sille useamman osuman. Toinen lisätyörivi jäi siis
-- huomiotta, ja värin varattu_g jäi pysyvästi kolme grammaa liian
-- suureksi.
--
-- Todettu kokeellisesti: kaksi kolmen gramman lisätyötä samalla
-- värillä -> varaus +6,00 g, valmistumisen jälkeen jäljellä +3,00 g.
--
-- Sama koskee lisävärejä: unique-ehto (rivi_id, vari_id) estää
-- kaksoiskappaleen yhdellä rivillä, mutta ei kahdella eri rivillä
-- samassa työssä. Kahden osan työ samalla lisävärillä vuosi siis
-- vastaavasti.
--
-- Korjaus on sama molemmille: summataan kulutus väreittäin ennen
-- päivitystä, jolloin jokainen väri päivittyy täsmälleen kerran
-- oikealla summalla.
-- =====================================================================

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
    set varattu_g = v.varattu_g - s.kulutus_g,
        saldo_g = v.saldo_g - s.kulutus_g
    from (
      select lt.vari_id, sum(coalesce(lt.kulutus_g, 0)) as kulutus_g
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

-- Paluusuunnan on tunnettava täsmälleen sama summa. Jos vain toinen
-- suunta osaisi laskea kaksoisrivit, saldo ajautuisi väärin joka kerta
-- kun valmis työ palautetaan keskeneräiseksi.
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
      varattu_g = v.varattu_g + s.kulutus_g
  from (
    select lt.vari_id, sum(coalesce(lt.kulutus_g, 0)) as kulutus_g
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
