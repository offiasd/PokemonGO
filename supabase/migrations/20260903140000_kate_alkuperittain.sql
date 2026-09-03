-- Erillinen kate-% EU:n ulkopuolelta tilatuille väreille.
--
-- USA-jauheiden tilaaminen on työläämpää ja kalliimpaa kuin EU:sta tilaaminen,
-- joten sama kate-% ei kata samaa vaivaa. Ostohinnan erot (rahti, tulli,
-- maahantuonnin ALV) näkyvät jo värin kokonaishinnassa; tämä on se katteen
-- osuus, joka jää muuten huomiotta.
--
-- Kate valitaan työssä käytetyn värin alkuperän mukaan. Jos työssä on kaksi
-- väriä (candy + pohjaväri, metallic/solid + lakka) ja jompikumpi on EU:n
-- ulkopuolelta, käytetään ei-EU-katetta: tilaamisen vaiva ei puolitu siitä
-- että toinen kerros sattuu olemaan EU-väri.
--
-- Osan oma kate_prosentti ohittaa edelleen molemmat.

alter table public.asetukset
  add column if not exists kate_prosentti_ei_eu_oletus numeric(5, 2) not null default 30;

-- Nykyinen kate kopioidaan uudelle sarakkeelle, jotta hinnat eivät muutu
-- ennen kuin admin asettaa ei-EU-katteen itse.
update public.asetukset set kate_prosentti_ei_eu_oletus = kate_prosentti_oletus;

comment on column public.asetukset.kate_prosentti_oletus is
  'Kate-% EU:sta tilatuille väreille (osan suositushinta).';
comment on column public.asetukset.kate_prosentti_ei_eu_oletus is
  'Kate-% EU:n ulkopuolelta tilatuille väreille (USA/muu).';

-- ---------------------------------------------------------------------------
-- Katteen valinta
-- ---------------------------------------------------------------------------
create or replace function public.osan_kate(
  p_osa_id uuid,
  p_vari_id uuid default null,
  p_toinen_vari_id uuid default null
)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
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
  from osat o, asetukset a
  where o.id = p_osa_id;
$$;

comment on function public.osan_kate(uuid, uuid, uuid) is
  'Osan kate-%: osakohtainen ylikirjoitus, muuten värin alkuperän mukainen oletus.';

create or replace function public.osa_suositushinta(p_osa_id uuid, p_vari_id uuid default null)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    o.manuaalinen_hinta,
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

revoke all on function public.osan_kate(uuid, uuid, uuid) from public, anon;
grant execute on function public.osan_kate(uuid, uuid, uuid) to authenticated;
