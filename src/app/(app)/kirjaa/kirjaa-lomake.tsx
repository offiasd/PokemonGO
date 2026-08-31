"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MaaliTyyppi, ToinenVariRooli } from "@/lib/supabase/database.types";

import { kirjaaMaalaustapahtuma } from "./actions";

interface Osa {
  id: string;
  nimi: string;
  merkki: string | null;
  malli: string | null;
  arvioitu_kulutus_g: number;
}

interface Vari {
  id: string;
  nimi: string;
  saldo_g: number;
  tyyppi: MaaliTyyppi;
}

// Candy vaatii aina pohjavärin, illusion aina lakan. Solid-väreille lakkaus on valinnainen.
const TOINEN_VARI_PAKOLLINEN: Partial<Record<MaaliTyyppi, ToinenVariRooli>> = {
  candy: "pohjavari",
  illusion: "lakka",
};
const TOINEN_VARI_VALINNAINEN: Partial<Record<MaaliTyyppi, ToinenVariRooli>> = {
  solid: "lakka",
};
const ROOLIN_NIMI: Record<ToinenVariRooli, string> = {
  pohjavari: "Pohjaväri",
  lakka: "Lakka",
};

export function KirjaaLomake({ osat, varit }: { osat: Osa[]; varit: Vari[] }) {
  const lomakeRef = useRef<HTMLFormElement>(null);
  const [kaynnissa, aloita] = useTransition();
  const [virhe, setVirhe] = useState<string | null>(null);

  const [osaId, setOsaId] = useState<string>("");
  const [variId, setVariId] = useState<string>("");
  const [kappalemaara, setKappalemaara] = useState("1");
  const [toteutunutYlikirjoitus, setToteutunutYlikirjoitus] = useState<string | null>(null);

  const [lakkausKytketty, setLakkausKytketty] = useState(false);
  const [toinenVariId, setToinenVariId] = useState<string>("");
  const [toinenToteutunut, setToinenToteutunut] = useState<string>("");

  const valittuOsa = useMemo(() => osat.find((o) => o.id === osaId), [osat, osaId]);
  const valittuVari = useMemo(() => varit.find((v) => v.id === variId), [varit, variId]);
  const valittuToinenVari = useMemo(
    () => varit.find((v) => v.id === toinenVariId),
    [varit, toinenVariId]
  );

  const pakollinenRooli = valittuVari ? TOINEN_VARI_PAKOLLINEN[valittuVari.tyyppi] : undefined;
  const valinnainenRooli = valittuVari ? TOINEN_VARI_VALINNAINEN[valittuVari.tyyppi] : undefined;
  const toinenVariRooli = pakollinenRooli ?? (lakkausKytketty ? valinnainenRooli : undefined);
  const toinenVariAktiivinen = Boolean(toinenVariRooli);

  function vaihdaVari(v: string) {
    setVariId(v);
    setToinenVariId("");
    setToinenToteutunut("");
    setLakkausKytketty(false);
  }

  const arvioituKulutus = useMemo(() => {
    if (!valittuOsa) return 0;
    const maara = Number(kappalemaara) || 0;
    return Math.round(valittuOsa.arvioitu_kulutus_g * maara);
  }, [valittuOsa, kappalemaara]);

  const toteutunutKulutus = toteutunutYlikirjoitus ?? String(arvioituKulutus || "");

  function nollaaLomake() {
    lomakeRef.current?.reset();
    setOsaId("");
    setVariId("");
    setKappalemaara("1");
    setToteutunutYlikirjoitus(null);
    setLakkausKytketty(false);
    setToinenVariId("");
    setToinenToteutunut("");
  }

  function kasitteleLahetys(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setVirhe(null);

    if (toinenVariAktiivinen && !toinenVariId) {
      setVirhe(`Valitse ${(toinenVariRooli && ROOLIN_NIMI[toinenVariRooli]) ?? "toinen väri"}.`);
      return;
    }
    if (toinenVariAktiivinen && Number(toinenToteutunut) <= 0) {
      setVirhe(
        `Syötä ${(toinenVariRooli && ROOLIN_NIMI[toinenVariRooli]) ?? "toisen värin"} kulutus.`
      );
      return;
    }

    const formData = new FormData(e.currentTarget);
    aloita(async () => {
      const tulos = await kirjaaMaalaustapahtuma({ virhe: null, viesti: null }, formData);
      if (tulos.virhe) {
        setVirhe(tulos.virhe);
        return;
      }
      toast.success(tulos.viesti ?? "Tapahtuma kirjattu.");
      nollaaLomake();
    });
  }

  const riittaakoSaldo = !valittuVari || Number(toteutunutKulutus) <= valittuVari.saldo_g;
  const riittaakoToisenSaldo =
    !toinenVariAktiivinen ||
    !valittuToinenVari ||
    Number(toinenToteutunut || 0) <= valittuToinenVari.saldo_g;

  return (
    <form ref={lomakeRef} onSubmit={kasitteleLahetys} className="grid gap-4">
      <input type="hidden" name="arvioitu_kulutus_g" value={arvioituKulutus} />
      {toinenVariAktiivinen && (
        <>
          <input type="hidden" name="toinen_vari_id" value={toinenVariId} />
          <input type="hidden" name="toinen_vari_rooli" value={toinenVariRooli} />
          <input type="hidden" name="toinen_toteutunut_kulutus_g" value={toinenToteutunut} />
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="osa_id">Osa *</Label>
          <Select
            name="osa_id"
            value={osaId}
            onValueChange={(v) => {
              setOsaId(v);
              setToteutunutYlikirjoitus(null);
            }}
          >
            <SelectTrigger id="osa_id">
              <SelectValue placeholder="Valitse osa" />
            </SelectTrigger>
            <SelectContent>
              {osat.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nimi}
                  {(o.merkki || o.malli) &&
                    ` (${[o.merkki, o.malli].filter(Boolean).join(" ")})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="vari_id">Väri *</Label>
          <Select name="vari_id" value={variId} onValueChange={vaihdaVari}>
            <SelectTrigger id="vari_id">
              <SelectValue placeholder="Valitse väri" />
            </SelectTrigger>
            <SelectContent>
              {varit.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nimi} ({v.saldo_g.toLocaleString("fi-FI")} g)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="kappalemaara">Kappalemäärä *</Label>
          <Input
            id="kappalemaara"
            name="kappalemaara"
            type="number"
            min="1"
            step="1"
            value={kappalemaara}
            onChange={(e) => {
              setKappalemaara(e.target.value);
              setToteutunutYlikirjoitus(null);
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label>Arvioitu kulutus</Label>
          <Input value={`${arvioituKulutus.toLocaleString("fi-FI")} g`} disabled />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="toteutunut_kulutus_g">Toteutunut kulutus (g) *</Label>
          <Input
            id="toteutunut_kulutus_g"
            name="toteutunut_kulutus_g"
            type="number"
            min="1"
            step="1"
            value={toteutunutKulutus}
            onChange={(e) => setToteutunutYlikirjoitus(e.target.value)}
          />
        </div>
      </div>

      {!riittaakoSaldo && (
        <p className="text-sm text-warning-foreground">
          Huom: värin saldo ({valittuVari?.saldo_g.toLocaleString("fi-FI")} g) on pienempi kuin
          kirjattava kulutus. Saldo menee negatiiviseksi.
        </p>
      )}

      {valinnainenRooli && !pakollinenRooli && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="lakkaus_kytketty"
            checked={lakkausKytketty}
            onCheckedChange={(tila) => setLakkausKytketty(tila === true)}
          />
          <Label htmlFor="lakkaus_kytketty" className="font-normal">
            Lisää lakkaus (kirkas topcoat)
          </Label>
        </div>
      )}

      {toinenVariAktiivinen && toinenVariRooli && (
        <div className="grid gap-4 rounded-md border bg-muted/30 p-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="toinen_vari_id_select">
              {ROOLIN_NIMI[toinenVariRooli]}
              {pakollinenRooli ? " *" : ""}
            </Label>
            <Select value={toinenVariId} onValueChange={setToinenVariId}>
              <SelectTrigger id="toinen_vari_id_select">
                <SelectValue placeholder={`Valitse ${ROOLIN_NIMI[toinenVariRooli].toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {varit
                  .filter((v) => v.id !== variId)
                  .map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nimi} ({v.saldo_g.toLocaleString("fi-FI")} g)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="toinen_toteutunut">
              {ROOLIN_NIMI[toinenVariRooli]}: kulutus (g){pakollinenRooli ? " *" : ""}
            </Label>
            <Input
              id="toinen_toteutunut"
              type="number"
              min="1"
              step="1"
              value={toinenToteutunut}
              onChange={(e) => setToinenToteutunut(e.target.value)}
            />
          </div>
          {!riittaakoToisenSaldo && (
            <p className="text-sm text-warning-foreground sm:col-span-2">
              Huom: {ROOLIN_NIMI[toinenVariRooli].toLowerCase()}n saldo (
              {valittuToinenVari?.saldo_g.toLocaleString("fi-FI")} g) on pienempi kuin kirjattava
              kulutus. Saldo menee negatiiviseksi.
            </p>
          )}
        </div>
      )}

      {virhe && (
        <p className="text-sm text-destructive" role="alert">
          {virhe}
        </p>
      )}

      <div>
        <Button type="submit" disabled={kaynnissa}>
          {kaynnissa && <Loader2 className="size-4 animate-spin" />}
          Kirjaa tapahtuma
        </Button>
      </div>
    </form>
  );
}
