"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
}

export function KirjaaLomake({ osat, varit }: { osat: Osa[]; varit: Vari[] }) {
  const lomakeRef = useRef<HTMLFormElement>(null);
  const [kaynnissa, aloita] = useTransition();
  const [virhe, setVirhe] = useState<string | null>(null);

  const [osaId, setOsaId] = useState<string>("");
  const [variId, setVariId] = useState<string>("");
  const [kappalemaara, setKappalemaara] = useState("1");
  const [toteutunutYlikirjoitus, setToteutunutYlikirjoitus] = useState<string | null>(null);

  const valittuOsa = useMemo(() => osat.find((o) => o.id === osaId), [osat, osaId]);
  const valittuVari = useMemo(() => varit.find((v) => v.id === variId), [varit, variId]);

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
  }

  function kasitteleLahetys(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setVirhe(null);

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

  return (
    <form ref={lomakeRef} onSubmit={kasitteleLahetys} className="grid gap-4">
      <input type="hidden" name="arvioitu_kulutus_g" value={arvioituKulutus} />

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
          <Select name="vari_id" value={variId} onValueChange={setVariId}>
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
