"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  muotoileEuro,
  myytavaMaaliTyypinNimi,
  MYYTAVAT_MAALI_TYYPIT,
  PAKOLLINEN_TOINEN_VARI_ROOLI,
  TOINEN_VARI_ROOLIN_NIMI,
  VALINNAINEN_TOINEN_VARI_ROOLI,
} from "@/lib/vakiot";
import type { MaaliTyyppi, MyytavaMaaliTyyppi } from "@/lib/supabase/database.types";

interface Vari {
  id: string;
  nimi: string;
  hintalisa_prosentti: number;
  kokonaishinta: number;
}

interface Kategoriahinta {
  maali_tyyppi: MyytavaMaaliTyyppi;
  hinta: number | null;
  arvioitu_kulutus_g: number;
  toinen_arvioitu_kulutus_g: number | null;
}

interface VariKategoria {
  vari_id: string;
  maali_tyyppi: MaaliTyyppi;
}

export function OsanHinnoittelu({
  manuaalinenHinta,
  kateProsentti,
  kateKiintea,
  lakkausLisahinta,
  perusTyokustannus,
  pesunKustannus,
  maalinpoistonKustannus,
  kategoriahinnat,
  varit,
  variKategoriat,
}: {
  manuaalinenHinta: number | null;
  kateProsentti: number;
  kateKiintea: number;
  lakkausLisahinta: number | null;
  perusTyokustannus: number;
  pesunKustannus: number;
  maalinpoistonKustannus: number;
  kategoriahinnat: Kategoriahinta[];
  varit: Vari[];
  variKategoriat: VariKategoria[];
}) {
  const variKategoriaKartta = useMemo(() => {
    const kartta = new Map<string, Set<MaaliTyyppi>>();
    for (const { vari_id, maali_tyyppi } of variKategoriat) {
      const joukko = kartta.get(vari_id) ?? new Set<MaaliTyyppi>();
      joukko.add(maali_tyyppi);
      kartta.set(vari_id, joukko);
    }
    return kartta;
  }, [variKategoriat]);

  const [pesuValittu, setPesuValittu] = useState(false);
  const [maalinpoistoValittu, setMaalinpoistoValittu] = useState(false);

  const [kategoria, setKategoria] = useState<MyytavaMaaliTyyppi | "">("");
  const [variId, setVariId] = useState("");
  const [lakkausValittu, setLakkausValittu] = useState(false);
  const [toinenVariId, setToinenVariId] = useState("");

  const myytavatKategoriat = useMemo(
    () => MYYTAVAT_MAALI_TYYPIT.filter((t) => kategoriahinnat.some((k) => k.maali_tyyppi === t.arvo)),
    [kategoriahinnat]
  );
  const valittuKategoriahinta = useMemo(
    () => kategoriahinnat.find((k) => k.maali_tyyppi === kategoria) ?? null,
    [kategoriahinnat, kategoria]
  );
  const valittuVari = useMemo(() => varit.find((v) => v.id === variId), [varit, variId]);
  const valittuToinenVari = useMemo(
    () => varit.find((v) => v.id === toinenVariId),
    [varit, toinenVariId]
  );
  const kategorianVarit = useMemo(
    () => (kategoria ? varit.filter((v) => variKategoriaKartta.get(v.id)?.has(kategoria)) : []),
    [varit, kategoria, variKategoriaKartta]
  );

  const pakollinenRooli = kategoria ? PAKOLLINEN_TOINEN_VARI_ROOLI[kategoria] : undefined;
  const valinnainenRooli = kategoria ? VALINNAINEN_TOINEN_VARI_ROOLI[kategoria] : undefined;
  const toinenVariRooli = pakollinenRooli ?? (lakkausValittu ? valinnainenRooli : undefined);
  const toinenVariAktiivinen = Boolean(toinenVariRooli);
  const toisenVarinKategoria: MaaliTyyppi | undefined =
    toinenVariRooli === "pohjavari" ? "pohjavari" : toinenVariRooli === "lakka" ? "transparent" : undefined;
  const toisenVarinVaihtoehdot = useMemo(
    () =>
      varit.filter(
        (v) =>
          v.id !== variId &&
          (!toisenVarinKategoria || variKategoriaKartta.get(v.id)?.has(toisenVarinKategoria))
      ),
    [varit, variId, toisenVarinKategoria, variKategoriaKartta]
  );

  const arvioituKulutusG = valittuKategoriahinta?.arvioitu_kulutus_g ?? 0;
  const toinenArvioituKulutusG = valittuKategoriahinta?.toinen_arvioitu_kulutus_g ?? 0;

  // Sama laskentaperuste kuin Uusi työ -sivulla: admin voi asettaa kategorialle
  // kiinteän hinnan, muuten hinta lasketaan värin ostohinnasta + katteesta.
  // Pesu ja maalinpoisto ovat aina valinnaisia lisätöitä, jotka lisätään
  // päälle omana kustannuksenaan riippumatta kategorian hinnoitteluperusteesta.
  const hintaEur = useMemo(() => {
    if (!valittuKategoriahinta || !valittuVari) return null;
    let kustannus = (arvioituKulutusG / 1000) * valittuVari.kokonaishinta + perusTyokustannus;
    if (pakollinenRooli && valittuToinenVari) {
      kustannus += (toinenArvioituKulutusG / 1000) * valittuToinenVari.kokonaishinta;
    }
    const kategorianHinta =
      valittuKategoriahinta.hinta ??
      manuaalinenHinta ??
      Math.round((kustannus * (1 + kateProsentti / 100) + kateKiintea) * 100) / 100;
    const lisa = kategorianHinta * (valittuVari.hintalisa_prosentti / 100);
    const lakkausLisa = kategoria === "solid" && lakkausValittu ? (lakkausLisahinta ?? 0) : 0;
    const pesuLisa = pesuValittu ? pesunKustannus : 0;
    const maalinpoistoLisa = maalinpoistoValittu ? maalinpoistonKustannus : 0;
    return (
      Math.round((kategorianHinta + lisa + lakkausLisa + pesuLisa + maalinpoistoLisa) * 100) / 100
    );
  }, [
    valittuKategoriahinta,
    valittuVari,
    valittuToinenVari,
    pakollinenRooli,
    arvioituKulutusG,
    toinenArvioituKulutusG,
    perusTyokustannus,
    manuaalinenHinta,
    kateProsentti,
    kateKiintea,
    kategoria,
    lakkausValittu,
    lakkausLisahinta,
    pesuValittu,
    pesunKustannus,
    maalinpoistoValittu,
    maalinpoistonKustannus,
  ]);

  function vaihdaKategoria(v: string) {
    setKategoria(v as MyytavaMaaliTyyppi);
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hinnoittele työ</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">Lisätyöt</Label>
          <div className="flex items-center gap-2">
            <Checkbox
              id="pesu_valittu"
              checked={pesuValittu}
              onCheckedChange={(v) => setPesuValittu(v === true)}
            />
            <Label htmlFor="pesu_valittu" className="font-normal">
              Pesu
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="maalinpoisto_valittu"
              checked={maalinpoistoValittu}
              onCheckedChange={(v) => setMaalinpoistoValittu(v === true)}
            />
            <Label htmlFor="maalinpoisto_valittu" className="font-normal">
              Maalinpoisto
            </Label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="hinnoittelu_kategoria">Kategoria</Label>
            <Select value={kategoria} onValueChange={vaihdaKategoria}>
              <SelectTrigger id="hinnoittelu_kategoria">
                <SelectValue placeholder="Valitse kategoria" />
              </SelectTrigger>
              <SelectContent>
                {myytavatKategoriat.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    Osalle ei ole asetettu hintoja
                  </p>
                )}
                {myytavatKategoriat.map(({ arvo }) => (
                  <SelectItem key={arvo} value={arvo}>
                    {myytavaMaaliTyypinNimi(arvo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kategoria && (
            <div className="grid gap-2">
              <Label htmlFor="hinnoittelu_vari">Väri</Label>
              <Select value={variId} onValueChange={setVariId}>
                <SelectTrigger id="hinnoittelu_vari">
                  <SelectValue placeholder="Valitse väri" />
                </SelectTrigger>
                <SelectContent>
                  {kategorianVarit.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nimi}
                      {v.hintalisa_prosentti > 0 && ` (+${v.hintalisa_prosentti} %)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {valinnainenRooli && !pakollinenRooli && kategoria && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="hinnoittelu_lakkaus"
              checked={lakkausValittu}
              onCheckedChange={(v) => setLakkausValittu(v === true)}
            />
            <Label htmlFor="hinnoittelu_lakkaus" className="font-normal">
              Lisää lakkaus (kirkas topcoat)
              {lakkausLisahinta ? ` - +${muotoileEuro(lakkausLisahinta)}` : ""}
            </Label>
          </div>
        )}

        {toinenVariAktiivinen && toinenVariRooli && (
          <div className="grid gap-2 rounded-md border bg-muted/30 p-4">
            <Label htmlFor="hinnoittelu_toinen_vari">
              {TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli]}
              {pakollinenRooli ? " *" : ""}
            </Label>
            <Select value={toinenVariId} onValueChange={setToinenVariId}>
              <SelectTrigger id="hinnoittelu_toinen_vari" className="w-full">
                <SelectValue
                  placeholder={`Valitse ${TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli].toLowerCase()}`}
                />
              </SelectTrigger>
              <SelectContent>
                {toisenVarinVaihtoehdot.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    Ei värejä tässä kategoriassa
                  </p>
                )}
                {toisenVarinVaihtoehdot.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nimi}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {hintaEur !== null && (
          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">Hinta asiakkaalle</span>
            <span className="text-lg font-semibold">{muotoileEuro(hintaEur)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
