"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TiedostoLataus } from "@/components/tiedosto-lataus";
import { createClient } from "@/lib/supabase/client";
import type { Alkupera, Database } from "@/lib/supabase/database.types";

import type { VariLomakeTila } from "./actions";

const TYHJA_VARI_TILA: VariLomakeTila = { virhe: null };

type VariRow = Database["public"]["Tables"]["varit"]["Row"];

interface VariLomakeProps {
  vari?: VariRow;
  formAction: (tila: VariLomakeTila, formData: FormData) => Promise<VariLomakeTila>;
  asetuksetOletusHalytysraja: number;
}

function TallennaNappi({ uusi }: { uusi: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {uusi ? "Luo väri" : "Tallenna muutokset"}
    </Button>
  );
}

export function VariLomake({ vari, formAction, asetuksetOletusHalytysraja }: VariLomakeProps) {
  const [tila, kutsuAction] = useActionState(formAction, TYHJA_VARI_TILA);
  const [alkupera, setAlkupera] = useState<Alkupera>(vari?.alkupera ?? "EU");
  const [kuvaUrl, setKuvaUrl] = useState<string | null>(vari?.kuva_url ?? null);
  const [ohjeTiedostoUrl, setOhjeTiedostoUrl] = useState<string | null>(
    vari?.ohje_tiedosto_url ?? null
  );
  const [myyjaLinkki, setMyyjaLinkki] = useState(vari?.myyja_linkki ?? "");
  const [haetaan, setHaetaan] = useState(false);

  async function haeTiedot() {
    if (!myyjaLinkki) {
      toast.error("Anna ensin linkki myyjän tuotesivulle.");
      return;
    }
    setHaetaan(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("hae-tuotetiedot", {
        body: { url: myyjaLinkki },
      });

      if (error) {
        toast.error(`Haku epäonnistui: ${error.message}`);
        return;
      }
      if (data?.virhe) {
        toast.warning(data.virhe);
      }
      if (data?.kuva_url) {
        setKuvaUrl(data.kuva_url);
        toast.success("Kuva löytyi ja täytettiin.");
      }
      if (data?.ohje_tiedosto_url) {
        setOhjeTiedostoUrl(data.ohje_tiedosto_url);
        toast.success("Ohjetiedosto löytyi ja täytettiin.");
      }
    } catch {
      toast.error(
        "Haku epäonnistui - tarkista että Edge Function 'hae-tuotetiedot' on julkaistu Supabase-projektissa."
      );
    } finally {
      setHaetaan(false);
    }
  }

  return (
    <form action={kutsuAction} className="grid gap-6">
      <input type="hidden" name="kuva_url" value={kuvaUrl ?? ""} />
      <input type="hidden" name="ohje_tiedosto_url" value={ohjeTiedostoUrl ?? ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="nimi">Nimi *</Label>
          <Input id="nimi" name="nimi" required defaultValue={vari?.nimi} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="valmistaja">Valmistaja</Label>
          <Input id="valmistaja" name="valmistaja" defaultValue={vari?.valmistaja ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="alkupera">Alkuperä</Label>
          <Select
            name="alkupera"
            value={alkupera}
            onValueChange={(v) => setAlkupera(v as Alkupera)}
          >
            <SelectTrigger id="alkupera">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EU">EU</SelectItem>
              <SelectItem value="USA">USA</SelectItem>
              <SelectItem value="muu">Muu</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ostohinta_per_kg">Ostohinta €/kg (netto) *</Label>
          <Input
            id="ostohinta_per_kg"
            name="ostohinta_per_kg"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={vari?.ostohinta_per_kg}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="toimituskulu_per_kg">Toimituskulu €/kg</Label>
          <Input
            id="toimituskulu_per_kg"
            name="toimituskulu_per_kg"
            type="number"
            step="0.01"
            min="0"
            defaultValue={vari?.toimituskulu_per_kg ?? 0}
          />
        </div>
      </div>

      {alkupera !== "EU" && (
        <div className="grid gap-4 rounded-md border bg-muted/30 p-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="tullimaksu_prosentti">Tullimaksu-% (tyhjä = käytä oletusta)</Label>
            <Input
              id="tullimaksu_prosentti"
              name="tullimaksu_prosentti"
              type="number"
              step="0.01"
              min="0"
              defaultValue={vari?.tullimaksu_prosentti ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="alv_prosentti">ALV-% tuonnille (tyhjä = käytä oletusta)</Label>
            <Input
              id="alv_prosentti"
              name="alv_prosentti"
              type="number"
              step="0.01"
              min="0"
              defaultValue={vari?.alv_prosentti ?? ""}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Tarkat tulli- ja ALV-prosentit riippuvat tuotenimikkeestä - varmista kirjanpitäjältä
            tai tullilta.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="halytysraja_g">
            Hälytysraja (g) - tyhjä = oletus ({asetuksetOletusHalytysraja} g)
          </Label>
          <Input
            id="halytysraja_g"
            name="halytysraja_g"
            type="number"
            step="1"
            min="0"
            defaultValue={vari?.halytysraja_g ?? ""}
          />
        </div>
        {!vari && (
          <div className="grid gap-2">
            <Label htmlFor="saldo_g">Alkusaldo (g)</Label>
            <Input id="saldo_g" name="saldo_g" type="number" step="1" min="0" defaultValue={0} />
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="myyja_linkki">Linkki myyjän tuotesivulle</Label>
        <div className="flex gap-2">
          <Input
            id="myyja_linkki"
            name="myyja_linkki"
            type="url"
            placeholder="https://..."
            value={myyjaLinkki}
            onChange={(e) => setMyyjaLinkki(e.target.value)}
          />
          <Button type="button" variant="outline" onClick={haeTiedot} disabled={haetaan}>
            {haetaan ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            Hae tiedot
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Yrittää hakea tuotekuvan ja ohjeet sivun julkisesta sisällöstä. Jos haku ei onnistu,
          lataa tiedostot käsin alta.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Kuva väristä</Label>
          <TiedostoLataus
            bucket="vari-kuvat"
            arvo={kuvaUrl}
            onChange={setKuvaUrl}
            hyvaksy="image/*"
            esikatseluKuva
            label="Lataa kuva"
          />
        </div>
        <div className="grid gap-2">
          <Label>Ohjetiedosto (PDF tms.)</Label>
          <TiedostoLataus
            bucket="vari-ohjeet"
            arvo={ohjeTiedostoUrl}
            onChange={setOhjeTiedostoUrl}
            hyvaksy=".pdf,.doc,.docx"
            esikatseluKuva={false}
            label="Lataa ohjetiedosto"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ohjeet">Valmistajan maalausohjeet (teksti)</Label>
        <Textarea id="ohjeet" name="ohjeet" rows={4} defaultValue={vari?.ohjeet ?? ""} />
      </div>

      {tila.virhe && (
        <p className="text-sm text-destructive" role="alert">
          {tila.virhe}
        </p>
      )}

      <div>
        <TallennaNappi uusi={!vari} />
      </div>
    </form>
  );
}
