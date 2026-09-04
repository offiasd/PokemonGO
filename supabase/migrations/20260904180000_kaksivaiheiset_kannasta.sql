-- Kaksivaiheisen tunnistuksen tila luetaan kannasta.
--
-- Käyttäjät-sivu luki tilan auth.admin.listUsers()-vastauksen factors-kentästä,
-- mutta listausrajapinta ei palauta tekijöitä lainkaan - sarake näytti siksi
-- "Ei käytössä" kaikille, myös adminille jolla tunnistus on käytössä. Sama
-- tapahtui hiljaisesti myös silloin kun service role -avainta ei ole asetettu.
--
-- Tekijät ovat auth.mfa_factors-taulussa, johon ei pääse PostgRESTin kautta.
-- Security definer -funktio lukee sen adminille, jolloin tieto on aina oikea
-- eikä sarake riipu service role -avaimesta.
create or replace function public.kaksivaiheiset_kayttajat()
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin näkee kaksivaiheisen tunnistuksen tilan.';
  end if;

  return query
    select distinct f.user_id
    from auth.mfa_factors f
    where f.status = 'verified';
end;
$$;

comment on function public.kaksivaiheiset_kayttajat() is
  'Käyttäjät joilla on vahvistettu kaksivaiheinen tunnistus. Vain adminille.';

revoke all on function public.kaksivaiheiset_kayttajat() from public, anon;
grant execute on function public.kaksivaiheiset_kayttajat() to authenticated;
