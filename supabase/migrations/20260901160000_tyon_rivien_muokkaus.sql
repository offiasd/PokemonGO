-- Keskeneräisen työn rivien muokkaus.
--
-- Rivit korvataan kokonaan yhdellä kutsulla: vanhat poistetaan ja uudet
-- lisätään samassa transaktiossa. Näin olemassa oleva tyon_rivi_varaa_saldo_trg
-- hoitaa varaukset oikein ilman uutta logiikkaa - poisto vapauttaa vanhan
-- varauksen ja lisäys tekee uuden, ja lopputulos on erotus. Jos väri vaihtuu
-- tai osa poistetaan, vanhan värin varaus vapautuu automaattisesti.
--
-- Miksi kantafunktio eikä kaksi kutsua sovelluksesta: poiston ja lisäyksen
-- pitää olla atomisia. Muuten epäonnistunut lisäys jättäisi työn rivittömäksi
-- ja varaukset purkautuisivat, vaikka työ on yhä kesken.

create function public.korvaa_tyon_rivit(p_tyo_id uuid, p_rivit jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tila text;
begin
  -- for update lukitsee työn, jottei kaksi yhtäaikaista muokkausta sekoita
  -- varauksia keskenään.
  select tila into v_tila from tyot where id = p_tyo_id for update;

  if v_tila is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tila = 'valmis' then
    raise exception 'Valmiin työn rivejä ei voi muokata.';
  end if;
  if p_rivit is null or jsonb_array_length(p_rivit) = 0 then
    raise exception 'Työssä pitää olla vähintään yksi osa.';
  end if;

  delete from tyon_rivit where tyo_id = p_tyo_id;

  insert into tyon_rivit (
    tyo_id, osa_id, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
    toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g
  )
  select
    p_tyo_id,
    (rivi->>'osa_id')::uuid,
    (rivi->>'vari_id')::uuid,
    coalesce((rivi->>'kappalemaara')::integer, 1),
    (rivi->>'arvioitu_kulutus_g')::numeric,
    (rivi->>'yksikkohinta_eur')::numeric,
    nullif(rivi->>'toinen_vari_id', '')::uuid,
    nullif(rivi->>'toinen_vari_rooli', ''),
    nullif(rivi->>'toinen_arvioitu_kulutus_g', '')::numeric
  from jsonb_array_elements(p_rivit) as rivi;
end;
$$;

comment on function public.korvaa_tyon_rivit(uuid, jsonb) is
  'Korvaa keskeneräisen työn rivit yhdessä transaktiossa. Varaukset (varit.varattu_g) päivittyvät rivitriggerin kautta: vapautuu vanhoista, varautuu uusista.';

-- security definer ohittaa RLS:n (rivien poisto on muuten vain adminille),
-- joten oikeudet tarkistetaan sovelluskerroksessa kuten työn aloituksessakin.
revoke all on function public.korvaa_tyon_rivit(uuid, jsonb) from public;
grant execute on function public.korvaa_tyon_rivit(uuid, jsonb) to authenticated;
