-- =====================================================================
-- Migraatio: varit.kiiltotaso (3 tasoa) + varit.hakusanat + RAL-apurit
--
-- Tausta:
--   varit.kiiltoaste on vapaata valmistajatekstiä ja formaatti
--   vaihtelee. Kannassa on 11 eri kirjoitusasua, esim.
--   "High Gloss (85+ GU)", "71-85 GU", pelkkä "80", "Flat (0-6 GU)",
--   "Satin (21-35 GU)" ja "Satin (21-36 GU)".
--   Tekstihaku ei siis toimi: RAL 9005:n arvo on pelkkä "90 GU",
--   joten haku sanalla "gloss" tai "kiiltävä" ei löytäisi sitä.
--
-- Ratkaisu:
--   Normalisoitu kiiltotaso kolmella arvolla. Alkuperäinen
--   kiiltoaste-teksti (GU-luku) jää koskemattomana näkyviin värin
--   lisätietoihin valmistajan omana tietona.
--
--     kiiltava   kiiltävä
--     satiini    satiini / semi-gloss / silk
--     matta      matta / flat
--
--   Päättely tapahtuu ensisijaisesti valmistajan SANASTA
--   (Satin, Semi-Gloss, High Gloss, Matt, Flat, Seidenglanz...),
--   koska se on luotettavampi kuin GU-välin keskiarvo.
--   Vasta jos sanaa ei löydy, käytetään GU-lukua:
--     < 25 matta, 25-69 satiini, >= 70 kiiltava
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Sarakkeet
-- ---------------------------------------------------------------------

alter table public.varit
  add column if not exists kiiltotaso text,
  add column if not exists hakusanat  text;

comment on column public.varit.kiiltotaso is
  'Normalisoitu kiiltotaso: kiiltava / satiini / matta. Päätellään kiiltoaste-tekstistä, mutta admin voi ylikirjoittaa käsin. Käytä hakuun ja suodatukseen - kiiltoaste on vapaata valmistajatekstiä.';

comment on column public.varit.hakusanat is
  'Vapaat suomenkieliset hakusanat ja synonyymit (esim. "musta, kiiltävä musta, 9005"). Mukana haussa, ei näy värilistassa.';


-- ---------------------------------------------------------------------
-- 2. Kiiltotason päättely vapaasta tekstistä
-- ---------------------------------------------------------------------

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

comment on function public.kiiltotaso_paattele(text) is
  'Päättelee kiiltotason (kiiltava/satiini/matta) vapaasta kiiltoaste-tekstistä. Sana ensin, GU-luku vasta jos sanaa ei tunnisteta.';


-- ---------------------------------------------------------------------
-- 3. RAL-koodin poiminta ja värisävyn päättely
-- ---------------------------------------------------------------------

-- Palauttaa "RAL 9005" jos tekstissä on RAL-koodi, muuten null.
-- Käytetään värin nimen lyhentämiseen: valmistajan pitkä otsikko
-- "Pulverlack RAL 9005 Tiefschwarz glatt hochglanz HWF" -> "RAL 9005"
create or replace function public.ral_koodi(p_teksti text)
returns text
language plpgsql
immutable
as $$
declare
  v_osuma text[];
begin
  if p_teksti is null then
    return null;
  end if;

  select regexp_match(lower(p_teksti), 'ral[\s-]*([0-9]{4})')
    into v_osuma;

  if v_osuma is null then
    return null;
  end if;

  return 'RAL ' || v_osuma[1];
end;
$$;

comment on function public.ral_koodi(text) is
  'Poimii RAL-koodin vapaasta tekstistä muodossa "RAL 9005". Null jos koodia ei ole.';


-- Päättelee värisävyn RAL-koodista.
-- RAL classic -pääryhmät ensimmäisen numeron mukaan, ja 9000-sarja
-- sekä yleisimmät poikkeukset erikseen. Tämä on ESITÄYTTÖ - admin
-- voi korjata sävyn värin sivulla.
create or replace function public.ral_varisavy(p_koodi text)
returns text
language plpgsql
immutable
as $$
declare
  v_num integer;
begin
  if p_koodi is null then
    return null;
  end if;

  v_num := nullif(regexp_replace(p_koodi, '\D', '', 'g'), '')::integer;

  if v_num is null then
    return null;
  end if;

  -- Poikkeukset, joissa pääryhmä johtaa harhaan
  if v_num in (1013, 1014, 1015, 9001, 9002, 9003, 9010, 9016, 9018) then
    return 'valkoinen';                       -- luonnon-/helmivalkoiset
  elsif v_num in (1036, 1004, 1005, 1024) then
    return 'kultainen';
  elsif v_num in (9006, 9007) then
    return 'hopea';                           -- alumiinivärit
  elsif v_num in (9004, 9005, 9011, 9017) then
    return 'musta';
  elsif v_num in (9022, 9023) then
    return 'harmaa';
  elsif v_num in (3014, 3015, 3017, 4003) then
    return 'pinkki';
  elsif v_num in (8029, 2013) then
    return 'bronssi';
  end if;

  -- Pääryhmä ensimmäisen numeron mukaan
  return case v_num / 1000
           when 1 then 'keltainen'
           when 2 then 'oranssi'
           when 3 then 'punainen'
           when 4 then 'liila'
           when 5 then 'sininen'
           when 6 then 'vihrea'
           when 7 then 'harmaa'
           when 8 then 'ruskea'
           else null
         end;
end;
$$;

comment on function public.ral_varisavy(text) is
  'Päättelee värisävyn RAL-koodista esitäyttöä varten. Admin voi korjata. Poikkeuslista kattaa yleisimmät harhaanjohtavat koodit (esim. RAL 1013 on valkoinen vaikka kuuluu keltaisiin).';


-- ---------------------------------------------------------------------
-- 4. Vanhojen arvojen siirto (jos aiempi 4-tasoinen versio ajettu)
-- ---------------------------------------------------------------------

alter table public.varit
  drop constraint if exists varit_kiiltotaso_check;

update public.varit
   set kiiltotaso = case kiiltotaso
                      when 'korkeakiilto' then 'kiiltava'
                      when 'puolikiilto'  then 'satiini'
                      else kiiltotaso
                    end
 where kiiltotaso in ('korkeakiilto', 'puolikiilto');


-- ---------------------------------------------------------------------
-- 5. Backfill
-- ---------------------------------------------------------------------

update public.varit
   set kiiltotaso = public.kiiltotaso_paattele(kiiltoaste)
 where kiiltotaso is null;


-- ---------------------------------------------------------------------
-- 6. Check-rajoite
-- ---------------------------------------------------------------------

alter table public.varit
  add constraint varit_kiiltotaso_check
  check (kiiltotaso is null or kiiltotaso in ('kiiltava', 'satiini', 'matta'));


-- ---------------------------------------------------------------------
-- 7. Trigger: pidä kiiltotaso ajan tasalla, mutta älä ohita käsin
--    tehtyä ylikirjoitusta
-- ---------------------------------------------------------------------

create or replace function public.varit_aseta_kiiltotaso()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.kiiltotaso is null then
      new.kiiltotaso := public.kiiltotaso_paattele(new.kiiltoaste);
    end if;
  else
    if new.kiiltoaste is distinct from old.kiiltoaste
       and new.kiiltotaso is not distinct from old.kiiltotaso then
      new.kiiltotaso := public.kiiltotaso_paattele(new.kiiltoaste);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists varit_kiiltotaso_trg on public.varit;

create trigger varit_kiiltotaso_trg
  before insert or update of kiiltoaste, kiiltotaso
  on public.varit
  for each row
  execute function public.varit_aseta_kiiltotaso();


-- ---------------------------------------------------------------------
-- 8. Indeksit
-- ---------------------------------------------------------------------

create index if not exists varit_kiiltotaso_idx
  on public.varit (kiiltotaso);

create index if not exists varit_hakusanat_trgm_idx
  on public.varit using gin (hakusanat gin_trgm_ops);


-- ---------------------------------------------------------------------
-- 9. Tarkistuskysely ajon jälkeen
-- ---------------------------------------------------------------------
-- select kiiltoaste, kiiltotaso, count(*)
--   from varit group by 1,2 order by 3 desc;
--
-- select nimi, tyyppi, kiiltoaste, kiiltotaso
--   from varit
--  where aktiivinen and varisavy = 'musta' and kiiltotaso = 'kiiltava';
