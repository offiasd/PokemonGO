"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tyovaiheenNimi } from "@/lib/vakiot";

import { lisaaLisatyo } from "./actions";

function luku(arvo: string): number {
  const n = Number(arvo.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}


// Käyttöliittymän nimi vaiheelle jonka arvo kannassa on yhä 'teippaus'.
const SUOJAUS = tyovaiheenNimi("teippaus");

/**
 * Uuden lisätyön lisäys katalogiin.
 *
 * Hintakenttää ei ole: hinta on ajoista laskettu seuraus, ei syötettävä arvo.
 */
export function LisatyonLisays({ seuraavaJarjestys }: { seuraavaJarjestys: number }) {
  const router = useRouter();
  const [nimi, setNimi] = useState("");
  const [ryhma, setRyhma] = useState("");
  const [teippaus, setTeippaus] = useState("");
  const [maalaus, setMaalaus] = useState("");
  const [lisakulutus, setLisakulutus] = useState("");
  const [hintaPerus, setHintaPerus] = useState("");
  const [hintaErikois, setHintaErikois] = useState("");
  const [onJako, setOnJako] = useState(false);
  const [kesken, aja] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lisää lisätyö</CardTitle>
        <CardDescription>
          Ajat minuutteina. Hinta lasketaan niistä tuntiveloitusten mukaan.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="uusi_nimi">Nimi</Label>
          <Input
            id="uusi_nimi"
            value={nimi}
            onChange={(e) => setNimi(e.target.value)}
            placeholder="Esim. Kaksivärinen raita"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="uusi_ryhma">Ryhmä</Label>
          <Input
            id="uusi_ryhma"
            value={ryhma}
            onChange={(e) => setRyhma(e.target.value)}
            placeholder="Valinnainen, esim. Värijaot"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="uusi_hinta_perus">Hinta perusvärillä €</Label>
            <Input
              id="uusi_hinta_perus"
              type="number"
              min="0"
              step="0.01"
              value={hintaPerus}
              onChange={(e) => setHintaPerus(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Solid / RAL</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="uusi_hinta_erikois">Hinta erikoisvärillä €</Label>
            <Input
              id="uusi_hinta_erikois"
              type="number"
              min="0"
              step="0.01"
              value={hintaErikois}
              onChange={(e) => setHintaErikois(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Kaikki muut värit</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Ajat eivät vaikuta hintaan. Ne kirjataan työn keston arviointia varten.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="uusi_teippaus">{SUOJAUS} min</Label>
            <Input
              id="uusi_teippaus"
              type="number"
              min="0"
              value={teippaus}
              onChange={(e) => setTeippaus(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="uusi_maalaus">Maalaus min</Label>
            <Input
              id="uusi_maalaus"
              type="number"
              min="0"
              value={maalaus}
              onChange={(e) => setMaalaus(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="uusi_kulutus">Lisäkulutus g</Label>
          <Input
            id="uusi_kulutus"
            type="number"
            min="0"
            step="0.1"
            value={lisakulutus}
            onChange={(e) => setLisakulutus(e.target.value)}
            disabled={onJako}
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={onJako}
            onCheckedChange={(arvo) => setOnJako(arvo === true)}
          />
          <span>
            Jaettu pinta
            <span className="block text-xs text-muted-foreground">
              Kulutus jakautuu osan kokonaiskulutuksesta eikä lisäydy päälle.
            </span>
          </span>
        </label>
        <div>
          <Button
            type="button"
            disabled={kesken || nimi.trim() === ""}
            onClick={() =>
              aja(async () => {
                try {
                  await lisaaLisatyo({
                    nimi: nimi.trim(),
                    ryhma: ryhma.trim() || null,
                    teippausMin: Math.round(luku(teippaus)),
                    maalausMin: Math.round(luku(maalaus)),
                    lisakulutusG: onJako ? 0 : luku(lisakulutus),
                    hintaPerusvariEur: luku(hintaPerus),
                    hintaErikoisvariEur: luku(hintaErikois),
                    onJako,
                    jarjestys: seuraavaJarjestys,
                  });
                  setNimi("");
                  setRyhma("");
                  setTeippaus("");
                  setMaalaus("");
                  setLisakulutus("");
                  setOnJako(false);
                  toast.success("Lisätyö lisätty katalogiin.");
                  router.refresh();
                } catch (virhe) {
                  toast.error(virhe instanceof Error ? virhe.message : "Lisäys epäonnistui.");
                }
              })
            }
          >
            <Plus className="size-4" />
            Lisää katalogiin
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
