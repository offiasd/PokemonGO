-- Sähköposti-ilmoitukset hälytysrajan alituksista.
--
-- Viesti lähtee kannasta pg_netillä suoraan Resendin rajapintaan, ja pg_cron
-- ajaa tarkistuksen kerran vuorokaudessa. Näin ilmoitus ei ole kiinni siitä
-- onko sovellus hereillä (Renderin ilmaissuunnitelma nukuttaa palvelun).
--
-- Ilmoitus lähtee vain *uusista* alituksista: väri jää tilatauluun kunnes sen
-- saldo nousee takaisin rajan yli, joten samasta väristä ei tule viestiä joka
-- aamu. Rajan yli noussut väri poistuu taulusta ja ilmoittaa uudelleen jos se
-- alittaa rajan myöhemmin.

-- pg_net luo funktionsa aina net-skeemaan. Skeema ei ole PostgRESTin
-- näkyvissä, joten rajapinnasta niihin ei pääse; oikeuksia ei voi kiristää
-- täältä, koska skeema on supabase_adminin omistama.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Asetukset
-- ---------------------------------------------------------------------------
alter table public.asetukset
  add column if not exists halytys_ilmoitukset_kaytossa boolean not null default false,
  add column if not exists halytys_ilmoitus_sahkoposti text,
  add column if not exists halytys_ilmoitus_lahettaja text;

comment on column public.asetukset.halytys_ilmoitus_sahkoposti is
  'Vastaanottajat pilkulla eroteltuna.';
comment on column public.asetukset.halytys_ilmoitus_lahettaja is
  'Lähettäjä muodossa "Nimi <osoite>". Osoitteen pitää olla Resendissä vahvistettu.';

-- ---------------------------------------------------------------------------
-- 2. Tila ja loki
-- ---------------------------------------------------------------------------
-- Mistä väreistä on jo ilmoitettu. Rivi katoaa kun saldo nousee rajan yli.
create table if not exists public.halytys_ilmoitus_tila (
  vari_id uuid primary key references public.varit (id) on delete cascade,
  saldo_g numeric not null,
  ilmoitettu timestamptz not null default now()
);

create table if not exists public.halytys_ilmoitus_loki (
  id bigserial primary key,
  request_id bigint,
  tyyppi text not null,
  vastaanottaja text not null,
  varien_maara integer not null default 0,
  luotu timestamptz not null default now()
);

-- Molemmat ovat vain lähetyslogiikan sisäistä kirjanpitoa: RLS päälle ilman
-- politiikkoja, jolloin niihin pääsee vain security definer -funktioiden kautta.
alter table public.halytys_ilmoitus_tila enable row level security;
alter table public.halytys_ilmoitus_loki enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Lähetys
-- ---------------------------------------------------------------------------
-- Resendin API-avain säilytetään Vaultissa, ei asetustaulussa: asetustaulun
-- lukee kuka tahansa kirjautunut, ja avaimella saisi lähetettyä postia
-- lähettäjän nimissä.
create or replace function public.aseta_resend_avain(p_avain text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi asettaa API-avaimen.';
  end if;
  if coalesce(trim(p_avain), '') = '' then
    raise exception 'Anna API-avain.';
  end if;

  select id into v_id from vault.secrets where name = 'resend_api_key';
  if v_id is null then
    perform vault.create_secret(trim(p_avain), 'resend_api_key', 'Resend API -avain hälytyssähköposteille');
  else
    perform vault.update_secret(v_id, trim(p_avain));
  end if;
end;
$$;

create or replace function public.resend_avain_asetettu()
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin.';
  end if;
  return exists (select 1 from vault.secrets where name = 'resend_api_key');
end;
$$;

-- Varsinainen lähetys. Cron kutsuu ilman parametreja; testiviestin kutsuu
-- admin oman kääreensä kautta.
create or replace function public.laheta_halytys_ilmoitus(p_testi boolean default false)
returns text
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_asetukset public.asetukset%rowtype;
  v_avain text;
  v_vastaanottajat text[];
  v_rivit text := '';
  v_maara integer := 0;
  v_otsikko text;
  v_request_id bigint;
  v_vari record;
begin
  select * into v_asetukset from public.asetukset limit 1;

  if v_asetukset.halytys_ilmoitukset_kaytossa is not true then
    return 'Hälytysilmoitukset eivät ole käytössä.';
  end if;

  v_vastaanottajat := array_remove(
    array(select trim(o) from unnest(string_to_array(coalesce(v_asetukset.halytys_ilmoitus_sahkoposti, ''), ',')) as o),
    ''
  );
  if array_length(v_vastaanottajat, 1) is null then
    return 'Vastaanottajan sähköpostiosoite puuttuu.';
  end if;

  -- Avain haetaan ennen tilan päivitystä: jos se puuttuu, värit eivät saa
  -- merkkiytyä ilmoitetuiksi ilman että viesti lähtee.
  select decrypted_secret into v_avain from vault.decrypted_secrets where name = 'resend_api_key';
  if v_avain is null then
    return 'Resendin API-avain puuttuu - tallenna se asetuksista.';
  end if;

  if p_testi then
    -- Testiviesti näyttää nykytilanteen koskematta ilmoitustilaan.
    for v_vari in
      select v.nimi, v.saldo_g - v.varattu_g as vapaa_g, v.efektiivinen_halytysraja_g as raja_g
      from public.varit_halytykset v
      order by v.nimi
    loop
      v_maara := v_maara + 1;
      v_rivit := v_rivit || format(
        '<tr><td style="padding:4px 12px 4px 0">%s</td><td style="padding:4px 12px 4px 0">%s g</td><td style="padding:4px 0">raja %s g</td></tr>',
        replace(replace(v_vari.nimi, '&', '&amp;'), '<', '&lt;'),
        round(v_vari.vapaa_g),
        round(v_vari.raja_g)
      );
    end loop;
    v_otsikko := format('Jauhemaalaamo: testiviesti (%s väriä rajan alla)', v_maara);
  else
    for v_vari in
      with poistuneet as (
        delete from public.halytys_ilmoitus_tila t
        where not exists (select 1 from public.varit_halytykset v where v.id = t.vari_id)
        returning t.vari_id
      ), uudet as (
        insert into public.halytys_ilmoitus_tila (vari_id, saldo_g)
        select v.id, v.saldo_g - v.varattu_g from public.varit_halytykset v
        on conflict (vari_id) do nothing
        returning vari_id
      )
      select v.nimi, v.saldo_g - v.varattu_g as vapaa_g, v.efektiivinen_halytysraja_g as raja_g
      from public.varit_halytykset v
      join uudet u on u.vari_id = v.id
      order by v.nimi
    loop
      v_maara := v_maara + 1;
      v_rivit := v_rivit || format(
        '<tr><td style="padding:4px 12px 4px 0">%s</td><td style="padding:4px 12px 4px 0">%s g</td><td style="padding:4px 0">raja %s g</td></tr>',
        replace(replace(v_vari.nimi, '&', '&amp;'), '<', '&lt;'),
        round(v_vari.vapaa_g),
        round(v_vari.raja_g)
      );
    end loop;

    if v_maara = 0 then
      return 'Ei uusia hälytyksiä.';
    end if;
    v_otsikko := format('Jauhemaalaamo: %s väriä hälytysrajan alle', v_maara);
  end if;

  select net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_avain
    ),
    body := jsonb_build_object(
      'from', coalesce(nullif(trim(v_asetukset.halytys_ilmoitus_lahettaja), ''), 'Jauhemaalaamo <onboarding@resend.dev>'),
      'to', to_jsonb(v_vastaanottajat),
      'subject', v_otsikko,
      'html', format(
        '<div style="font-family:system-ui,sans-serif"><p>%s</p><table style="border-collapse:collapse">%s</table><p style="margin-top:16px"><a href="https://jauhemaalaamo.onrender.com/halytykset">Avaa hälytykset</a></p></div>',
        case when p_testi then 'Testiviesti hälytysilmoituksista. Nämä värit ovat nyt hälytysrajalla tai sen alla:'
             else 'Seuraavat värit ovat menneet hälytysrajan alle:' end,
        coalesce(nullif(v_rivit, ''), '<tr><td>Ei yhtään väriä rajan alla.</td></tr>')
      )
    ),
    timeout_milliseconds := 20000
  ) into v_request_id;

  insert into public.halytys_ilmoitus_loki (request_id, tyyppi, vastaanottaja, varien_maara)
  values (
    v_request_id,
    case when p_testi then 'testi' else 'halytys' end,
    array_to_string(v_vastaanottajat, ', '),
    v_maara
  );

  return format('Lähetetty osoitteeseen %s (%s väriä).', array_to_string(v_vastaanottajat, ', '), v_maara);
end;
$$;

create or replace function public.laheta_halytys_testiviesti()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi lähettää testiviestin.';
  end if;
  return public.laheta_halytys_ilmoitus(true);
end;
$$;

-- Viimeisimmät lähetykset asetussivun tilariville. pg_net siivoaa vastaukset
-- muutaman tunnin jälkeen, joten vanhempi lähetys näkyy ilman tilatietoa.
create or replace function public.halytys_ilmoitusten_loki()
returns table (
  luotu timestamptz,
  tyyppi text,
  vastaanottaja text,
  varien_maara integer,
  tila text
)
language plpgsql
security definer
set search_path = public, net
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin.';
  end if;

  return query
  select
    l.luotu,
    l.tyyppi,
    l.vastaanottaja,
    l.varien_maara,
    case
      when r.error_msg is not null then 'Virhe: ' || r.error_msg
      when r.status_code between 200 and 299 then 'Lähetetty'
      when r.status_code is not null then format('Virhe %s: %s', r.status_code, left(coalesce(r.content, ''), 200))
      else 'Ei tilatietoa'
    end
  from public.halytys_ilmoitus_loki l
  left join net._http_response r on r.id = l.request_id
  order by l.luotu desc
  limit 5;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Oikeudet
-- ---------------------------------------------------------------------------
-- Lähetysfunktio on cronin sisäinen: sitä ei saa kutsua rajapinnasta, jottei
-- kukaan pysty kuittaamaan hälytyksiä ilmoitetuiksi ilman että viesti lähtee.
revoke all on function public.laheta_halytys_ilmoitus(boolean) from public, anon, authenticated;
revoke all on function public.aseta_resend_avain(text) from public, anon;
revoke all on function public.resend_avain_asetettu() from public, anon;
revoke all on function public.laheta_halytys_testiviesti() from public, anon;
revoke all on function public.halytys_ilmoitusten_loki() from public, anon;

-- Taulut ovat vain funktioiden sisäistä kirjanpitoa: RLS estäisi lukemisen jo
-- yksin, mutta ilman oikeuksia rajapinta vastaa suoraan 401.
revoke all on table public.halytys_ilmoitus_tila from anon, authenticated;
revoke all on table public.halytys_ilmoitus_loki from anon, authenticated;
revoke all on sequence public.halytys_ilmoitus_loki_id_seq from anon, authenticated;

grant execute on function public.aseta_resend_avain(text) to authenticated;
grant execute on function public.resend_avain_asetettu() to authenticated;
grant execute on function public.laheta_halytys_testiviesti() to authenticated;
grant execute on function public.halytys_ilmoitusten_loki() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Ajastus
-- ---------------------------------------------------------------------------
-- Kerran vuorokaudessa aamulla. pg_cron ajaa UTC:ssä, eli 05:00 UTC on
-- Suomen kesäaikaa 08:00 ja talviaikaa 07:00.
select cron.unschedule('halytys-ilmoitus')
where exists (select 1 from cron.job where jobname = 'halytys-ilmoitus');

select cron.schedule(
  'halytys-ilmoitus',
  '0 5 * * *',
  $cron$select public.laheta_halytys_ilmoitus()$cron$
);
