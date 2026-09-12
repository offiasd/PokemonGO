"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { lisaaKalusto } from "./actions";

/**
 * Kaluston lisäys käsin.
 *
 * Useimmat hankinnat siirretään kuitin riviltä, jolloin vero puretaan
 * automaattisesti. Käsin syötettäessä summa on syötettävä verottomana - siksi
 * se lukee kentän otsikossa eikä pelkästään ohjetekstissä.
 */
export function KalustonLisays() {
  const router = useRouter();
  const [nimi, setNimi] = useState("");
  const [hankittu, setHankittu] = useState(() => new Date().toISOString().slice(0, 10));
  const [hinta, setHinta] = useState("");
  const [muistiinpano, setMuistiinpano] = useState("");
  const [kesken, aja] = useTransition();

  const voiTallentaa = nimi.trim() !== "" && hankittu !== "" && hinta.trim() !== "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lisää hankinta</CardTitle>
        <CardDescription>
          Hankinnalle jolla ei ole kuittia järjestelmässä. Kuitilta siirtäminen on tarkempi:
          silloin vero puretaan rivin omalla verokannalla.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="kalusto_nimi">Nimi</Label>
          <Input
            id="kalusto_nimi"
            value={nimi}
            onChange={(e) => setNimi(e.target.value)}
            placeholder="Esim. jauhemaalauskaappi"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="kalusto_hankittu">Hankittu</Label>
            <Input
              id="kalusto_hankittu"
              type="date"
              value={hankittu}
              onChange={(e) => setHankittu(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kalusto_hinta">Hankintameno € (ALV 0 %)</Label>
            <Input
              id="kalusto_hinta"
              type="number"
              min="0"
              step="0.01"
              value={hinta}
              onChange={(e) => setHinta(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kalusto_muistiinpano">Muistiinpano</Label>
          <Input
            id="kalusto_muistiinpano"
            value={muistiinpano}
            onChange={(e) => setMuistiinpano(e.target.value)}
            placeholder="Valinnainen"
          />
        </div>
        <div>
          <Button
            type="button"
            disabled={!voiTallentaa || kesken}
            onClick={() =>
              aja(async () => {
                try {
                  await lisaaKalusto({
                    nimi: nimi.trim(),
                    kuvaus: null,
                    hankittu,
                    hankintamenoEur: Number(hinta.replace(",", ".")),
                    muistiinpano: muistiinpano.trim() || null,
                  });
                  setNimi("");
                  setHinta("");
                  setMuistiinpano("");
                  toast.success("Hankinta lisätty ja poistolaskelma päivitetty.");
                  router.refresh();
                } catch (virhe) {
                  toast.error(virhe instanceof Error ? virhe.message : "Lisäys epäonnistui.");
                }
              })
            }
          >
            <Plus className="size-4" />
            Lisää kalustoon
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
