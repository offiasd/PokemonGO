-- Silmämääräinen värisävy (punainen, oranssi, ... ) värien suodatusta varten
-- Värit-sivulla. Ei koske lakkoja (tyyppi = transparent), koska ne ovat
-- kirkkaita eikä niillä ole omaa sävyä.

alter table varit
  add column varisavy text
  check (varisavy in (
    'punainen', 'oranssi', 'keltainen', 'vihrea', 'sininen', 'liila', 'pinkki',
    'musta', 'harmaa', 'valkoinen', 'hopea', 'kultainen', 'bronssi', 'ruskea'
  ));

comment on column varit.varisavy is 'Silmämääräinen värisävy suodatusta varten - admin voi asettaa/korjata värin sivulla. Ei aseteta lakoille (tyyppi = transparent).';

-- Parhaan yrityksen automaattinen päättely olemassa olevien värien nimestä -
-- sama avainsanalogiikka kuin src/lib/vakiot.ts:n paattelyVarisavy()-funktiolla,
-- jota käytetään uusia/muokattavia värejä varten lomakkeella. Admin voi
-- korjata väärät päättelyt värin sivulla milloin tahansa - tämä on vain
-- lähtöarvaus, ei lopullinen totuus.
update varit set varisavy = 'hopea'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(silver|chrome|chromium|hopea|kromi)\y';

update varit set varisavy = 'kultainen'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(gold|golden|kulta|kultainen)\y';

update varit set varisavy = 'bronssi'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(bronze|copper|pronssi|kupari|bronssi)\y';

update varit set varisavy = 'musta'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(black|musta|onyx|jet|ebony)\y';

update varit set varisavy = 'valkoinen'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(white|valkoinen|pearl|ivory)\y';

update varit set varisavy = 'harmaa'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(gr[ae]y|harmaa|graphite|gunmetal|charcoal|slate)\y';

update varit set varisavy = 'ruskea'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(brown|ruskea|chocolate|coffee|mocha|tan|chestnut|beige)\y';

update varit set varisavy = 'punainen'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(red|punainen|ruby|cherry|crimson|scarlet|maroon)\y';

update varit set varisavy = 'oranssi'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(orange|oranssi|tangerine|amber)\y';

update varit set varisavy = 'keltainen'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(yellow|keltainen|lemon|banana|sunflower)\y';

update varit set varisavy = 'vihrea'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(green|vihre[aä]|lime|emerald|olive|mint|forest)\y';

update varit set varisavy = 'sininen'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(blue|sininen|navy|azure|cobalt|teal|sky)\y';

update varit set varisavy = 'liila'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(purple|violet|liila|lilac|lavender|plum|grape)\y';

update varit set varisavy = 'pinkki'
  where varisavy is null and tyyppi <> 'transparent'
  and nimi ~* '\y(pink|pinkki|magenta|fuchsia|rose|salmon)\y';
