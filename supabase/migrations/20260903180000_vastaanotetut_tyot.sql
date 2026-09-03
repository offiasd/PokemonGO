-- Vastaanotetut työt: osat on tuotu maalaamolle ja työstä on sovittu, mutta
-- maalaus ei ole vielä alkanut.
--
-- Maali varataan jo vastaanotettaessa, koska varaus on lupaus asiakkaalle:
-- sovittua väriä ei saa kuluttaa toiseen työhön. Varaus syntyy rivitriggerissä
-- (tyon_rivi_varaa_saldo) heti kun työn rivit luodaan, joten tilan lisääminen
-- riittää - erillistä varauslogiikkaa ei tarvita.
--
-- Työn kulku: vastaanotettu -> vaiheessa -> valmis. Peruminen onnistuu
-- kummastakin keskeneräisestä tilasta, koska peru_tyo estää vain valmiin työn.

alter table public.tyot drop constraint if exists tyot_tila_check;
alter table public.tyot
  add constraint tyot_tila_check check (tila in ('vastaanotettu', 'vaiheessa', 'valmis'));

-- aloitettu on työn kirjausaika (vastaanotetulla se on vastaanottohetki, josta
-- kiireellisyys lasketaan). tyo_aloitettu kertoo milloin maalaus oikeasti
-- alkoi, jotta odotusaika ja työn kesto eivät sekoitu keskenään.
alter table public.tyot
  add column if not exists tyo_aloitettu timestamptz,
  add column if not exists vastaanotti_id uuid references public.profiles (id);

update public.tyot set tyo_aloitettu = aloitettu where tyo_aloitettu is null;

comment on column public.tyot.aloitettu is
  'Työn kirjausaika. Vastaanotetulla työllä tämä on vastaanottohetki.';
comment on column public.tyot.tyo_aloitettu is
  'Milloin maalaus aloitettiin (tila vaihtui vaiheessa-tilaan).';
comment on column public.tyot.vastaanotti_id is
  'Kuka kirjasi työn vastaanotetuksi.';
comment on table public.tyot is
  'Työt (asiakastyöt): kattaa yhden tai useamman osan + värit. Vastaanotettu ja vaiheessa = maali varattu varastosta; valmis = maali kulutettu oikeasti.';

-- ---------------------------------------------------------------------------
-- Kiireellisyyden rajat
-- ---------------------------------------------------------------------------
-- Vastaanotettu työ näytetään värikoodattuna: vihreä kun aikaa on, keltainen
-- kun raja lähestyy ja punainen kun se on ylitetty. Rajat ovat maalaamon oma
-- lupaus asiakkaalle, joten admin asettaa ne itse.
alter table public.asetukset
  add column if not exists vastaanotto_varoitus_paivat integer not null default 3,
  add column if not exists vastaanotto_kriittinen_paivat integer not null default 7;

comment on column public.asetukset.vastaanotto_varoitus_paivat is
  'Monenko päivän jälkeen vastaanotettu työ merkitään kiireelliseksi (keltainen).';
comment on column public.asetukset.vastaanotto_kriittinen_paivat is
  'Monenko päivän jälkeen vastaanotettu työ on myöhässä (punainen).';

-- ---------------------------------------------------------------------------
-- Työn aloitus
-- ---------------------------------------------------------------------------
-- Aloittaja merkitään vasta tässä: vastaanottaja ja maalaaja ovat usein eri
-- henkilö, ja töiden listassa halutaan tietää kumpi teki kumman.
create or replace function public.aloita_vastaanotettu_tyo(p_tyo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tila text;
begin
  select tila into v_tila from public.tyot where id = p_tyo_id for update;

  if v_tila is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tila <> 'vastaanotettu' then
    raise exception 'Vain vastaanotetun työn voi aloittaa.';
  end if;

  update public.tyot
  set tila = 'vaiheessa',
      tyo_aloitettu = now(),
      aloitti_id = coalesce(auth.uid(), aloitti_id)
  where id = p_tyo_id;
end;
$$;

comment on function public.aloita_vastaanotettu_tyo(uuid) is
  'Siirtää vastaanotetun työn maalaukseen ja merkitsee aloittajaksi kutsujan.';

revoke all on function public.aloita_vastaanotettu_tyo(uuid) from public, anon;
grant execute on function public.aloita_vastaanotettu_tyo(uuid) to authenticated;
