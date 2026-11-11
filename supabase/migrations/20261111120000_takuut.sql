-- Takuut omana taulunaan.
--
-- Takuuta ei lisätä kuitin riville kahdesta syystä, joista kumpikin riittäisi
-- yksinään. Kauden lukitus estää kaikki muutokset riveihin, kun kausi on
-- luovutettu kirjanpitäjälle, eikä edellisen kuun ostokselle voisi enää lisätä
-- takuuta - takuu ei ole kirjanpitotieto eikä sen pidä lukittua. Lisäksi
-- tallenna_poiminta poistaa kuitin rivit ja lisää ne uudelleen, jolloin
-- riville tallennettu takuu katoaisi joka luvussa.
--
-- Erillinen taulu sallii myös takuun ilman kuittia ja linkityksen kalustoon.
create table if not exists public.takuut (
  id uuid primary key default gen_random_uuid(),

  -- Väärä kuitti poistetaan ennen luovutusta: sen takuu on silloin myös väärä.
  -- Luovutettua kuittia ei voi poistaa, vain mitätöidä.
  kuitti_id uuid references public.kuitit(id) on delete cascade,

  -- Rivit kirjoitetaan uudelleen joka luvussa, joten linkki voi katketa.
  -- Takuu säilyy kuitti_id:n ja rivin_teksti:n varassa ja linkitetään
  -- uudelleen (linkita_takuut).
  kuitin_rivi_id uuid references public.kuitin_rivit(id) on delete set null,
  kalusto_id uuid references public.kalusto(id) on delete set null,

  nimi text not null check (btrim(nimi) <> ''),
  rivin_teksti text,
  alkaa date not null,
  paattyy date not null,
  lahde text not null default 'kasin' check (lahde in ('kuitti', 'kasin')),
  kuitin_takuuteksti text,
  sarjanumero text,
  muistiinpano text,
  luotu timestamptz not null default now(),
  luoja_id uuid default auth.uid(),

  constraint takuut_paivat check (paattyy >= alkaa)
);

create index if not exists takuut_paattyy_idx on public.takuut (paattyy);
create index if not exists takuut_kuitti_idx on public.takuut (kuitti_id);

alter table public.takuut enable row level security;

-- Luodaan vain jos puuttuu: create policy ei tunne if not exists -muotoa,
-- eikä migraatio saa kaatua uudelleen ajettaessa.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'takuut' and policyname = 'takuut_admin'
  ) then
    create policy takuut_admin on public.takuut
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end
$$;

-- Mallin vihje siitä, onko rivi laite vai kulutustarvike. Kirjoitetaan vain
-- poiminnassa, joten kauden lukitus ei koske sitä käytännössä.
alter table public.kuitin_rivit
  add column if not exists kestotuote_vihje boolean;

alter table public.asetukset
  add column if not exists takuu_varoitus_pv integer not null default 30
    check (takuu_varoitus_pv between 1 and 365);

-- Näkymä on security_invoker, jotta RLS pätee lukijan oikeuksilla.
create or replace view public.takuut_nakyma
with (security_invoker = true) as
select
  t.*,
  k.toimittaja,
  k.paivays      as kuitin_paivays,
  k.mitatoity_at as kuitti_mitatoity_at,
  (t.paattyy - current_date) as jaljella_pv,
  (t.paattyy - t.alkaa)      as kesto_pv
from public.takuut t
left join public.kuitit k on k.id = t.kuitti_id;

/**
 * Rivin tekstin vertailumuoto: pienet kirjaimet ja yhdet välilyönnit.
 *
 * Sama normalisointi kuin kuittirivin_oppi-taulussa ja sovelluksen
 * opinAvain-funktiossa. Omana funktionaan, jottei kaava ole kolmannessa
 * paikassa eri tavalla kirjoitettuna.
 */
create or replace function public.normalisoi_rivin_teksti(p_teksti text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select btrim(lower(regexp_replace(coalesce(p_teksti, ''), '\s+', ' ', 'g')));
$function$;

/**
 * Takuiden uudelleenlinkitys kuitin riveihin.
 *
 * Kuitin rivit kirjoitetaan uudelleen aina kun kuitti luetaan tai lomake
 * tallennetaan, jolloin takuun kuitin_rivi_id jää nulliksi. Takuu löytää
 * rivinsä takaisin normalisoidun tekstin perusteella. Jos samaa tekstiä on
 * kuitilla useammalla rivillä, takuut linkitetään järjestyksessä ensimmäisiin
 * vapaisiin riveihin.
 */
create or replace function public.linkita_takuut(p_kuitti_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Palvelinavaimella ajettu poiminta kulkee ilman käyttäjää; selaimesta
  -- kutsuttuna kuitit ovat adminin tietoa kuten muutkin kulut.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Vain admin voi käsitellä takuita.';
  end if;

  with vapaat_rivit as (
    select
      kr.id,
      public.normalisoi_rivin_teksti(kr.teksti) as teksti,
      row_number() over (
        partition by public.normalisoi_rivin_teksti(kr.teksti)
        order by kr.jarjestys, kr.id
      ) as nro
    from public.kuitin_rivit kr
    where kr.kuitti_id = p_kuitti_id
      and not exists (select 1 from public.takuut t where t.kuitin_rivi_id = kr.id)
  ), irralliset as (
    select
      t.id,
      public.normalisoi_rivin_teksti(t.rivin_teksti) as teksti,
      row_number() over (
        partition by public.normalisoi_rivin_teksti(t.rivin_teksti)
        order by t.luotu, t.id
      ) as nro
    from public.takuut t
    where t.kuitti_id = p_kuitti_id
      and t.kuitin_rivi_id is null
      and nullif(btrim(coalesce(t.rivin_teksti, '')), '') is not null
  )
  update public.takuut t
  set kuitin_rivi_id = v.id
  from irralliset i
  join vapaat_rivit v on v.teksti = i.teksti and v.nro = i.nro
  where t.id = i.id;
end;
$function$;

/**
 * Poiminnasta luetut takuut ja kestotuotevihjeet kuitin riveille.
 *
 * Kutsutaan heti rivien tallennuksen jälkeen. Takuu luodaan vain riville,
 * jolla kuitissa lukee takuu: takuuta ei koskaan päätellä tuotteesta.
 * Uudelleen luettu kuitti ei saa toista takuuta samalle riville, vaan vanha
 * linkitetään uuteen riviin.
 */
create or replace function public.luo_takuut_poiminnasta(p_kuitti_id uuid, p_poiminta jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rivi jsonb;
  v_paivays date;
  v_teksti text;
  v_norm text;
  v_kk integer;
  v_rivi_id uuid;
  v_takuuteksti text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Vain admin voi käsitellä takuita.';
  end if;

  select k.paivays into v_paivays from public.kuitit k where k.id = p_kuitti_id;
  if not found then
    raise exception 'Kuittia ei löytynyt.';
  end if;

  for v_rivi in select * from jsonb_array_elements(coalesce(p_poiminta->'rivit', '[]'::jsonb))
  loop
    v_teksti := nullif(btrim(coalesce(v_rivi->>'teksti', '')), '');
    continue when v_teksti is null;
    v_norm := public.normalisoi_rivin_teksti(v_teksti);

    -- Vihje laitteesta on käyttöliittymää varten, ei kirjanpitotietoa.
    if jsonb_typeof(v_rivi->'kestotuote') = 'boolean' then
      update public.kuitin_rivit kr
      set kestotuote_vihje = (v_rivi->>'kestotuote')::boolean
      where kr.kuitti_id = p_kuitti_id
        and public.normalisoi_rivin_teksti(kr.teksti) = v_norm;
    end if;

    v_kk := case
      when jsonb_typeof(v_rivi->'takuu_kk') in ('number', 'string')
        then floor((v_rivi->>'takuu_kk')::numeric)::integer
      else null
    end;
    v_takuuteksti := nullif(btrim(coalesce(v_rivi->>'takuu_teksti', '')), '');
    -- Takuu kirjataan vain kun kuitilta on luettu teksti: pelkkä kuukausiluku
    -- ilman tekstiä on mallin päätelmä, ei kuitin tieto.
    continue when v_kk is null or v_kk < 1 or v_kk > 120 or v_takuuteksti is null;

    -- Sama rivi ei saa kahta takuuta, vaikka kuitti luettaisiin uudelleen.
    continue when exists (
      select 1 from public.takuut t
      where t.kuitti_id = p_kuitti_id
        and public.normalisoi_rivin_teksti(coalesce(t.rivin_teksti, t.nimi)) = v_norm
    );

    select kr.id into v_rivi_id
    from public.kuitin_rivit kr
    where kr.kuitti_id = p_kuitti_id
      and public.normalisoi_rivin_teksti(kr.teksti) = v_norm
      and not exists (select 1 from public.takuut t where t.kuitin_rivi_id = kr.id)
    order by kr.jarjestys, kr.id
    limit 1;

    insert into public.takuut (
      kuitti_id, kuitin_rivi_id, nimi, rivin_teksti, alkaa, paattyy, lahde, kuitin_takuuteksti
    )
    values (
      p_kuitti_id,
      v_rivi_id,
      v_teksti,
      v_teksti,
      coalesce(v_paivays, current_date),
      (coalesce(v_paivays, current_date) + make_interval(months => v_kk))::date,
      'kuitti',
      v_takuuteksti
    );
  end loop;

  perform public.linkita_takuut(p_kuitti_id);
end;
$function$;

revoke all on function public.linkita_takuut(uuid) from public;
revoke all on function public.luo_takuut_poiminnasta(uuid, jsonb) from public;
grant execute on function public.linkita_takuut(uuid) to authenticated, service_role;
grant execute on function public.luo_takuut_poiminnasta(uuid, jsonb) to authenticated, service_role;

/**
 * Kuitin rivi kalustoon, nyt myös takuu mukana.
 *
 * Hankintameno on ALV 0 %, ja kuitilla lukeva summa on brutto. Vero puretaan
 * kannassa rivin omalla verokannalla, samalla kaavalla kuin pienhankintojen
 * katossa - se on ainoa paikka jossa muunnos tehdään.
 *
 * Rivin takuu seuraa kalustoon: takuuasiassa kysytään juuri sitä laitetta,
 * josta kalustorivi syntyi.
 */
create or replace function public.siirra_rivi_kalustoon(
  p_rivi_id uuid,
  p_nimi text default null,
  p_hankittu date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        record;
  v_netto  numeric;
  v_id     uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi siirtää hankintoja kalustoon.';
  end if;

  select kr.id, kr.teksti, kr.brutto_eur, kr.verokanta, kr.kuitti_id,
         k.paivays, k.toimittaja
    into r
    from public.kuitin_rivit kr
    join public.kuitit k on k.id = kr.kuitti_id
   where kr.id = p_rivi_id;

  if not found then
    raise exception 'Kuitin riviä ei löytynyt.';
  end if;

  if exists (select 1 from public.kalusto where kuitin_rivi_id = p_rivi_id) then
    raise exception 'Rivi on jo siirretty kalustoon.';
  end if;

  v_netto := case
    when coalesce(r.verokanta, 0) > 0
      then round(r.brutto_eur / (1 + r.verokanta / 100.0), 2)
    else round(r.brutto_eur, 2)
  end;

  insert into public.kalusto (
    nimi, kuvaus, hankittu, hankintameno_eur, kuitti_id, kuitin_rivi_id, luoja_id
  )
  values (
    coalesce(nullif(btrim(p_nimi), ''), r.teksti),
    case when r.toimittaja is null then null else 'Kuitilta: ' || r.toimittaja end,
    coalesce(p_hankittu, r.paivays),
    v_netto,
    r.kuitti_id,
    r.id,
    auth.uid()
  )
  returning id into v_id;

  update public.takuut
  set kalusto_id = v_id
  where kuitin_rivi_id = p_rivi_id and kalusto_id is null;

  return v_id;
end;
$function$;
