-- Peruutukselle syy.
--
-- Peruminen poistaa työn kokonaan, joten syyllä pitää olla oma paikkansa:
-- muuten tieto katoaisi samalla sekunnilla kun se kirjattiin. Loki säilyttää
-- senkin jälkeen mitä peruttiin, miksi ja kuka.
--
-- Rivi ei viittaa tyot-tauluun (työ on poistettu), joten asiakas ja aloitusaika
-- kopioidaan mukaan. Näin loki on luettavissa yksinään.

create table tyon_peruutukset (
  id uuid primary key default gen_random_uuid(),
  tyo_id uuid not null,
  asiakas text,
  aloitettu timestamptz,
  syy text not null check (syy in ('asiakas', 'virhe', 'muu')),
  tarkennus text,
  perui_id uuid references profiles(id),
  peruttu timestamptz not null default now(),
  -- Pelkkä "muu" ei kerro mitään, joten siinä vapaa teksti on pakollinen.
  constraint tarkennus_pakollinen_muulle
    check (syy <> 'muu' or coalesce(btrim(tarkennus), '') <> '')
);

create index tyon_peruutukset_peruttu_idx on tyon_peruutukset (peruttu desc);

alter table tyon_peruutukset enable row level security;

create policy "Kirjautuneet lukevat peruutukset" on tyon_peruutukset
  for select using (auth.role() = 'authenticated');
create policy "Admin muokkaa peruutuksia" on tyon_peruutukset
  for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin poistaa peruutuksia" on tyon_peruutukset
  for delete using (public.is_admin());
-- Lisäyskäytäntöä ei ole tarkoituksella: rivit syntyvät vain alla olevan
-- peru_tyo-funktion kautta, jolloin lokiin ei voi kirjata perumatta työtä.

comment on table tyon_peruutukset is
  'Loki perutuista töistä: syy, mahdollinen tarkennus, perujaa ja ajankohta. Työ itse on poistettu, joten asiakas ja aloitusaika on kopioitu riville.';

-- Lokitus ja poisto samassa transaktiossa.
--
-- Kahtena erillisenä kutsuna sovelluksesta lopputulos jäisi puolitiehen:
-- epäonnistunut poisto jättäisi lokiin perumattoman työn, ja epäonnistunut
-- lokitus poistaisi työn ilman syytä. Siksi kantafunktio.
create function public.peru_tyo(p_tyo_id uuid, p_syy text, p_tarkennus text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tyo tyot%rowtype;
  v_tarkennus text := nullif(btrim(p_tarkennus), '');
begin
  -- for update lukitsee työn, jottei kaksi yhtäaikaista perumista kirjaisi
  -- kahta lokiriviä samasta työstä.
  select * into v_tyo from tyot where id = p_tyo_id for update;

  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila = 'valmis' then
    raise exception 'Valmista työtä ei voi perua.';
  end if;
  if p_syy is null or p_syy not in ('asiakas', 'virhe', 'muu') then
    raise exception 'Valitse peruutuksen syy.';
  end if;
  if p_syy = 'muu' and v_tarkennus is null then
    raise exception 'Kirjoita peruutuksen syy.';
  end if;

  insert into tyon_peruutukset (tyo_id, asiakas, aloitettu, syy, tarkennus, perui_id)
  values (v_tyo.id, v_tyo.asiakas, v_tyo.aloitettu, p_syy, v_tarkennus, auth.uid());

  -- Rivit poistuvat kaskadina ja rivitriggeri vapauttaa varaukset varastoon.
  delete from tyot where id = p_tyo_id;
end;
$$;

comment on function public.peru_tyo(uuid, text, text) is
  'Peruu keskeneräisen työn: kirjaa syyn tyon_peruutukset-lokiin ja poistaa työn samassa transaktiossa. Varaukset vapautuvat rivitriggerin kautta.';

-- security definer ohittaa RLS:n, joten oikeudet tarkistetaan
-- sovelluskerroksessa kuten työn aloituksessa ja muokkauksessa.
revoke all on function public.peru_tyo(uuid, text, text) from public;
grant execute on function public.peru_tyo(uuid, text, text) to authenticated;

-- Suora poisto ei enää käy: se ohittaisi lokituksen. Perumisen kulkiessa
-- funktion kautta kirjautuneet eivät tarvitse omaa poistokäytäntöä, joten
-- edellisen migraation käytäntö poistuu. Admin-käytäntö jää voimaan.
drop policy if exists "Kirjautuneet poistavat keskeneräisiä töitä" on tyot;
