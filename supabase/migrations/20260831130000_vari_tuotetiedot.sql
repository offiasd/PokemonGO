-- Laajennus "Hae tiedot" -toiminnolle: väreille lisätään kiiltoaste, tyyppi,
-- pohjavärivaatimus sekä alkuperäisen (skreipatun) hinnan tiedot. Lisäksi
-- toimituskulu_per_kg muuttuu nullableksi (null = käytä asetusten
-- alkuperäkohtaista oletusta, samaan tapaan kuin tullimaksu/alv/hälytysraja).

alter table varit
  add column kiiltoaste text,
  add column tyyppi text not null default 'solid'
    check (tyyppi in ('solid', 'transparent', 'candy', 'illusion', 'metallic', 'muu')),
  add column vaatii_pohjavarin boolean not null default false,
  add column pohjavari_kuvaus text,
  add column alkuperainen_hinta numeric(10, 2),
  add column alkuperainen_valuutta text,
  add column alkuperainen_yksikko text;

comment on column varit.tyyppi is 'Maalityyppi: solid/transparent/candy/illusion/metallic/muu.';
comment on column varit.vaatii_pohjavarin is 'Tarvitseeko väri pohjavärin (esim. candy/illusion/transparent-tyypit).';
comment on column varit.pohjavari_kuvaus is 'Suositeltu pohjaväri/topcoat-kuvaus - täytetään automaattisesti "Hae tiedot" -toiminnolla, aina muokattavissa.';
comment on column varit.alkuperainen_hinta is 'Valmistajan sivulta haettu alkuperäinen yksikköhinta ennen muunnoksia (audit-tieto).';
comment on column varit.alkuperainen_valuutta is 'Alkuperäisen hinnan valuutta (esim. USD).';
comment on column varit.alkuperainen_yksikko is 'Alkuperäisen hinnan yksikkö (esim. lb).';

alter table varit alter column toimituskulu_per_kg drop not null;
alter table varit alter column toimituskulu_per_kg drop default;

comment on column varit.toimituskulu_per_kg is 'Väriä koskeva ylikirjoitus; null = käytä alkuperän mukaista asetukset.toimituskulu_per_kg_*_oletus-arvoa.';

-- =========================================================================
-- Asetukset: yrityksen osoite (toimitusarvion kohdeosoite) + toimituskulun
-- oletusarvot alkuperittäin (EU/USA/muu). Ei live-hakua myyjän sivulta -
-- admin ylläpitää arvioidut kulut itse painoluokan/alkuperän mukaan.
-- =========================================================================

alter table asetukset
  add column yrityksen_osoite text,
  add column toimituskulu_per_kg_eu_oletus numeric(10, 2) not null default 0,
  add column toimituskulu_per_kg_usa_oletus numeric(10, 2) not null default 0,
  add column toimituskulu_per_kg_muu_oletus numeric(10, 2) not null default 0;

comment on column asetukset.yrityksen_osoite is 'Yrityksen toimitusosoite - käytetään toimituskuluarvioiden kohdeosoitteena.';
comment on column asetukset.toimituskulu_per_kg_eu_oletus is 'Oletustoimituskulu €/kg EU-alkuperän väreille, kun väriltä puuttuu ylikirjoitus.';
comment on column asetukset.toimituskulu_per_kg_usa_oletus is 'Oletustoimituskulu €/kg USA-alkuperän väreille, kun väriltä puuttuu ylikirjoitus.';
comment on column asetukset.toimituskulu_per_kg_muu_oletus is 'Oletustoimituskulu €/kg muun alkuperän väreille, kun väriltä puuttuu ylikirjoitus.';

-- vari_kokonaishinta: toimituskulu_per_kg voi nyt olla null -> käytetään
-- alkuperän mukaista oletusta asetuksista (sama malli kuin tulli/alv).
create or replace function public.vari_kokonaishinta(p_vari_id uuid)
returns numeric
language sql
stable
as $$
  select public.vari_kokonaishinta_per_kg(
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
  from varit v, asetukset a
  where v.id = p_vari_id;
$$;
