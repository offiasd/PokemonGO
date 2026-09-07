-- Tositenumero kaksoiskappaleiden tunnistukseen.
--
-- Tunniste oli (paivays, loppusumma_eur, toimittaja). Ne ovat kuvailevia
-- tietoja jotka voivat sattua osumaan: kaksi samansuuruista laskua samalle
-- toimittajalle samana päivänä on täysin normaali tilanne, mutta järjestelmä
-- epäili kaksoiskappaletta.
--
-- Laskun tai kuitin numero on myyjän itsensä antama yksilöivä tunniste. Kaksi
-- eri laskua samalta toimittajalta eivät koskaan jaa samaa numeroa, joten
-- numero on ensisijainen ja vanha vertailu jää varajärjestelmäksi niille
-- kuiteille joissa numeroa ei ole.

alter table public.kuitit
  add column if not exists tositenumero      text,
  add column if not exists tositenumero_norm text,
  add column if not exists tositetyyppi      text;

comment on column public.kuitit.tositenumero is
  'Kuitti- tai laskunumero sellaisena kuin se tositteessa lukee.';
comment on column public.kuitit.tositenumero_norm is
  'Normalisoitu tositenumero vertailua varten. Trigger täyttää.';
comment on column public.kuitit.tositetyyppi is
  'Kumpi numero on kyseessä: kassakuitin kuittinumero vai laskun numero.';

alter table public.kuitit
  drop constraint if exists kuitit_tositetyyppi_check;

alter table public.kuitit
  add constraint kuitit_tositetyyppi_check
  check (tositetyyppi is null or tositetyyppi in ('kuitti', 'lasku'));

-- ---------------------------------------------------------------------------
-- Normalisointi
-- ---------------------------------------------------------------------------

-- "F-2026 1043" ja "F20261043" ovat sama numero: vertailu tehdään
-- normalisoidusta arvosta, ei alkuperäisestä.
create or replace function public.normalisoi_tositenumero(p text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]', '', 'g')), '');
$$;

-- Arvo lasketaan triggerillä eikä sovelluksessa: sovelluksessa se jäisi
-- ennemmin tai myöhemmin täyttämättä jossain koodipolussa, ja tarkistus menisi
-- hiljaa ohi.
create or replace function public.aseta_tositenumero_norm()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.tositenumero_norm := public.normalisoi_tositenumero(new.tositenumero);
  return new;
end;
$$;

drop trigger if exists kuitit_tositenumero on public.kuitit;
create trigger kuitit_tositenumero
before insert or update on public.kuitit
for each row execute function public.aseta_tositenumero_norm();

update public.kuitit
set tositenumero_norm = public.normalisoi_tositenumero(tositenumero)
where tositenumero is not null and tositenumero_norm is null;

-- Vertailu on aina toimittajakohtainen: lasku 1043 Puuilolta ja 1043
-- Motonetilta eivät liity toisiinsa mitenkään.
create index if not exists kuitit_tositenumero_idx
  on public.kuitit (lower(coalesce(toimittaja, '')), tositenumero_norm)
  where tositenumero_norm is not null;

-- kuitit_kaksoiskappale_idx jää paikoilleen: se palvelee varajärjestelmää.

-- ---------------------------------------------------------------------------
-- Epäilyn haku yhdelle kuitille
-- ---------------------------------------------------------------------------

-- Sama logiikka sekä kuitin sivulle että luovutuksen tarkistuksiin, jottei
-- sääntö ehdi ajautua kahdessa paikassa erilleen.
--
--   molemmilla numero ja sama toimittaja:
--     sama numero -> kaksoiskappale, korkea varmuus
--     eri numero  -> ei epäilyä lainkaan, muita vertailuja ei tehdä
--   numero puuttuu jommaltakummalta:
--     vanha vertailu (paivays, loppusumma, toimittaja) -> epäily
--   numerot eroavat mutta muu täsmää:
--     kevyt huomautus, koska poiminta on voinut lukea numeron väärin
--     haalistuneesta kuitista
create or replace function public.kuitin_kaksoiskappaleet(p_kuitti_id uuid)
returns table (
  id uuid,
  toimittaja text,
  paivays date,
  loppusumma_eur numeric,
  tositenumero text,
  varmuus text
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with tama as (
    select k.id, k.toimittaja, k.paivays, k.loppusumma_eur,
           k.tositenumero, k.tositenumero_norm,
           lower(coalesce(k.toimittaja, '')) as toimittaja_norm
    from public.kuitit k
    where k.id = p_kuitti_id
  ),
  muut as (
    select k.id, k.toimittaja, k.paivays, k.loppusumma_eur,
           k.tositenumero, k.tositenumero_norm,
           lower(coalesce(k.toimittaja, '')) as toimittaja_norm
    from public.kuitit k, tama t
    where k.id <> t.id
      and k.mitatoity_at is null
      and lower(coalesce(k.toimittaja, '')) = t.toimittaja_norm
  )
  select m.id, m.toimittaja, m.paivays, m.loppusumma_eur, m.tositenumero,
    case
      when t.tositenumero_norm is not null and m.tositenumero_norm = t.tositenumero_norm
        then 'sama_numero'
      when t.tositenumero_norm is not null and m.tositenumero_norm is not null
        then 'numerot_eroavat'
      else 'samankaltainen'
    end as varmuus
  from muut m, tama t
  where
    -- Sama numero: varma kaksoiskappale numerosta riippumatta muusta.
    (t.tositenumero_norm is not null and m.tositenumero_norm = t.tositenumero_norm)
    or (
      -- Muut haarat vaativat aina saman päivän ja summan.
      m.paivays = t.paivays
      and m.loppusumma_eur = t.loppusumma_eur
      and t.toimittaja_norm <> ''
      and (
        -- Numero puuttuu jommaltakummalta: vanha vertailu.
        t.tositenumero_norm is null
        or m.tositenumero_norm is null
        -- Numerot eroavat mutta muu täsmää: kevyt huomautus lukuvirheestä.
        or m.tositenumero_norm <> t.tositenumero_norm
      )
    )
  order by
    case
      when t.tositenumero_norm is not null and m.tositenumero_norm = t.tositenumero_norm then 0
      when m.tositenumero_norm is null or t.tositenumero_norm is null then 1
      else 2
    end,
    m.paivays desc;
$$;

comment on function public.kuitin_kaksoiskappaleet(uuid) is
  'Kuitin kaksoiskappale-epäilyt varmuustasoineen. Ensisijainen tunniste on tositenumero.';

revoke execute on function public.kuitin_kaksoiskappaleet(uuid) from public;
grant execute on function public.kuitin_kaksoiskappaleet(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Luovutuksen tarkistukset: numero ensin
-- ---------------------------------------------------------------------------

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
        'ok', jsonb_array_length(a.kuitit) = 0, 'kuitit', a.kuitit)
    ),
    'kunnossa', s.kuitteja > 0
      and jsonb_array_length(l.kuitit) = 0
      and jsonb_array_length(t.kuitit) = 0
      and jsonb_array_length(d.kuitit) = 0
      and jsonb_array_length(a.kuitit) = 0
  )
  into v_tulos
  from summat s, luokittelematta l, tasmaamatta t, kaksoiskappaleet d, aukot a;

  return v_tulos;
end;
$$;

-- ---------------------------------------------------------------------------
-- Poiminta kirjoittaa numeron
-- ---------------------------------------------------------------------------

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
begin
  update public.kuitit
  set toimittaja = coalesce(nullif(p_poiminta->>'toimittaja', ''), toimittaja),
      paivays = coalesce((p_poiminta->>'paivays')::date, paivays),
      maksupaiva = coalesce((p_poiminta->>'maksupaiva')::date, maksupaiva),
      loppusumma_eur = coalesce((p_poiminta->>'loppusumma_eur')::numeric, loppusumma_eur),
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
      kuitti_id, teksti, maara, brutto_eur, verokanta, kayttotarkoitus, kululuokka_id, jarjestys
    )
    values (
      p_kuitti_id,
      coalesce(nullif(btrim(v_rivi->>'teksti'), ''), 'Rivi'),
      (v_rivi->>'maara')::numeric,
      coalesce((v_rivi->>'brutto_eur')::numeric, 0),
      (v_rivi->>'verokanta')::numeric,
      v_kayttotarkoitus,
      v_kululuokka,
      v_jarjestys
    );

    v_jarjestys := v_jarjestys + 1;
  end loop;

  -- Luettu kuitti odottaa aina ihmisen silmää: poiminta on ehdotus, ei totuus.
  update public.kuitit
  set tila = 'tarkistettava',
      poiminnan_tila = 'luettu',
      poiminnan_virhe = null,
      updated_at = now()
  where id = p_kuitti_id;
end;
$$;
