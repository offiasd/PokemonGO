"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { lisaaAjoneuvotyyppi, nimeaAjoneuvotyyppi, poistaAjoneuvotyyppi } from "./actions";

interface Ajoneuvotyyppi {
  avain: string;
  nimi: string;
  /** Montako osaa käyttää tyyppiä - poisto estetään jos käytössä. */
  osia: number;
}

function Rivi({ tyyppi }: { tyyppi: Ajoneuvotyyppi }) {
  const [nimi, setNimi] = useState(tyyppi.nimi);
  const [kaynnissa, aloita] = useTransition();
  const muutettu = nimi.trim() !== tyyppi.nimi && nimi.trim() !== "";

  return (
    // Sama kaava kuin tuntiveloituksissa: kapealla ruudulla kenttä ja napit
    // omalle riville, sm-koosta ylöspäin sm:contents purkaa kääreen gridiin.
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <div className="min-w-0">
        <Label className="font-normal" htmlFor={`tyyppi_${tyyppi.avain}`}>
          {tyyppi.nimi}
        </Label>
        <p className="text-xs text-muted-foreground">
          {tyyppi.osia === 0 ? "Ei käytössä" : `Käytössä ${tyyppi.osia} osassa`}
        </p>
      </div>
      <div className="flex items-end gap-2 sm:contents">
        <Input
          id={`tyyppi_${tyyppi.avain}`}
          className="min-w-0 flex-1 sm:w-48 sm:flex-none"
          value={nimi}
          onChange={(e) => setNimi(e.target.value)}
          disabled={kaynnissa}
        />
        <Button
          type="button"
          size="sm"
          disabled={kaynnissa || !muutettu}
          onClick={() =>
            aloita(async () => {
              try {
                await nimeaAjoneuvotyyppi(tyyppi.avain, nimi);
                toast.success("Nimi tallennettu.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Tallennus epäonnistui.");
              }
            })
          }
        >
          Tallenna
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Poista osaryhmä"
          disabled={kaynnissa || tyyppi.osia > 0}
          onClick={() =>
            aloita(async () => {
              if (!window.confirm(`Poistetaanko osaryhmä "${tyyppi.nimi}"?`)) return;
              try {
                await poistaAjoneuvotyyppi(tyyppi.avain);
                toast.success("Osaryhmä poistettu.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Poisto epäonnistui.");
              }
            })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function AjoneuvotyypitLomake({ tyypit }: { tyypit: Ajoneuvotyyppi[] }) {
  const [uusi, setUusi] = useState("");
  const [kaynnissa, aloita] = useTransition();

  return (
    <div className="grid gap-4">
      {tyypit.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ajoneuvotyyppejä ei ole. Lisää ainakin yksi, jotta osille voi valita tyypin.
        </p>
      )}
      {tyypit.map((t) => (
        <Rivi key={t.avain} tyyppi={t} />
      ))}

      <div className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="uusi_ajoneuvotyyppi" className="text-xs text-muted-foreground">
            Uusi ajoneuvotyyppi
          </Label>
          <Input
            id="uusi_ajoneuvotyyppi"
            value={uusi}
            onChange={(e) => setUusi(e.target.value)}
            placeholder="Esimerkiksi Mönkijä"
            disabled={kaynnissa}
          />
        </div>
        <Button
          type="button"
          disabled={kaynnissa || uusi.trim() === ""}
          onClick={() =>
            aloita(async () => {
              try {
                await lisaaAjoneuvotyyppi(uusi);
                setUusi("");
                toast.success("Osaryhmä lisätty.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Lisäys epäonnistui.");
              }
            })
          }
        >
          <Plus className="size-4" />
          Lisää
        </Button>
      </div>
    </div>
  );
}
