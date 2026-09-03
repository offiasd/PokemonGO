-- Tietoturvakorjaukset: roolin korotus rekisteröityessä ja anon-oikeudet.
--
-- Sovellus on julkisesti saatavilla, joten kuka tahansa voi kutsua Supabasen
-- REST-rajapintaa anon-avaimella (avain on suunnitellusti julkinen). Kaksi
-- reikää oli auki:
--
-- 1. handle_new_user luki roolin käyttäjän omista metatiedoista. Itse
--    rekisteröityvä pystyi antamaan signup-kutsussa role=admin ja sai
--    admin-oikeudet koko sovellukseen.
-- 2. Kaikki security definer -funktiot olivat anon-roolin kutsuttavissa.
--    Kirjautumaton pystyi esimerkiksi perumaan ja poistamaan töitä
--    (peru_tyo, poista_valmis_tyo) tai arkistoimaan kaiken.

-- ---------------------------------------------------------------------------
-- 1. Rooli vain kutsutuille
-- ---------------------------------------------------------------------------
-- Kutsutun käyttäjän luo admin palvelinpuolelta (inviteUserByEmail), jolloin
-- rooli tulee kutsujalta ja auth.users.invited_at on asetettu. Itse
-- rekisteröityvällä sitä ei ole, joten hänen metatietojaan ei uskota.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pyydetty text := new.raw_user_meta_data ->> 'role';
  v_rooli text := 'maalaaja';
begin
  if new.invited_at is not null and v_pyydetty in ('admin', 'maalaaja') then
    v_rooli := v_pyydetty;
  end if;

  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), v_rooli);
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Luo profiilin uudelle käyttäjälle. Rooli otetaan metatiedoista vain kutsutuille käyttäjille (invited_at asetettu); itse rekisteröityvä saa aina maalaaja-roolin.';

-- ---------------------------------------------------------------------------
-- 2. Funktioiden kutsuoikeudet
-- ---------------------------------------------------------------------------
-- Kirjautumaton ei kutsu yhtäkään sovelluksen funktiota. Poikkeuksena
-- is_admin ja current_user_role: niitä kutsutaan rivitason käytännöistä, ja
-- ilman kutsuoikeutta anonin kysely kaatuisi oikeusvirheeseen sen sijaan että
-- palauttaisi tyhjän tuloksen. Ne palauttavat anonille false/null.
revoke execute on function public.peru_tyo(uuid, text, text) from anon;
revoke execute on function public.poista_valmis_tyo(uuid, text, text) from anon;
revoke execute on function public.palauta_tyo_keskeneraiseksi(uuid) from anon;
revoke execute on function public.arkistoi_tyo(uuid, boolean) from anon;
revoke execute on function public.korvaa_tyon_rivit(uuid, jsonb) from anon;
revoke execute on function public.haku(text, integer) from anon;
revoke execute on function public.kuukauden_kaytetyin_vari(date) from anon;
revoke execute on function public.vari_kokonaishinta(uuid) from anon;
revoke execute on function public.vari_kokonaishinta_per_kg(text, numeric, numeric, numeric, numeric) from anon;
revoke execute on function public.vari_halytysraja(uuid) from anon;
revoke execute on function public.osa_maalikustannus(uuid, uuid) from anon;
revoke execute on function public.osa_tyokustannus(uuid) from anon;
revoke execute on function public.osa_tyoaika_min(uuid) from anon;
revoke execute on function public.osa_kustannusarvio(uuid, uuid) from anon;
revoke execute on function public.osa_suositushinta(uuid, uuid) from anon;

-- Ajastettu siivous ajetaan pg_cronista tietokannan omistajana, ei koskaan
-- sovelluksesta. Sama koskee triggerifunktioita: niitä ei kutsuta suoraan.
revoke execute on function public.arkistoi_vanhat_tyot(interval) from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.tyo_valmistuu_paivita_saldo() from anon, authenticated;
revoke execute on function public.tyon_rivi_varaa_saldo() from anon, authenticated;
revoke execute on function public.varastotayennys_paivita_saldo() from anon, authenticated;
revoke execute on function public.maalaustapahtuma_paivita_saldo() from anon, authenticated;
revoke execute on function public.maalaustapahtuma_esitaytto() from anon, authenticated;
revoke execute on function public.varit_set_updated_at() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funktioiden search_path
-- ---------------------------------------------------------------------------
-- Ilman kiinnitettyä search_pathia funktio voi poimia taulun tai operaattorin
-- kutsujan skeemasta. Uusissa funktioissa se on jo asetettu; nämä ovat vanhoja.
alter function public.varit_set_updated_at() set search_path = public;
alter function public.vari_kokonaishinta_per_kg(text, numeric, numeric, numeric, numeric) set search_path = public;
alter function public.maalaustapahtuma_esitaytto() set search_path = public;
alter function public.haku(text, integer) set search_path = public;
alter function public.vari_halytysraja(uuid) set search_path = public;
alter function public.osa_tyoaika_min(uuid) set search_path = public;
alter function public.osa_tyokustannus(uuid) set search_path = public;
alter function public.osa_kustannusarvio(uuid, uuid) set search_path = public;
alter function public.osa_suositushinta(uuid, uuid) set search_path = public;
alter function public.vari_kokonaishinta(uuid) set search_path = public;
alter function public.osa_maalikustannus(uuid, uuid) set search_path = public;
alter function public.kuukauden_kaytetyin_vari(date) set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.current_user_role() set search_path = public;
