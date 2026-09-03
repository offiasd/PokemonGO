/**
 * Rakentaa PostgRESTin or()-hakuehdon vapaasta hakusanasta.
 *
 * Hakuehto on merkkijono, jossa pilkku erottaa ehdot ja sulkeet ryhmittelevät.
 * Jos käyttäjän kirjoittama sana sijoitetaan siihen sellaisenaan, pilkku tai
 * sulje muuttaa lausekkeen rakennetta - haku "a,b" kaatoi kyselyn virheeseen.
 * Arvo lainataan, ja lainausmerkit sekä kenoviivat suojataan.
 */
export function ilikeHakuehto(kentat: string[], hakusana: string): string {
  const suojattu = hakusana.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return kentat.map((kentta) => `${kentta}.ilike."%${suojattu}%"`).join(",");
}
