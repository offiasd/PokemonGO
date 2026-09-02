"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERUUTUKSEN_SYYT } from "@/lib/vakiot";
import type { PeruutuksenSyy } from "@/lib/supabase/database.types";

import { peruTyo } from "./actions";

export function PeruTyo({ tyoId }: { tyoId: string }) {
  const [auki, setAuki] = useState(false);
  const [syy, setSyy] = useState<PeruutuksenSyy | "">("");
  const [tarkennus, setTarkennus] = useState("");
  const [kaynnissa, aloita] = useTransition();

  // "Muu" ilman selitystä ei kerro jälkikäteen mitään, joten teksti on siinä
  // pakollinen - sama vaatimus on myös kannassa.
  const puuttuu = syy === "" || (syy === "muu" && tarkennus.trim() === "");

  function kasittelePeruminen() {
    if (syy === "") return;
    aloita(async () => {
      try {
        await peruTyo(tyoId, syy, tarkennus);
        toast.success("Työ peruttu - varattu maali vapautui varastoon.");
        setAuki(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Peruminen epäonnistui.");
      }
    });
  }

  return (
    <Dialog
      open={auki}
      onOpenChange={(tila) => {
        setAuki(tila);
        // Tyhjennetään valinnat sulkiessa, ettei seuraava peruutus peri
        // edellisen syytä.
        if (!tila) {
          setSyy("");
          setTarkennus("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <X className="size-4" />
          Peru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Peru työ</DialogTitle>
          <DialogDescription>
            Työ poistetaan ja sen varaama maali vapautuu varastoon. Syy jää talteen.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`syy_${tyoId}`}>Peruutuksen syy</Label>
            <Select value={syy} onValueChange={(arvo) => setSyy(arvo as PeruutuksenSyy)}>
              <SelectTrigger id={`syy_${tyoId}`} className="w-full">
                <SelectValue placeholder="Valitse syy" />
              </SelectTrigger>
              <SelectContent>
                {PERUUTUKSEN_SYYT.map((vaihtoehto) => (
                  <SelectItem key={vaihtoehto.arvo} value={vaihtoehto.arvo}>
                    {vaihtoehto.nimi}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {syy === "muu" && (
            <div className="grid gap-2">
              <Label htmlFor={`tarkennus_${tyoId}`}>Kirjoita syy</Label>
              <Textarea
                id={`tarkennus_${tyoId}`}
                rows={3}
                value={tarkennus}
                onChange={(e) => setTarkennus(e.target.value)}
                placeholder="Esimerkiksi: osa vaurioitui pesussa"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAuki(false)}>
            Älä peru
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={kasittelePeruminen}
            disabled={kaynnissa || puuttuu}
          >
            {kaynnissa && <Loader2 className="size-4 animate-spin" />}
            Peru työ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
