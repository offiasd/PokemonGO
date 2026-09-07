-- Hintaa laskevat funktiot adminin oikeuksin.
--
-- Edellinen migraatio perui EXECUTE-oikeudet authenticated-roolilta. Se
-- osoittautui liian tylpäksi kahdesta syystä:
--
--   1. Admin on samaa authenticated-roolia kuin maalaaja, joten peruminen vei
--      oikeuden myös adminilta.
--   2. Funktion EXECUTE-oikeus tarkistetaan aina kutsujaa vastaan - myös
--      silloin kun kutsu tulee omistajan oikeuksin ajettavasta näkymästä.
--      Niinpä tyojen_talous ja maalinkulutus_raportoituna kaatuivat.
--
-- Oikea tapa: funktiot ajetaan omistajan oikeuksin ja ne tarkistavat itse
-- roolin. Maalaajalle ne palauttavat NULL, eivät virhettä - näkymä voi siis
-- kutsua niitä riveille joita maalaaja saa muuten katsoa.

create or replace function public.vari_kokonaishinta(p_vari_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_admin() then
    public.vari_kokonaishinta_per_kg(
      v.alkupera,
      v.ostohinta_per_kg,
      coalesce(v.tullimaksu_prosentti, a.tullimaksu_prosentti_oletus),
      coalesce(v.alv_prosentti, a.alv_prosentti_oletus),
      coalesce(
        v.toimituskulu_per_kg,
        case v.alkupera
          when 'EU' then a.toimituskulu_per_kg_eu_oletus
          when 'USA' then a.toimituskulu_per_kg_usa_oletus
          else a.toimituskulu_per_kg_muu_oletus
        end
      )
    )
  end
  from varit v, asetukset a
  where v.id = p_vari_id;
$$;

comment on function public.vari_kokonaishinta(uuid) is
  'Värin kokonaishinta €/kg. NULL muille kuin adminille.';

create or replace function public.osa_tyokustannus(p_osa_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_admin() then
    coalesce(sum(
      (ot.arvioitu_kesto_min / 60.0) *
      coalesce(
        (select t.tuntihinta from tuntiveloitukset t where t.vaihe = ot.vaihe),
        (select yleinen_tuntihinta from asetukset limit 1)
      )
    ), 0)
  end
  from osa_tyovaiheet ot
  where ot.osa_id = p_osa_id and ot.tarvitaan;
$$;

comment on function public.osa_tyokustannus(uuid) is
  'Osan työkustannus tuntiveloituksista. NULL muille kuin adminille.';

create or replace function public.osa_maalikustannus(p_osa_id uuid, p_vari_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when not public.is_admin() then null
              when p_vari_id is null then 0
         else round((coalesce(o.arvioitu_kulutus_g, 0) / 1000.0) * public.vari_kokonaishinta(p_vari_id), 2)
    end
  from osat o
  where o.id = p_osa_id;
$$;

create or replace function public.osan_kate(
  p_osa_id uuid,
  p_vari_id uuid default null,
  p_toinen_vari_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_admin() then
    coalesce(
      o.kate_prosentti,
      case
        when exists (
          select 1 from varit v
          where v.id in (p_vari_id, p_toinen_vari_id) and v.alkupera <> 'EU'
        )
        then a.kate_prosentti_ei_eu_oletus
        else a.kate_prosentti_oletus
      end
    )
  end
  from osat o, asetukset a
  where o.id = p_osa_id;
$$;

-- Nämä kaksi rakentuvat edellisistä, joten roolitarkistus tulee niiden kautta.
-- security definer silti, jotta sisäkkäiset kutsut menevät läpi ilman että
-- kutsujalle tarvitsee myöntää EXECUTE jokaiseen välivaiheeseen.
create or replace function public.osa_kustannusarvio(p_osa_id uuid, p_vari_id uuid default null)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select round(
    public.osa_maalikustannus(p_osa_id, p_vari_id) + public.osa_tyokustannus(p_osa_id),
    2
  );
$$;

create or replace function public.osa_suositushinta(p_osa_id uuid, p_vari_id uuid default null)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    case when public.is_admin() then o.manuaalinen_hinta end,
    round(
      public.osa_kustannusarvio(p_osa_id, p_vari_id) *
      (1 + public.osan_kate(p_osa_id, p_vari_id) / 100.0)
      + coalesce(o.kate_kiintea, 0),
      2
    )
  )
  from osat o
  where o.id = p_osa_id;
$$;

-- Kutsuoikeus takaisin: rajaus on nyt funktion sisällä, ei ACL:ssä.
grant execute on function public.vari_kokonaishinta(uuid) to authenticated;
grant execute on function public.osa_tyokustannus(uuid) to authenticated;
grant execute on function public.osa_maalikustannus(uuid, uuid) to authenticated;
grant execute on function public.osan_kate(uuid, uuid, uuid) to authenticated;
grant execute on function public.osa_kustannusarvio(uuid, uuid) to authenticated;
grant execute on function public.osa_suositushinta(uuid, uuid) to authenticated;

-- Raaka laskukaava ottaa hinnat argumentteina eikä lue mitään, joten se ei
-- vuoda mitään - mutta sitä ei myöskään tarvita sovelluksesta.
revoke execute on function public.vari_kokonaishinta_per_kg(text, numeric, numeric, numeric, numeric) from anon;
