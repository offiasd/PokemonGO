-- Pohjaväri-/lakkavaatimus ei ole enää erikseen asetettava tieto, vaan se
-- johdetaan maalityypistä ja näytetään värin sivulla automaattisesti:
--   candy    -> vaatii aina pohjavärin (yleisimmin Super Chrome)
--   illusion -> vaatii aina lakan aktivoituakseen
--   metallic -> vaatii lakkauksen UV-suojaksi
-- Kytkin ja vapaa tekstikenttä on poistettu värin lomakkeelta, joten vanhat
-- käsin syötetyt arvot normalisoidaan tyypin mukaisiksi - muuten osalla
-- väreistä näkyisi vanha teksti ilman tapaa muokata sitä.

update varit
set vaatii_pohjavarin = (tyyppi = 'candy'),
    pohjavari_kuvaus = case tyyppi
      when 'candy' then 'Candy vaatii aina pohjavärin - yleisimmin Super Chrome.'
      when 'illusion' then 'Illusion vaatii aina lakan aktivoituakseen.'
      when 'metallic' then 'Metallic vaatii lakkauksen UV-suojaksi.'
      else null
    end;

comment on column varit.vaatii_pohjavarin is 'Johdetaan maalityypistä (candy = true). Ei asetettavissa käyttöliittymästä.';
comment on column varit.pohjavari_kuvaus is 'Johdetaan maalityypistä (candy/illusion/metallic). Ei asetettavissa käyttöliittymästä - ks. lib/vakiot.ts varinLisavaatimus().';
