-- Kuitin pysyvä poisto.
--
-- Säilytysajan suoja jää voimaan: tavallinen delete torjutaan yhä, koska
-- tosite ei saa hävitä vahingossa. Poisto on oma nimetty toimintonsa, joka
-- asettaa saman transaktion sisällä lipun jonka liipaisin tunnistaa. Näin
-- vahinkopoisto estyy, mutta testikuitin saa pois ilman että kantaan pitää
-- koskea käsin.
--
-- Käyttötarkoitus on nimenomaan testiaineiston siivous. Oikean tositteen
-- poistaminen säilytysajan kuluessa on kirjanpitolain vastaista, ja
-- käyttöliittymä sanoo sen ennen poistoa.

create or replace function public.esta_kuitin_poisto()
returns trigger
language plpgsql
as $$
begin
  -- Nimenomainen poistotoiminto asettaa lipun; kaikki muu poisto torjutaan.
  if coalesce(current_setting('app.salli_kuitin_poisto', true), '') = 'kylla' then
    return old;
  end if;

  if current_date <= old.sailytettava_asti then
    raise exception
      'Kuittia ei voi poistaa ennen %: kirjanpitolaki vaatii tositteen säilyttämisen.',
      to_char(old.sailytettava_asti, 'DD.MM.YYYY');
  end if;
  return old;
end;
$$;

-- Palauttaa poistetun kuitin tiedostopolun, jotta kutsuja saa siivottua myös
-- Storagen samalla kertaa. Rivit lähtevät cascade-viitteellä.
create or replace function public.poista_kuitti_pysyvasti(p_kuitti_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_polku text;
begin
  -- SECURITY DEFINER ohittaa RLS:n, joten oikeus tarkistetaan itse.
  if not public.is_admin() then
    raise exception 'Vain admin voi poistaa kuitin.';
  end if;

  select tiedosto_polku into v_polku from public.kuitit where id = p_kuitti_id;
  if not found then
    raise exception 'Kuittia ei löytynyt.';
  end if;

  perform set_config('app.salli_kuitin_poisto', 'kylla', true);
  delete from public.kuitit where id = p_kuitti_id;
  perform set_config('app.salli_kuitin_poisto', '', true);

  return v_polku;
end;
$$;

comment on function public.poista_kuitti_pysyvasti(uuid) is
  'Poistaa kuitin ja sen rivit säilytysajan suojasta huolimatta. Tarkoitettu testikuittien siivoukseen; palauttaa tiedostopolun Storagen siivousta varten.';

revoke all on function public.poista_kuitti_pysyvasti(uuid) from public;
grant execute on function public.poista_kuitti_pysyvasti(uuid) to authenticated;
