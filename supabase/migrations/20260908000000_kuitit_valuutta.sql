-- =====================================================================
-- Migraatio: valuutta, yksikkö ja todellinen euroveloitus
--
-- Tausta:
--   Prismatic Powders / NIC INDUSTRIES -kuitti tallentui niin, että
--   laskun USD-arvot kirjattiin sellaisenaan euroiksi. Rivien summa
--   643,09 vastaa laskun dollarisummaa, ei euroja.
--
--   Lisäksi rivin maara-kenttä on paljas luku: "3.000" tarkoittaa
--   kolmea paunaa, mutta yksikköä ei ole tallennettu mihinkään.
--
-- Ratkaisu:
--   Alkuperäinen summa säilytetään omassa valuutassaan. Euromäärä
--   johdetaan siitä. Ensisijainen lähde euromäärälle on TILILTÄ
--   LUETTU TODELLINEN VELOITUS, koska se sisältää pankin
--   valuuttalisän. Kurssilaskelma on varajärjestelmä.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Kuitin sarakkeet
-- ---------------------------------------------------------------------

alter table public.kuitit
  add column if not exists valuutta              text not null default 'EUR',
  add column if not exists loppusumma_valuutassa numeric(12,2),
  add column if not exists valuuttakurssi        numeric(14,6),
  add column if not exists todellinen_eur        numeric(12,2),
  add column if not exists kurssin_lahde         text;

comment on column public.kuitit.valuutta is
  'Laskun valuutta ISO-koodina. EUR, USD jne.';

comment on column public.kuitit.loppusumma_valuutassa is
  'Loppusumma alkuperäisessä valuutassa, kuitilta luettuna. EUR-kuiteilla sama kuin loppusumma_eur.';

comment on column public.kuitit.valuuttakurssi is
  'Kuinka monta euroa yksi yksikkö laskun valuuttaa. Käytetään vain jos todellinen_eur puuttuu.';

comment on column public.kuitit.todellinen_eur is
  'Tililtä luettu todellinen euroveloitus. ENSISIJAINEN lähde - sisältää pankin valuuttalisän. Syötetään käsin kun veloitus näkyy tilillä.';

comment on column public.kuitit.kurssin_lahde is
  'Mistä euromäärä tulee: pankki (todellinen veloitus), kurssi (laskettu) tai sama (EUR-kuitti).';

alter table public.kuitit
  drop constraint if exists kuitit_kurssin_lahde_check;

alter table public.kuitit
  add constraint kuitit_kurssin_lahde_check
  check (kurssin_lahde is null or kurssin_lahde in ('pankki','kurssi','sama'));


-- ---------------------------------------------------------------------
-- 2. Rivin sarakkeet
-- ---------------------------------------------------------------------

alter table public.kuitin_rivit
  add column if not exists brutto_valuutassa numeric(12,2),
  add column if not exists yksikko           text;

comment on column public.kuitin_rivit.brutto_valuutassa is
  'Rivin summa alkuperäisessä valuutassa. brutto_eur johdetaan tästä.';

comment on column public.kuitin_rivit.yksikko is
  'Määrän yksikkö: lb, kg, g, l, kpl. Prismatic ilmoittaa paunoina - ilman yksikköä lukua ei voi käyttää varastotäydennykseen.';

alter table public.kuitin_rivit
  drop constraint if exists kuitin_rivit_yksikko_check;

alter table public.kuitin_rivit
  add constraint kuitin_rivit_yksikko_check
  check (yksikko is null or yksikko in ('lb','kg','g','l','ml','kpl','pkt'));


-- ---------------------------------------------------------------------
-- 3. Euromäärän laskenta
--
-- Efektiivinen kurssi = todellinen euromäärä / summa valuutassa.
-- Näin rivit skaalautuvat oikein myös silloin kun euromäärä tulee
-- pankista eikä lasketusta kurssista - pankin valuuttalisä jakautuu
-- riveille samassa suhteessa.
-- ---------------------------------------------------------------------

create or replace function public.paivita_kuitin_eurot(p_kuitti_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  k              record;
  v_eur_yhteensa numeric(12,2);
  v_kurssi       numeric(20,10);
  v_summa        numeric(12,2);
  v_erotus       numeric(12,2);
  v_isoin_id     uuid;
begin
  select * into k from public.kuitit where id = p_kuitti_id;
  if not found then
    return;
  end if;

  -- EUR-kuitti: ei muunnosta. Sarakkeet asetetaan yhtä suuriksi eikä vain
  -- täytetä tyhjää: coalesce jätti euromäärän muutokset huomiotta, jolloin
  -- 20 euron kuitilla saattoi lukea loppusumma_valuutassa 0,00.
  if k.valuutta = 'EUR' then
    update public.kuitit
       set loppusumma_valuutassa = loppusumma_eur,
           kurssin_lahde = 'sama',
           todellinen_eur = null,
           valuuttakurssi = null
     where id = p_kuitti_id
       and (loppusumma_valuutassa is distinct from loppusumma_eur
            or kurssin_lahde is distinct from 'sama'
            or todellinen_eur is not null
            or valuuttakurssi is not null);

    update public.kuitin_rivit
       set brutto_valuutassa = brutto_eur
     where kuitti_id = p_kuitti_id
       and brutto_valuutassa is distinct from brutto_eur;
    return;
  end if;

  -- Vieras valuutta: tarvitaan alkuperäinen summa
  if k.loppusumma_valuutassa is null or k.loppusumma_valuutassa = 0 then
    return;
  end if;

  -- Pankin veloitus voittaa lasketun kurssin
  if k.todellinen_eur is not null then
    v_eur_yhteensa := k.todellinen_eur;
    update public.kuitit set kurssin_lahde = 'pankki' where id = p_kuitti_id;
  elsif k.valuuttakurssi is not null then
    v_eur_yhteensa := round(k.loppusumma_valuutassa * k.valuuttakurssi, 2);
    update public.kuitit set kurssin_lahde = 'kurssi' where id = p_kuitti_id;
  else
    -- Ei kumpaakaan: euromäärää ei voi laskea, jätetään ennalleen
    return;
  end if;

  v_kurssi := v_eur_yhteensa::numeric / k.loppusumma_valuutassa::numeric;

  update public.kuitit
     set loppusumma_eur = v_eur_yhteensa
   where id = p_kuitti_id;

  update public.kuitin_rivit
     set brutto_eur = round(coalesce(brutto_valuutassa, 0) * v_kurssi, 2)
   where kuitti_id = p_kuitti_id;

  -- Pyöristysero suurimmalle riville, jotta rivit summautuvat
  -- loppusummaan ja täsmäytys menee läpi
  select coalesce(sum(brutto_eur), 0) into v_summa
    from public.kuitin_rivit where kuitti_id = p_kuitti_id;

  v_erotus := v_eur_yhteensa - v_summa;

  if v_erotus <> 0 then
    select id into v_isoin_id
      from public.kuitin_rivit
     where kuitti_id = p_kuitti_id
     order by abs(brutto_eur) desc nulls last
     limit 1;

    if v_isoin_id is not null then
      update public.kuitin_rivit
         set brutto_eur = brutto_eur + v_erotus
       where id = v_isoin_id;
    end if;
  end if;
end;
$$;

comment on function public.paivita_kuitin_eurot(uuid) is
  'Laskee kuitin ja sen rivien euromäärät. Pankin todellinen veloitus on ensisijainen, laskettu kurssi varalla. Pyöristysero ohjataan suurimmalle riville jotta täsmäytys menee läpi.';

revoke execute on function public.paivita_kuitin_eurot(uuid) from public;
grant execute on function public.paivita_kuitin_eurot(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Triggerit
-- ---------------------------------------------------------------------

create or replace function public.kuitit_valuutta_trg()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Funktio kirjoittaa itse loppusumma_valuutassa-sarakkeen, joka on tämän
  -- triggerin UPDATE OF -listalla. Postgres laukaisee triggerin sarakkeen
  -- mainitsemisesta, ei arvon muuttumisesta, joten ilman syvyystarkistusta
  -- EUR-kuitin lisäys jää ikuiseen kierteeseen ja kaatuu virheeseen
  -- "stack depth limit exceeded". Sisemmät kutsut ohitetaan.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.valuutta       is not distinct from old.valuutta
     and new.todellinen_eur is not distinct from old.todellinen_eur
     and new.valuuttakurssi is not distinct from old.valuuttakurssi
     and new.loppusumma_eur is not distinct from old.loppusumma_eur
     and new.loppusumma_valuutassa is not distinct from old.loppusumma_valuutassa then
    return new;
  end if;

  perform public.paivita_kuitin_eurot(new.id);
  return new;
end;
$$;

drop trigger if exists kuitit_valuutta on public.kuitit;

-- Myös loppusumma_eur on listalla: EUR-kuitilla se on se sarake jota
-- muutetaan, ja ilman sitä loppusumma_valuutassa jäisi vanhaan arvoonsa.
create trigger kuitit_valuutta
  after insert or update of
    valuutta, todellinen_eur, valuuttakurssi, loppusumma_eur, loppusumma_valuutassa
  on public.kuitit
  for each row
  execute function public.kuitit_valuutta_trg();


-- Rivin summa valuutassa on kuitin trigger-ketjun ulottumattomissa: rivit
-- kirjoitetaan omilla lauseillaan, usein vasta kuitin päivityksen jälkeen.
-- Ilman tätä rivi jää ilman valuuttasummaa aina kun kirjoittaja ei sitä anna.
create or replace function public.kuitin_rivin_valuutta_trg()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_valuutta text;
begin
  select valuutta into v_valuutta from public.kuitit where id = new.kuitti_id;

  -- EUR-kuitilla luvut ovat määritelmän mukaan samat. Vieraalla valuutalla
  -- brutto_eur on ennen muunnosta vielä kuitilta luettu luku, eli paras
  -- arvaus valuuttasummaksi silloin kun sitä ei erikseen kirjoitettu.
  if v_valuutta = 'EUR' or new.brutto_valuutassa is null then
    new.brutto_valuutassa := new.brutto_eur;
  end if;

  return new;
end;
$$;

drop trigger if exists kuitin_rivit_valuutta on public.kuitin_rivit;

create trigger kuitin_rivit_valuutta
  before insert or update of brutto_eur, brutto_valuutassa
  on public.kuitin_rivit
  for each row
  execute function public.kuitin_rivin_valuutta_trg();


-- ---------------------------------------------------------------------
-- 5. Backfill
-- ---------------------------------------------------------------------

-- Kaikki nykyiset kuitit ovat EUR paitsi NIC INDUSTRIES. Ehtona on ero eikä
-- tyhjä arvo: sovellus on ehtinyt kirjoittaa pelkkiä *_eur-sarakkeita, jolloin
-- valuuttasumma jäi nollaan vaikka euromäärä muuttui.
update public.kuitit
   set loppusumma_valuutassa = loppusumma_eur,
       kurssin_lahde = 'sama'
 where valuutta = 'EUR'
   and (loppusumma_valuutassa is distinct from loppusumma_eur
        or kurssin_lahde is distinct from 'sama');

update public.kuitin_rivit r
   set brutto_valuutassa = r.brutto_eur
  from public.kuitit k
 where k.id = r.kuitti_id
   and k.valuutta = 'EUR'
   and r.brutto_valuutassa is distinct from r.brutto_eur;

-- NIC INDUSTRIES: arvot ovat dollareita, siirretään oikeaan kenttään.
-- Ehto rajaa vielä euroiksi merkittyihin kuitteihin, jotta ajon toistaminen
-- ei pyyhi käsin syötettyä veloitusta eikä ylikirjoita jo muunnettuja rivejä.
update public.kuitin_rivit r
   set brutto_valuutassa = r.brutto_eur,
       yksikko = case when r.maara is not null then 'lb' else null end
  from public.kuitit k
 where k.id = r.kuitti_id
   and k.toimittaja = 'NIC INDUSTRIES'
   and k.valuutta = 'EUR';

update public.kuitit
   set valuutta = 'USD',
       loppusumma_valuutassa = loppusumma_eur,
       todellinen_eur = null,
       valuuttakurssi = null,
       kurssin_lahde = null,
       tila = 'tarkistettava'
 where toimittaja = 'NIC INDUSTRIES'
   and valuutta = 'EUR';

-- Kurssia EI aseteta arvaamalla. Kuitti jää tilaan 'tarkistettava'
-- kunnes todellinen euroveloitus syötetään tililtä.


-- ---------------------------------------------------------------------
-- 6. Vahvistamaton euromäärä estää luovutuksen
--
-- Backfill jättää NIC-kuitin loppusumma_eur-arvoksi dollarisumman, koska
-- kurssia ei arvata. Se on tietoisesti väärä luku kunnes veloitus
-- syötetään - eikä sellaista lukua saa lähettää kirjanpitäjälle. Uusi
-- tarkistus nostaa kuitin puutelistalle samalla tavalla kuin
-- luokittelematon rivi.
-- ---------------------------------------------------------------------

create or replace function public.luovutuksen_tarkistukset_laskenta(p_kausi date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tulos jsonb;
begin
  with rajat as (
    select
      date_trunc('month', p_kausi::timestamp)::date as alku,
      (date_trunc('month', p_kausi::timestamp) + interval '1 month')::date as loppu
  ),
  kk as (
    select
      k.id, k.toimittaja, k.paivays, k.loppusumma_eur, k.tiedosto_polku,
      k.tositenumero, k.tositenumero_norm,
      k.valuutta, k.kurssin_lahde,
      lower(coalesce(k.toimittaja, '')) as toimittaja_norm,
      count(r.id)::integer as riveja,
      count(r.id) filter (where r.kayttotarkoitus is null)::integer as luokittelematta,
      coalesce(sum(r.brutto_eur), 0) as rivit_yhteensa,
      coalesce(sum(r.brutto_eur) filter (
        where r.kayttotarkoitus in ('yrityksen_tarvike', 'edustus', 'henkilokunnan_tarjoilu')
      ), 0) as kuluina
    from public.kuitit k
    cross join rajat
    left join public.kuitin_rivit r on r.kuitti_id = k.id
    where k.paivays >= rajat.alku and k.paivays < rajat.loppu
      and k.mitatoity_at is null
    group by k.id
  ),
  summat as (
    select
      count(*)::integer as kuitteja,
      coalesce(sum(kuluina), 0)::numeric(12, 2) as kuluina_eur,
      coalesce(sum(rivit_yhteensa), 0)::numeric(12, 2) as yhteensa_eur
    from kk
  ),
  luokittelematta as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'toimittaja', toimittaja, 'paivays', paivays,
      'syy', case when riveja = 0 then 'Ei rivejä'
                  else luokittelematta || ' riviä luokittelematta' end
    ) order by paivays), '[]'::jsonb) as kuitit
    from kk where riveja = 0 or luokittelematta > 0
  ),
  tasmaamatta as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'toimittaja', toimittaja, 'paivays', paivays,
      'syy', 'Rivit ' || to_char(rivit_yhteensa, 'FM999999990.00')
             || ' €, loppusumma ' || to_char(loppusumma_eur, 'FM999999990.00') || ' €'
    ) order by paivays), '[]'::jsonb) as kuitit
    from kk where riveja > 0 and abs(rivit_yhteensa - loppusumma_eur) > 0.01
  ),
  -- Tositenumero on ensisijainen tunniste. Kaksi eri laskua samalta
  -- toimittajalta samana päivänä ja samalla summalla on normaali tilanne, ja
  -- eri numero kertoo sen varmasti - silloin epäilyä ei nosteta lainkaan.
  -- Luovutus on portti, joten tänne otetaan vain ne joissa epäily on aito:
  -- sama numero, tai puuttuva numero ja vanha vertailu. Mahdollinen lukuvirhe
  -- (numerot eroavat, muu täsmää) näytetään kuitin sivulla eikä estä
  -- luovutusta.
  kaksoiskappaleet as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'toimittaja', t.toimittaja, 'paivays', t.paivays,
      'syy', t.syy
    ) order by t.paivays), '[]'::jsonb) as kuitit
    from (
      select distinct on (t.id) t.id, t.toimittaja, t.paivays,
        case
          when m.tositenumero_norm = t.tositenumero_norm
            then 'Sama tositenumero ' || coalesce(t.tositenumero, '')
          else 'Sama toimittaja, päivä ja summa; tositenumero puuttuu'
        end as syy,
        case when m.tositenumero_norm = t.tositenumero_norm then 0 else 1 end as jarjestys
      from kk t
      join kk m on m.id <> t.id and m.toimittaja_norm = t.toimittaja_norm
      where
        (t.tositenumero_norm is not null and m.tositenumero_norm = t.tositenumero_norm)
        or (
          m.paivays = t.paivays
          and m.loppusumma_eur = t.loppusumma_eur
          and t.toimittaja_norm <> ''
          and (t.tositenumero_norm is null or m.tositenumero_norm is null)
        )
      order by t.id, jarjestys
    ) t
  ),
  aukot as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'toimittaja', toimittaja, 'paivays', paivays,
      'syy', 'Tosite puuttuu'
    ) order by paivays), '[]'::jsonb) as kuitit
    from kk where tiedosto_polku is null
  ),
  valuutta as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'toimittaja', toimittaja, 'paivays', paivays,
      'syy', valuutta || '-lasku: euromäärä vahvistamatta'
    ) order by paivays), '[]'::jsonb) as kuitit
    from kk where valuutta <> 'EUR' and kurssin_lahde is null
  )
  select jsonb_build_object(
    'kausi', (select alku from rajat),
    'kuitteja', s.kuitteja,
    'kuluina_eur', s.kuluina_eur,
    'yhteensa_eur', s.yhteensa_eur,
    'tarkistukset', jsonb_build_array(
      jsonb_build_object('avain', 'luokiteltu', 'nimi', 'Kaikki kuitit luokiteltu',
        'ok', jsonb_array_length(l.kuitit) = 0, 'kuitit', l.kuitit),
      jsonb_build_object('avain', 'tasmays', 'nimi', 'Summat täsmäävät',
        'ok', jsonb_array_length(t.kuitit) = 0, 'kuitit', t.kuitit),
      jsonb_build_object('avain', 'kaksoiskappaleet', 'nimi', 'Ei kaksoiskappaleita',
        'ok', jsonb_array_length(d.kuitit) = 0, 'kuitit', d.kuitit),
      jsonb_build_object('avain', 'aukot', 'nimi', 'Ei aukkoja kuukaudessa',
        'ok', jsonb_array_length(a.kuitit) = 0, 'kuitit', a.kuitit),
      jsonb_build_object('avain', 'valuutta', 'nimi', 'Valuuttamäärät vahvistettu',
        'ok', jsonb_array_length(v.kuitit) = 0, 'kuitit', v.kuitit)
    ),
    -- Tyhjää kuukautta ei luovuteta: ei ole mitä luovuttaa.
    'kunnossa', s.kuitteja > 0
      and jsonb_array_length(l.kuitit) = 0
      and jsonb_array_length(t.kuitit) = 0
      and jsonb_array_length(d.kuitit) = 0
      and jsonb_array_length(a.kuitit) = 0
      and jsonb_array_length(v.kuitit) = 0
  )
  into v_tulos
  from summat s, luokittelematta l, tasmaamatta t, kaksoiskappaleet d, aukot a, valuutta v;

  return v_tulos;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Poiminta kirjoittaa valuutan ja yksiköt
--
-- Malli lukee kuitin luvut sellaisina kuin ne kuitissa ovat, eli laskun
-- omassa valuutassa. Ne menevät siis *_valuutassa-sarakkeisiin, ja
-- euromäärä johdetaan niistä. EUR-kuitilla se on sama luku.
-- ---------------------------------------------------------------------

create or replace function public.tallenna_poiminta(p_kuitti_id uuid, p_poiminta jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rivi jsonb;
  v_jarjestys integer := 0;
  v_kayttotarkoitus text;
  v_kululuokka uuid;
  v_valuutta text;
  v_summa numeric;
begin
  v_valuutta := upper(nullif(btrim(coalesce(p_poiminta->>'valuutta', '')), ''));
  if v_valuutta !~ '^[A-Z]{3}$' then
    v_valuutta := null;
  end if;
  v_summa := (p_poiminta->>'loppusumma_eur')::numeric;

  update public.kuitit
  set toimittaja = coalesce(nullif(p_poiminta->>'toimittaja', ''), toimittaja),
      paivays = coalesce((p_poiminta->>'paivays')::date, paivays),
      maksupaiva = coalesce((p_poiminta->>'maksupaiva')::date, maksupaiva),
      valuutta = coalesce(v_valuutta, valuutta),
      loppusumma_valuutassa = coalesce(v_summa, loppusumma_valuutassa),
      -- Euromäärä on tässä vaiheessa vain paikanpitäjä vieraalla valuutalla:
      -- paivita_kuitin_eurot korvaa sen heti kun veloitus tai kurssi tiedetään.
      loppusumma_eur = coalesce(v_summa, loppusumma_eur),
      tositenumero = coalesce(nullif(p_poiminta->>'tositenumero', ''), tositenumero),
      tositetyyppi = coalesce(
        nullif(p_poiminta->>'tositetyyppi', ''),
        tositetyyppi
      ),
      alv_erittely = case
        when jsonb_typeof(p_poiminta->'alv_erittely') = 'array' then p_poiminta->'alv_erittely'
        else alv_erittely
      end,
      updated_at = now()
  where id = p_kuitti_id;

  if not found then
    raise exception 'Kuittia ei löytynyt.';
  end if;

  delete from public.kuitin_rivit where kuitti_id = p_kuitti_id;

  for v_rivi in select * from jsonb_array_elements(coalesce(p_poiminta->'rivit', '[]'::jsonb))
  loop
    -- Avain normalisoidaan samalla tavalla kuin sovelluksessa: pienet
    -- kirjaimet ja yhdet välilyönnit.
    v_kayttotarkoitus := null;
    v_kululuokka := null;
    select o.kayttotarkoitus, o.kululuokka_id
    into v_kayttotarkoitus, v_kululuokka
    from public.kuittirivin_oppi o
    where o.teksti = btrim(lower(regexp_replace(coalesce(v_rivi->>'teksti', ''), '\s+', ' ', 'g')));

    insert into public.kuitin_rivit (
      kuitti_id, teksti, maara, yksikko, brutto_eur, brutto_valuutassa, verokanta,
      kayttotarkoitus, kululuokka_id, jarjestys
    )
    values (
      p_kuitti_id,
      coalesce(nullif(btrim(v_rivi->>'teksti'), ''), 'Rivi'),
      (v_rivi->>'maara')::numeric,
      nullif(btrim(coalesce(v_rivi->>'yksikko', '')), ''),
      coalesce((v_rivi->>'brutto_eur')::numeric, 0),
      coalesce((v_rivi->>'brutto_eur')::numeric, 0),
      (v_rivi->>'verokanta')::numeric,
      v_kayttotarkoitus,
      v_kululuokka,
      v_jarjestys
    );

    v_jarjestys := v_jarjestys + 1;
  end loop;

  -- Rivit kirjoitettiin vasta nyt, joten euromäärät lasketaan tässä eikä
  -- kuitin triggerissä.
  perform public.paivita_kuitin_eurot(p_kuitti_id);

  -- Luettu kuitti odottaa aina ihmisen silmää: poiminta on ehdotus, ei totuus.
  update public.kuitit
  set tila = 'tarkistettava',
      poiminnan_tila = 'luettu',
      poiminnan_virhe = null,
      updated_at = now()
  where id = p_kuitti_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. Tarkistus ajon jälkeen
-- ---------------------------------------------------------------------
-- select toimittaja, valuutta, loppusumma_valuutassa, loppusumma_eur,
--        todellinen_eur, kurssin_lahde, tila
--   from kuitit order by paivays desc;
--
-- Odotus: NIC INDUSTRIES -> USD, loppusumma_valuutassa 643.09,
-- todellinen_eur null, tila 'tarkistettava'.
