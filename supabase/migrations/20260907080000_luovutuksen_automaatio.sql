-- Kuukausipaketin automaattinen kokoaminen.
--
-- Ajetaan muutama päivä kuun vaihteen jälkeen eikä heti ensimmäisenä: kuun
-- viimeisten päivien kuitit kuvataan usein vasta seuraavalla viikolla, ja
-- liian aikainen kooste näyttäisi puutteita joita ei ole.
--
-- Kokoaminen ei lähetä mitään. Se laskee tarkistukset ja jättää paketin
-- odottamaan, ja käyttäjä näkee sen Kulut-välilehdellä: "Syyskuun paketti
-- valmis - 23 kuittia, 1 847 € kuluina. Tarkista ja lähetä." Lähetys tapahtuu
-- vasta painalluksesta, koska kirjanpitäjälle mennyttä aineistoa ei voi perua.
--
-- Ajo on kannassa eikä Edge Functionissa: tarkistukset ovat jo SQL:ää, ja
-- Edge Functionin kutsuminen ajastimesta vaatisi service_role-avaimen
-- tallentamista kantaan. Verkkohyppy ei toisi mitään, mutta avain olisi
-- pysyvä riski.

-- ---------------------------------------------------------------------------
-- 1. Kokoaminen ilman oikeustarkistusta
-- ---------------------------------------------------------------------------
-- Sama jako kuin tarkistuksissa: laskenta erikseen, oikeustarkistus sen
-- päälle. Ajastin ei ole kirjautunut käyttäjä eikä sillä ole roolia.
create or replace function public.kokoa_luovutus_laskenta(p_kausi date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kausi date := date_trunc('month', p_kausi::timestamp)::date;
  v_tarkistukset jsonb;
  v_tila text;
begin
  v_tarkistukset := public.luovutuksen_tarkistukset_laskenta(v_kausi);

  select tila into v_tila from public.luovutukset where kausi = v_kausi;

  -- Lähetettyä kautta ei koota uudelleen: sen aineisto on jo mennyt, ja
  -- luvut pysyvät sinä mitä lähetettiin.
  if v_tila = 'lahetetty' then
    return v_tarkistukset;
  end if;

  insert into public.luovutukset (
    kausi, tila, tarkistukset, kuitteja, kuluina_eur, yhteensa_eur, koottu_at
  )
  values (
    v_kausi, 'koottu', v_tarkistukset,
    (v_tarkistukset->>'kuitteja')::integer,
    (v_tarkistukset->>'kuluina_eur')::numeric,
    (v_tarkistukset->>'yhteensa_eur')::numeric,
    now()
  )
  on conflict (kausi) do update set
    tarkistukset = excluded.tarkistukset,
    kuitteja = excluded.kuitteja,
    kuluina_eur = excluded.kuluina_eur,
    yhteensa_eur = excluded.yhteensa_eur,
    koottu_at = now();

  return v_tarkistukset;
end;
$$;

create or replace function public.kokoa_luovutus(p_kausi date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi koota luovutuksen.';
  end if;
  return public.kokoa_luovutus_laskenta(p_kausi);
end;
$$;

revoke all on function public.kokoa_luovutus_laskenta(date) from public;
revoke all on function public.kokoa_luovutus(date) from public;
grant execute on function public.kokoa_luovutus(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Kuukausiajo
-- ---------------------------------------------------------------------------
-- Kokoaa edellisen kuukauden. Tyhjää kuukautta ei koota lainkaan: ilmoitus
-- paketista jota ei ole olisi pelkkää kohinaa.
create or replace function public.kokoa_edellisen_kuukauden_paketti()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kausi date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_tarkistukset jsonb;
  v_kuitteja integer;
begin
  v_tarkistukset := public.kokoa_luovutus_laskenta(v_kausi);
  v_kuitteja := (v_tarkistukset->>'kuitteja')::integer;

  if v_kuitteja = 0 then
    delete from public.luovutukset where kausi = v_kausi and tila = 'koottu';
    return format('Kaudella %s ei ole kuitteja.', to_char(v_kausi, 'MM/YYYY'));
  end if;

  return format(
    '%s: %s kuittia, %s € kuluina, %s.',
    to_char(v_kausi, 'MM/YYYY'),
    v_kuitteja,
    to_char((v_tarkistukset->>'kuluina_eur')::numeric, 'FM999999990.00'),
    case when (v_tarkistukset->>'kunnossa')::boolean
         then 'valmis lähetettäväksi'
         else 'korjattavaa jäljellä' end
  );
end;
$$;

revoke all on function public.kokoa_edellisen_kuukauden_paketti() from public;

-- Neljäs päivä kuuta, 04:00 UTC. Kuun viimeisten päivien kuitit ehtivät
-- mukaan, ja ajo osuu hiljaiseen hetkeen.
select cron.unschedule('kokoa-kuukausipaketti')
where exists (select 1 from cron.job where jobname = 'kokoa-kuukausipaketti');

select cron.schedule(
  'kokoa-kuukausipaketti',
  '0 4 4 * *',
  $cron$select public.kokoa_edellisen_kuukauden_paketti()$cron$
);
