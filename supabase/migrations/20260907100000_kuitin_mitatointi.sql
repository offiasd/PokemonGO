-- Säilytyssuoja tositteen mukaan, ei pelkän päivämäärän.
--
-- Kirjanpitolain säilytysvelvollisuus koskee tositteita eli kirjanpitoon
-- vietyjä kuitteja. Vahingossa kuvattu kuva ei ole tosite: sitä ei ole
-- luovutettu mihinkään, joten sitä ei tarvitse säilyttää kuutta vuotta.
--
--   Ei luovutettu, admin   -> poisto sallittu
--   Luovutettu, admin      -> poisto estetty, mitätöinti sallittu
--   Maalaaja               -> ei kumpaakaan
--
-- Mitätöinti jättää kuvan ja rivit paikoilleen mutta merkitsee kuitin
-- mitätöidyksi syineen. Kirjanpitäjä näkee että jotain korjattiin ja miksi -
-- vientejä ei poisteta vaan oikaistaan.

alter table public.kuitit
  add column if not exists luovutettu_at timestamptz,
  add column if not exists mitatoity_at  timestamptz,
  add column if not exists mitatointi_syy text;

comment on column public.kuitit.luovutettu_at is
  'Milloin kuitti lähti kirjanpitäjälle. Tästä eteenpäin sitä ei voi poistaa.';
comment on column public.kuitit.mitatoity_at is
  'Milloin kuitti mitätöitiin. Mitätöity kuitti ei ole summissa mukana.';
comment on column public.kuitit.mitatointi_syy is
  'Miksi kuitti mitätöitiin. Pakollinen mitätöinnin yhteydessä.';

-- Syy ja mitätöintihetki kulkevat aina yhdessä: pelkkä merkintä ilman syytä ei
-- kerro kirjanpitäjälle mitään.
alter table public.kuitit
  drop constraint if exists kuitit_mitatointi_syineen;
alter table public.kuitit
  add constraint kuitit_mitatointi_syineen
  check ((mitatoity_at is null) = (mitatointi_syy is null));

-- ---------------------------------------------------------------------------
-- Kauden lukitus: mitätöinti ja luovutusmerkintä menevät läpi
-- ---------------------------------------------------------------------------

-- Lukittu kausi estää muutokset, mutta mitätöinti on nimenomaan se tapa jolla
-- luovutettua kuittia korjataan - eikä luovutusmerkintää voi asettaa jos
-- lukitus estää sen asettamisen.
create or replace function public.esta_lukitun_kauden_muutos()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_paivays date;
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'luovutettu_at' - 'mitatoity_at' - 'mitatointi_syy' - 'updated_at')
       = (to_jsonb(new) - 'luovutettu_at' - 'mitatoity_at' - 'mitatointi_syy' - 'updated_at')
  then
    return new;
  end if;

  -- Luovutetun kuitin poistoyritykseen vastataan mitätöintiohjeella: se on
  -- selvempi kuin kauden lukitus, ja se on myös se mitä käyttäjän pitää tehdä.
  if tg_op = 'DELETE' and old.luovutettu_at is not null then
    raise exception
      'Kuitti on luovutettu kirjanpitäjälle %. Sitä ei voi poistaa, vaan se mitätöidään syyn kanssa.',
      to_char(old.luovutettu_at, 'DD.MM.YYYY');
  end if;

  v_paivays := coalesce(new.paivays, old.paivays);
  if public.kausi_lukittu(v_paivays) then
    raise exception
      'Kausi % on luovutettu kirjanpitäjälle. Avaa luovutus ennen muutoksia.',
      to_char(v_paivays, 'MM/YYYY');
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Poistosuoja: tosite vai ei
-- ---------------------------------------------------------------------------

-- Vanha suoja vertasi säilytysaikaa päivämäärään ja sisälsi ohituslipun
-- app.salli_kuitin_poisto, jonka kuka tahansa istunto pystyi asettamaan.
-- Molemmat poistuvat: luovuttamaton kuitti ei ole tosite, ja luovutettu kuitti
-- on suojattu päivämäärästä riippumatta.
create or replace function public.esta_kuitin_poisto()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Kirjautunut käyttäjä: vain admin. RLS estää maalaajan jo ennen tätä, mutta
  -- sääntö toistetaan tässä, jotta se on samassa paikassa kuin säilytyssuoja.
  -- Palvelinavaimella (service_role) ja migraatioissa poisto on huoltotoimi,
  -- eikä sitä estetä - säilytyssuoja alla koskee niitäkin.
  if auth.role() = 'authenticated' and not public.is_admin() then
    raise exception 'Vain admin voi poistaa kuitin.';
  end if;

  if old.luovutettu_at is not null then
    raise exception
      'Kuitti on luovutettu kirjanpitäjälle %. Sitä ei voi poistaa, vaan se mitätöidään syyn kanssa.',
      to_char(old.luovutettu_at, 'DD.MM.YYYY');
  end if;

  return old;
end;
$$;

create or replace function public.poista_kuitti_pysyvasti(p_kuitti_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_polku text;
begin
  -- SECURITY DEFINER ohittaa RLS:n, joten oikeus tarkistetaan itse. Poiston
  -- estävä trigger tarkistaa saman uudelleen, joten suora DELETE ei ole
  -- löysempi kuin tämä.
  if not public.is_admin() then
    raise exception 'Vain admin voi poistaa kuitin.';
  end if;

  select tiedosto_polku into v_polku from public.kuitit where id = p_kuitti_id;
  if not found then
    raise exception 'Kuittia ei löytynyt.';
  end if;

  delete from public.kuitit where id = p_kuitti_id;

  return v_polku;
end;
$$;

create or replace function public.mitatoi_kuitti(p_kuitti_id uuid, p_syy text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_syy text := nullif(btrim(coalesce(p_syy, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi mitätöidä kuitin.';
  end if;
  if v_syy is null then
    raise exception 'Mitätöinnille on kirjattava syy.';
  end if;

  update public.kuitit
  set mitatoity_at = coalesce(mitatoity_at, now()),
      mitatointi_syy = v_syy,
      updated_at = now()
  where id = p_kuitti_id;

  if not found then
    raise exception 'Kuittia ei löytynyt.';
  end if;
end;
$$;

comment on function public.mitatoi_kuitti(uuid, text) is
  'Merkitsee kuitin mitätöidyksi syineen. Kuva ja rivit säilyvät.';

-- Uusi funktio saa oletuksena PUBLIC-oikeuden, joten se perutaan ensin.
revoke execute on function public.mitatoi_kuitti(uuid, text) from public;
grant execute on function public.mitatoi_kuitti(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: luovutetun kuitin tiedostoa ei voi poistaa erikseen
-- ---------------------------------------------------------------------------

-- Ilman tätä rivi jäisi paikoilleen mutta tosite katoaisi.
drop policy if exists "Admin poistaa kuittitiedostot" on storage.objects;

create policy "Admin poistaa kuittitiedostot"
on storage.objects for delete
using (
  bucket_id = 'kuitit'
  and public.is_admin()
  and not exists (
    select 1 from public.kuitit k
    where k.tiedosto_polku = storage.objects.name
      and k.luovutettu_at is not null
  )
);

-- ---------------------------------------------------------------------------
-- Mitätöity kuitti pois summista
-- ---------------------------------------------------------------------------

create or replace view public.kulut_kuukausittain with (security_invoker = true) as
select
  date_trunc('month', k.paivays::timestamp)::date as kuukausi,
  sum(r.brutto_eur) filter (
    where r.kayttotarkoitus in ('yrityksen_tarvike', 'edustus', 'henkilokunnan_tarjoilu')
  ) as kuluina_eur,
  sum(r.brutto_eur) as yhteensa_eur,
  count(distinct k.id) as kuitteja,
  count(*) filter (where r.kayttotarkoitus is null) as luokittelemattomia
from public.kuitit k
join public.kuitin_rivit r on r.kuitti_id = k.id
where k.mitatoity_at is null
group by 1;

-- Luovutuksen tarkistukset: mitätöity kuitti ei ole mukana summissa eikä
-- puutelistoissa. Se on jo kertaalleen luovutettu, ja sen korjaus on kirjattu
-- mitätöintisyyhyn.
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
  kaksoiskappaleet as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'toimittaja', t.toimittaja, 'paivays', t.paivays,
      'syy', 'Sama toimittaja, päivä ja summa'
    ) order by t.paivays), '[]'::jsonb) as kuitit
    from kk t
    where exists (
      select 1 from kk m
      where m.id <> t.id
        and lower(coalesce(m.toimittaja, '')) = lower(coalesce(t.toimittaja, ''))
        and m.paivays = t.paivays
        and m.loppusumma_eur = t.loppusumma_eur
    )
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
-- Luovutus merkitsee kuitit tositteiksi
-- ---------------------------------------------------------------------------

create or replace function public.laheta_luovutus(p_kausi date, p_asetukset jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kausi date := date_trunc('month', p_kausi::timestamp)::date;
  v_tarkistukset jsonb;
  v_luovutus uuid;
  v_idt uuid[];
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi lähettää luovutuksen.';
  end if;

  v_tarkistukset := public.luovutuksen_tarkistukset_laskenta(v_kausi);
  -- Lähetysnappi on estetty kunnes puutteet on korjattu; sama sääntö
  -- toistetaan kannassa, jottei estoa voi kiertää.
  if not (v_tarkistukset->>'kunnossa')::boolean then
    raise exception 'Kaudella % on korjaamattomia puutteita.', to_char(v_kausi, 'MM/YYYY');
  end if;

  -- Luovutushetki merkitään kuiteille: siitä eteenpäin ne ovat tositteita,
  -- joita ei poisteta vaan mitätöidään.
  update public.kuitit
  set luovutettu_at = coalesce(luovutettu_at, now())
  where paivays >= v_kausi
    and paivays < (v_kausi + interval '1 month')::date
    and mitatoity_at is null;

  select array_agg(id order by paivays) into v_idt
  from public.kuitit
  where paivays >= v_kausi
    and paivays < (v_kausi + interval '1 month')::date
    and mitatoity_at is null;

  insert into public.luovutukset (
    kausi, tila, tarkistukset, asetukset, kuitteja, kuluina_eur, yhteensa_eur,
    lahetetty_at, lahettaja_id
  )
  values (
    v_kausi, 'lahetetty', v_tarkistukset, p_asetukset,
    (v_tarkistukset->>'kuitteja')::integer,
    (v_tarkistukset->>'kuluina_eur')::numeric,
    (v_tarkistukset->>'yhteensa_eur')::numeric,
    now(), auth.uid()
  )
  on conflict (kausi) do update set
    tila = 'lahetetty',
    tarkistukset = excluded.tarkistukset,
    asetukset = excluded.asetukset,
    kuitteja = excluded.kuitteja,
    kuluina_eur = excluded.kuluina_eur,
    yhteensa_eur = excluded.yhteensa_eur,
    lahetetty_at = now(),
    lahettaja_id = auth.uid()
  returning id into v_luovutus;

  insert into public.luovutuksen_loki (
    luovutus_id, tapahtuma, asetukset, kuitti_idt, kuitteja, kuluina_eur, kayttaja_id
  )
  values (
    v_luovutus, 'lahetetty', p_asetukset, coalesce(v_idt, '{}'),
    (v_tarkistukset->>'kuitteja')::integer,
    (v_tarkistukset->>'kuluina_eur')::numeric,
    auth.uid()
  );

  return v_tarkistukset;
end;
$$;

-- Avattu luovutus palauttaa kuitit luonnostilaan: kausi on taas muokattavissa,
-- joten myös virheellisen kuitin voi poistaa ennen uutta lähetystä.
create or replace function public.avaa_luovutus(p_kausi date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kausi date := date_trunc('month', p_kausi::timestamp)::date;
  v_luovutus uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi avata luovutuksen.';
  end if;

  update public.luovutukset
  set tila = 'koottu'
  where kausi = v_kausi and tila = 'lahetetty'
  returning id into v_luovutus;

  if v_luovutus is null then
    raise exception 'Kautta % ei ole lukittu.', to_char(v_kausi, 'MM/YYYY');
  end if;

  update public.kuitit
  set luovutettu_at = null
  where paivays >= v_kausi
    and paivays < (v_kausi + interval '1 month')::date;

  insert into public.luovutuksen_loki (luovutus_id, tapahtuma, kayttaja_id)
  values (v_luovutus, 'avattu', auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Vanhat kuitit lukituilta kausilta merkitään luovutetuiksi
-- ---------------------------------------------------------------------------

update public.kuitit k
set luovutettu_at = l.lahetetty_at
from public.luovutukset l
where l.tila = 'lahetetty'
  and k.luovutettu_at is null
  and k.paivays >= l.kausi
  and k.paivays < (l.kausi + interval '1 month')::date;

-- ---------------------------------------------------------------------------
-- Laskentafunktiot vain sisäiseen käyttöön
-- ---------------------------------------------------------------------------

-- *_laskenta-funktiot ovat SECURITY DEFINER eivätkä tarkista roolia: rooli
-- tarkistetaan ohuissa kääreissä luovutuksen_tarkistukset ja kokoa_luovutus.
-- Suora kutsuoikeus olisi ohitus, jolla maalaaja näkisi kuukauden kuitit.
revoke execute on function public.luovutuksen_tarkistukset_laskenta(date) from anon, authenticated;
revoke execute on function public.kokoa_luovutus_laskenta(date) from anon, authenticated;
