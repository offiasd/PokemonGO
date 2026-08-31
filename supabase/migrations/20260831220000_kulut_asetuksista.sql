-- Toimituskulu, tullimaksu ja ALV eivät ole enää värikohtaisia: ne tulevat
-- aina Asetukset-sivun arvoista ja lisätään värin hintaan automaattisesti
-- (vari_kokonaishinta-funktio hakee ne coalescella asetuksista kun värin oma
-- arvo on null). Kentät on poistettu värin lomakkeelta, joten vanhat
-- värikohtaiset ylikirjoitukset tyhjennetään - muuten osa väreistä jäisi
-- käyttämään vanhoja arvoja ilman mitään tapaa muokata niitä käyttöliittymästä.

update varit
set tullimaksu_prosentti = null,
    alv_prosentti = null,
    toimituskulu_per_kg = null
where tullimaksu_prosentti is not null
   or alv_prosentti is not null
   or toimituskulu_per_kg is not null;

comment on column varit.tullimaksu_prosentti is 'Vanhentunut - tulli tulee aina asetuksista (asetukset.tullimaksu_prosentti_oletus). Säilytetty vari_kokonaishinta-funktion coalescea varten.';
comment on column varit.alv_prosentti is 'Vanhentunut - ALV tulee aina asetuksista (asetukset.alv_prosentti_oletus). Säilytetty vari_kokonaishinta-funktion coalescea varten.';
comment on column varit.toimituskulu_per_kg is 'Vanhentunut - toimituskulu tulee aina asetuksista alkuperän mukaan. Säilytetty vari_kokonaishinta-funktion coalescea varten.';
