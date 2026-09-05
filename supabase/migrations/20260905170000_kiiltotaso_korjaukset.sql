-- Kaksi korjausta kiiltotason päättelyyn.
--
-- 1. Umlaut. kiiltotaso_paattele etsi sanat 'gloss', 'glanz' ja 'kiilt', mutta
--    saksan "glänzend" kirjoitetaan ä:llä eikä osunut mihinkään. Ilman
--    GU-lukua (esim. "Glanzgrad: Glatt glänzend (visuell)") kiiltotaso jäi
--    tyhjäksi. Löytyi ajamalla Pulverkönigin koko 250 tuotteen luettelo
--    poiminnan läpi: osa tuotteista ilmoittaa kiillon pelkkänä sanana.
--
-- 2. Tyhjennys tarkoittaa "päättele uudelleen". Trigger tulkitsi jokaisen
--    kiiltotason muutoksen käsin tehdyksi, myös tyhjentämisen, joten kentän
--    tyhjentäminen jätti sen pysyvästi tyhjäksi eikä päättely käynnistynyt
--    enää koskaan. Nyt tyhjä arvo täytetään kuten rivin lisäyksessäkin -
--    varsinainen ylikirjoitus (jokin kolmesta tasosta) jää edelleen voimaan.

create or replace function public.kiiltotaso_paattele(p_teksti text)
returns text
language plpgsql
immutable
as $$
declare
  v_teksti text;
  v_luvut  numeric[];
  v_arvo   numeric;
begin
  if p_teksti is null or btrim(p_teksti) = '' then
    return null;
  end if;

  v_teksti := replace(lower(p_teksti), ',', '.');

  -- SANAT ENSIN. Järjestys on tärkeä:
  --   "Seidenmatt" sisältää sanan "matt" mutta on satiini
  --   "Semi-Gloss" ja "High Gloss" sisältävät sanan "gloss"
  if v_teksti like '%satin%'
     or v_teksti like '%satiini%'
     or v_teksti like '%semi%'
     or v_teksti like '%seiden%'
     or v_teksti like '%silk%'
     or v_teksti like '%puolikiilto%' then
    return 'satiini';

  elsif v_teksti like '%matt%'
     or v_teksti like '%flat%'
     or v_teksti like '%stumpf%' then
    return 'matta';

  elsif v_teksti like '%gloss%'
     or v_teksti like '%glanz%'
     or v_teksti like '%glänz%'
     or v_teksti like '%kiilt%' then
    return 'kiiltava';
  end if;

  -- Ei tunnistettua sanaa -> GU-luku
  select array_agg((m[1])::numeric)
    into v_luvut
    from regexp_matches(v_teksti, '(\d+(?:\.\d+)?)', 'g') as m;

  if v_luvut is null then
    return null;
  end if;

  -- Kaksi lukua = väli ("71-85 GU") -> keskiarvo.
  -- Yksi luku ("80", "90 GU", "85+ GU") -> sellaisenaan.
  if array_length(v_luvut, 1) >= 2 then
    v_arvo := (v_luvut[1] + v_luvut[2]) / 2;
  else
    v_arvo := v_luvut[1];
  end if;

  if v_arvo < 25 then
    return 'matta';
  elsif v_arvo < 70 then
    return 'satiini';
  else
    return 'kiiltava';
  end if;
end;
$$;

create or replace function public.varit_aseta_kiiltotaso()
returns trigger
language plpgsql
as $$
begin
  -- Tyhjä kiiltotaso tarkoittaa aina "päättele kiiltoasteesta", oli kyse
  -- uudesta rivistä tai kentän tyhjentämisestä.
  if new.kiiltotaso is null then
    new.kiiltotaso := public.kiiltotaso_paattele(new.kiiltoaste);
    return new;
  end if;

  -- Käsin valittu taso jää voimaan. Se päivittyy vain kun kiiltoaste
  -- vaihtuu eikä tasoa samalla kerrota erikseen.
  if tg_op = 'UPDATE'
     and new.kiiltoaste is distinct from old.kiiltoaste
     and new.kiiltotaso is not distinct from old.kiiltotaso then
    new.kiiltotaso := public.kiiltotaso_paattele(new.kiiltoaste);
  end if;

  return new;
end;
$$;
