"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { muotoileEuro, muotoileGrammat } from "@/lib/vakiot";
import type {
  LisatoidenTulos,
  LisatyonPerusta,
  LisatyoValinta,
  VarinTiedot,
} from "@/lib/lisatyot";

/**
 * Hinta lisäysnapissa ennen kuin väriä on valittu.
 *
 * Kategoria ratkeaa vasta väristä, joten toisen hinnan näyttäminen yksin
 * olisi puolet totuudesta. Ero näytetään välinä ja yhtä suuret hinnat
 * yhtenä lukuna, jottei nappi levene turhaan.
 */
function napinHinta(p: LisatyonPerusta): string {
  return p.hinta_perusvari_eur === p.hinta_erikoisvari_eur
    ? muotoileEuro(p.hinta_perusvari_eur)
    : `${muotoileEuro(p.hinta_perusvari_eur)}\u2013${muotoileEuro(p.hinta_erikoisvari_eur)}`;
}

/**
 * Lisätyöt työn rivillä.
 *
 * Laskenta on kokonaan lib/lisatyot.ts-moduulissa; tämä näyttää sen tuloksen
 * ja kerää valinnat. Automaattiset rivit tulevat samasta tuloksesta eivätkä
 * ole käyttäjän lisäämiä - ne merkitään erikseen, jotta käyttäjä näkee mitä
 * sovellus päätteli.
 */
export function LisatyotRivilla({
  perustat,
  varit,
  valinnat,
  tulos,
  pohjavariVaihtoehdot,
  lakkaVaihtoehdot,
  pohjavariId,
  lakkaId,
  oletusPohjavariId,
  oletusLakkaId,
  onLisaa,
  onPoista,
  onMuuta,
  onVaihdaPohjavari,
  onVaihdaLakka,
}: {
  perustat: LisatyonPerusta[];
  varit: VarinTiedot[];
  valinnat: LisatyoValinta[];
  tulos: LisatoidenTulos;
  pohjavariVaihtoehdot: VarinTiedot[];
  lakkaVaihtoehdot: VarinTiedot[];
  pohjavariId: string | null;
  lakkaId: string | null;
  oletusPohjavariId: string | null;
  oletusLakkaId: string | null;
  onLisaa: (lisatyoId: string) => void;
  onPoista: (avain: string) => void;
  onMuuta: (avain: string, muutos: Partial<Omit<LisatyoValinta, "avain">>) => void;
  onVaihdaPohjavari: (variId: string) => void;
  onVaihdaLakka: (variId: string) => void;
}) {
  if (perustat.length === 0) return null;

  const perusta = (id: string) => perustat.find((p) => p.lisatyo_id === id);
  const automaattiset = tulos.rivit.filter((r) => r.automaattinen !== null);

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Label className="text-sm">Lisätyöt</Label>
        {tulos.hinnatYhteensaEur > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            +{muotoileEuro(tulos.hinnatYhteensaEur)}
          </span>
        )}
      </div>

      {/* Vain tälle osalle määritellyt: ei valikkoa jossa on kaikki mahdolliset. */}
      <div className="flex flex-wrap gap-1.5">
        {perustat.map((p) => (
          <Button
            key={p.lisatyo_id}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-w-0 max-w-full"
            onClick={() => onLisaa(p.lisatyo_id)}
          >
            <Plus className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">{p.nimi}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {napinHinta(p)}
            </span>
          </Button>
        ))}
      </div>

      {valinnat.map((valinta) => {
        const p = perusta(valinta.lisatyoId);
        if (!p) return null;
        const laskettu = tulos.rivit.find((r) => r.avain === valinta.avain);
        return (
          <div key={valinta.avain} className="grid gap-2 rounded-md border bg-muted/40 p-2">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.nimi}</div>
                {laskettu && (
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {muotoileGrammat(laskettu.kulutusG)} · {muotoileEuro(laskettu.hintaEur)}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => onPoista(valinta.avain)}
                aria-label={`Poista ${p.nimi}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
              <div className="grid min-w-0 gap-1">
                <Label htmlFor={`lisatyo-vari-${valinta.avain}`} className="text-xs">
                  Väri
                </Label>
                <Select
                  value={valinta.variId}
                  onValueChange={(v) => onMuuta(valinta.avain, { variId: v })}
                >
                  <SelectTrigger
                    id={`lisatyo-vari-${valinta.avain}`}
                    className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate"
                  >
                    <SelectValue placeholder="Valitse väri" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(20rem,calc(100vw-2rem))]">
                    {varit.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        <span className="min-w-0 truncate">{v.nimi}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Jaolla ei ole kappalemäärää: se jakaa osan pintaa, ei lisää sitä. */}
              {p.on_jako ? (
                <div className="grid min-w-0 gap-1">
                  <Label htmlFor={`lisatyo-osuus-${valinta.avain}`} className="text-xs">
                    Osuus %
                  </Label>
                  <Input
                    id={`lisatyo-osuus-${valinta.avain}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    className="w-full min-w-0 tabular-nums"
                    value={String(valinta.osuusProsentti)}
                    onChange={(e) =>
                      onMuuta(valinta.avain, { osuusProsentti: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              ) : (
                <div className="grid min-w-0 gap-1">
                  <Label htmlFor={`lisatyo-maara-${valinta.avain}`} className="text-xs">
                    Määrä
                  </Label>
                  <Input
                    id={`lisatyo-maara-${valinta.avain}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="w-full min-w-0 tabular-nums"
                    value={String(valinta.maara)}
                    onChange={(e) => onMuuta(valinta.avain, { maara: Number(e.target.value) || 1 })}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Perusvärin osuus on jäännös, ei säädettävä kenttä: muuten summa voisi
          ylittää sadan. */}
      {tulos.perusvarinOsuus < 100 && (
        <div className="flex min-w-0 justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">Perusväri, jäljelle jäävä osuus</span>
          <span className="shrink-0 tabular-nums">
            {tulos.perusvarinOsuus} % · {muotoileGrammat(tulos.perusvarinKulutusG)}
          </span>
        </div>
      )}

      {automaattiset.map((rivi) => {
        const onLakka = rivi.automaattinen === "lakka";
        const vaihtoehdot = onLakka ? lakkaVaihtoehdot : pohjavariVaihtoehdot;
        const valittu = onLakka ? lakkaId : pohjavariId;
        const oletus = onLakka ? oletusLakkaId : oletusPohjavariId;
        return (
          <div key={rivi.avain} className="grid gap-2 rounded-md border border-dashed p-2">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm">{rivi.nimi}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {muotoileGrammat(rivi.kulutusG)}
                {rivi.hintaEur > 0 && ` · ${muotoileEuro(rivi.hintaEur)}`}
              </span>
            </div>
            <div className="grid min-w-0 gap-1">
              <Select
                value={valittu ?? ""}
                onValueChange={onLakka ? onVaihdaLakka : onVaihdaPohjavari}
              >
                <SelectTrigger
                  className="w-full min-w-0 [&>span]:min-w-0 [&>span]:truncate"
                  aria-label={rivi.nimi}
                >
                  <SelectValue placeholder="Valitse väri" />
                </SelectTrigger>
                <SelectContent className="max-w-[min(20rem,calc(100vw-2rem))]">
                  {vaihtoehdot.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="min-w-0 truncate">{v.nimi}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {valittu && oletus && valittu !== oletus ? (
                  <>
                    Vaihdettu ·{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => (onLakka ? onVaihdaLakka(oletus) : onVaihdaPohjavari(oletus))}
                    >
                      palauta oletus
                    </button>
                  </>
                ) : (
                  "Automaattinen, oletus asetuksista"
                )}
              </span>
            </div>
          </div>
        );
      })}

      {tulos.varoitukset.length > 0 && (
        <ul className="grid gap-1.5">
          {tulos.varoitukset.map((v, i) => (
            <li
              key={`${v.laji}-${i}`}
              className="flex min-w-0 gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100"
            >
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0 wrap-anywhere">{v.viesti}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Kulutus väreittäin, ei yhtenä lukuna: käyttäjän on nähtävä mikä väri
          loppuu ja mitkä grammat sovellus lisäsi itse. */}
      {tulos.varienKulutus.length > 1 && (
        <div className="grid gap-1 border-t pt-2">
          {/* Merkintä omalle rivilleen: värinimen perässä se leikkautuisi pois
              320 pikselin leveydellä, ja juuri se erottaa sovelluksen
              päättelemät grammat käyttäjän valitsemista. */}
          {tulos.varienKulutus.map((k) => (
            <div key={k.variId} className="grid min-w-0 gap-0.5 text-xs">
              <div className="flex min-w-0 justify-between gap-2">
                <span className="min-w-0 truncate">{k.variNimi}</span>
                <span className="shrink-0 tabular-nums">{muotoileGrammat(k.kulutusG)}</span>
              </div>
              {k.automaattinen && <span className="text-muted-foreground">automaattinen</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
