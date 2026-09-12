"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, PackageMinus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { muotoileEuro } from "@/lib/vakiot";

import { kirjaaLuovutus, muokkaaKalusto, peruLuovutus, poistaKalusto } from "./actions";

export interface KalustoListalla {
  id: string;
  nimi: string;
  kuvaus: string | null;
  hankittu: string;
  hankintamenoEur: number;
  muistiinpano: string | null;
  luovutettu: string | null;
  luovutushintaEur: number | null;
  /** Kuitilta siirretyn rivin alkuperäinen bruttosumma, vertailuksi. */
  kuitinBruttoEur: number | null;
}

type Dialogi = "muokkaus" | "luovutus" | "poisto";

function paiva(arvo: string): string {
  return new Date(arvo).toLocaleDateString("fi-FI");
}

function luku(arvo: string): number {
  return Number(arvo.replace(",", "."));
}

/**
 * Kalustorekisterin lista.
 *
 * Käytössä olevat ja luovutetut erikseen: ne ovat eri asioita laskennan
 * kannalta, ja sekaisin lueteltuina luovutettu näyttää yhä omaisuudelta.
 *
 * Luovutus ja poisto ovat eri toimintoja tarkoituksella. Luovutettu työkalu
 * pysyy rekisterissä ja sen luovutushinta vähennetään menojäännöksestä;
 * poistettu katoaa laskennasta kokonaan. Yhdessä lomakkeessa ne sekoittuisivat.
 */
export function KalustoLista({ rivit }: { rivit: KalustoListalla[] }) {
  const router = useRouter();
  const [avoin, setAvoin] = useState<KalustoListalla | null>(null);
  const [dialogi, setDialogi] = useState<Dialogi>("muokkaus");
  const [kesken, aja] = useTransition();

  // Muokkauksen kentät
  const [nimi, setNimi] = useState("");
  const [hankittu, setHankittu] = useState("");
  const [hinta, setHinta] = useState("");
  const [muistiinpano, setMuistiinpano] = useState("");

  // Luovutuksen kentät
  const [luovutuspaiva, setLuovutuspaiva] = useState("");
  const [luovutushinta, setLuovutushinta] = useState("");

  function avaa(rivi: KalustoListalla, mika: Dialogi) {
    setAvoin(rivi);
    setDialogi(mika);
    setNimi(rivi.nimi);
    setHankittu(rivi.hankittu);
    setHinta(String(rivi.hankintamenoEur));
    setMuistiinpano(rivi.muistiinpano ?? "");
    setLuovutuspaiva(rivi.luovutettu ?? new Date().toISOString().slice(0, 10));
    setLuovutushinta(rivi.luovutushintaEur === null ? "" : String(rivi.luovutushintaEur));
  }

  function suorita(tehtava: () => Promise<void>, viesti: string) {
    aja(async () => {
      try {
        await tehtava();
        setAvoin(null);
        toast.success(viesti);
        router.refresh();
      } catch (virhe) {
        toast.error(virhe instanceof Error ? virhe.message : "Toiminto epäonnistui.");
      }
    });
  }

  const kaytossa = rivit.filter((r) => r.luovutettu === null);
  const luovutetut = rivit.filter((r) => r.luovutettu !== null);

  function Rivi({ rivi }: { rivi: KalustoListalla }) {
    return (
      <div className="grid gap-1 border-t pt-3 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          {/* Kuitilta tulleet nimet ovat pitkiä ja katkeamattomia. */}
          <span className="min-w-0 font-medium wrap-anywhere">{rivi.nimi}</span>
          <span className="font-medium tabular-nums">{muotoileEuro(rivi.hankintamenoEur)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {paiva(rivi.hankittu)}
          {rivi.luovutettu && (
            <>
              {" · luovutettu "}
              {paiva(rivi.luovutettu)}
              {rivi.luovutushintaEur !== null && ` · ${muotoileEuro(rivi.luovutushintaEur)}`}
            </>
          )}
          {rivi.kuitinBruttoEur !== null && ` · kuitilta ${muotoileEuro(rivi.kuitinBruttoEur)} brutto`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => avaa(rivi, "muokkaus")}>
            <Pencil className="size-4" />
            Muokkaa
          </Button>
          {rivi.luovutettu === null ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => avaa(rivi, "luovutus")}
            >
              <PackageMinus className="size-4" />
              Merkitse myydyksi
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={kesken}
              onClick={() =>
                suorita(() => peruLuovutus(rivi.id), "Luovutus peruttu.")
              }
            >
              <RotateCcw className="size-4" />
              Peru luovutus
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => avaa(rivi, "poisto")}
          >
            <Trash2 className="size-4" />
            Poista
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {rivit.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ei kalustoa. Yli 1 200 euron hankinnan voi siirtää kuitin riviltä tai lisätä käsin.
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-sm font-medium">Käytössä ({kaytossa.length})</p>
            {kaytossa.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ei käytössä olevaa kalustoa.</p>
            ) : (
              <div className="grid gap-2">
                {kaytossa.map((rivi) => (
                  <Rivi key={rivi.id} rivi={rivi} />
                ))}
              </div>
            )}
          </div>

          {luovutetut.length > 0 && (
            <div className="grid gap-2 border-t pt-4">
              <p className="text-sm font-medium">Luovutetut ({luovutetut.length})</p>
              <p className="text-xs text-muted-foreground">
                Pysyvät rekisterissä: luovutushinta on vähennetty luovutusvuoden
                menojäännöksestä.
              </p>
              <div className="grid gap-2 text-muted-foreground">
                {luovutetut.map((rivi) => (
                  <Rivi key={rivi.id} rivi={rivi} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={avoin !== null} onOpenChange={(auki) => !auki && setAvoin(null)}>
        <DialogContent>
          {dialogi === "muokkaus" && (
            <>
              <DialogHeader>
                <DialogTitle>Muokkaa hankintaa</DialogTitle>
                <DialogDescription>
                  Muutos laskee poistolaskelman uudelleen. Jos hankintapäivä siirtyy toiselle
                  vuodelle, molemmat vuodet päivittyvät.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="muokkaa_nimi">Nimi</Label>
                  <Input
                    id="muokkaa_nimi"
                    value={nimi}
                    onChange={(e) => setNimi(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="muokkaa_hankittu">Hankittu</Label>
                    <Input
                      id="muokkaa_hankittu"
                      type="date"
                      value={hankittu}
                      onChange={(e) => setHankittu(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="muokkaa_hinta">Hankintameno € (ALV 0 %)</Label>
                    <Input
                      id="muokkaa_hinta"
                      type="number"
                      min="0"
                      step="0.01"
                      value={hinta}
                      onChange={(e) => setHinta(e.target.value)}
                    />
                    {avoin?.kuitinBruttoEur !== null && avoin?.kuitinBruttoEur !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Kuitilla {muotoileEuro(avoin.kuitinBruttoEur)} brutto. Tähän veroton
                        summa.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="muokkaa_muistiinpano">Muistiinpano</Label>
                  <Input
                    id="muokkaa_muistiinpano"
                    value={muistiinpano}
                    onChange={(e) => setMuistiinpano(e.target.value)}
                    placeholder="Valinnainen"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAvoin(null)}>
                  Peruuta
                </Button>
                <Button
                  type="button"
                  disabled={kesken || nimi.trim() === "" || hankittu === "" || hinta.trim() === ""}
                  onClick={() =>
                    suorita(
                      () =>
                        muokkaaKalusto(avoin?.id ?? "", {
                          nimi: nimi.trim(),
                          kuvaus: avoin?.kuvaus ?? null,
                          hankittu,
                          hankintamenoEur: luku(hinta),
                          muistiinpano: muistiinpano.trim() || null,
                        }),
                      "Muutos tallennettu ja poistolaskelma päivitetty."
                    )
                  }
                >
                  Tallenna
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogi === "luovutus" && (
            <>
              <DialogHeader>
                <DialogTitle>Merkitse myydyksi</DialogTitle>
                <DialogDescription>
                  {avoin?.nimi}. Luovutus ei poista riviä: se pysyy rekisterissä, ja
                  luovutushinta vähennetään luovutusvuoden poistopohjasta ennen poistoa (EVL
                  30 §). Myyntivoittoa tai -tappiota ei lasketa erikseen. Hinta ilman
                  arvonlisäveroa.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="luovutuspaiva">Luovutuspäivä</Label>
                  <Input
                    id="luovutuspaiva"
                    type="date"
                    value={luovutuspaiva}
                    onChange={(e) => setLuovutuspaiva(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luovutushinta">Luovutushinta € (ALV 0 %)</Label>
                  <Input
                    id="luovutushinta"
                    type="number"
                    min="0"
                    step="0.01"
                    value={luovutushinta}
                    onChange={(e) => setLuovutushinta(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAvoin(null)}>
                  Peruuta
                </Button>
                <Button
                  type="button"
                  disabled={kesken || luovutuspaiva === "" || luovutushinta.trim() === ""}
                  onClick={() =>
                    suorita(
                      () =>
                        kirjaaLuovutus(avoin?.id ?? "", luovutuspaiva, luku(luovutushinta)),
                      "Luovutus kirjattu ja poistolaskelma päivitetty."
                    )
                  }
                >
                  Tallenna
                </Button>
              </DialogFooter>
            </>
          )}

          {dialogi === "poisto" && (
            <>
              <DialogHeader>
                <DialogTitle>Poistetaanko hankinta?</DialogTitle>
                <DialogDescription>
                  Poistetaan {avoin?.nimi} (
                  {avoin ? muotoileEuro(avoin.hankintamenoEur) : ""}). Poistolaskelma{" "}
                  {avoin ? avoin.hankittu.slice(0, 4) : ""} lasketaan uudelleen, ja muutos
                  siirtää kaikkia sitä seuraavia vuosia.
                  {avoin?.kuitinBruttoEur !== null && avoin?.kuitinBruttoEur !== undefined && (
                    <>
                      {" "}
                      Kuitti ja sen rivi säilyvät - vain kalustomerkintä häviää, ja rivin voi
                      siirtää kalustoon uudelleen.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAvoin(null)}>
                  Peruuta
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={kesken}
                  onClick={() =>
                    suorita(
                      () => poistaKalusto(avoin?.id ?? ""),
                      "Hankinta poistettu ja poistolaskelma päivitetty."
                    )
                  }
                >
                  <Trash2 className="size-4" />
                  Poista
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
