"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function OsienSuodattimet({
  naytaPoistetutValinta,
  ajoneuvotyypit,
}: {
  naytaPoistetutValinta: boolean;
  ajoneuvotyypit: { avain: string; nimi: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function paivitaParametri(avain: string, arvo: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (arvo) {
      params.set(avain, arvo);
    } else {
      params.delete(avain);
    }
    // Rajauksen muuttuessa palataan alkuun: vanha sivunumero osoittaisi
    // helposti tyhjään kohtaan lyhentynyttä listaa.
    params.delete("sivu");
    router.push(`/osat?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="relative w-full max-w-xs">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Hae nimellä, lisätiedoilla tai hakusanalla..."
          defaultValue={searchParams.get("q") ?? ""}
          className="pl-8"
          onChange={(e) => paivitaParametri("q", e.target.value || null)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Ajoneuvotyyppi</Label>
        <Select
          value={searchParams.get("ajoneuvotyyppi") ?? "kaikki"}
          onValueChange={(v) => paivitaParametri("ajoneuvotyyppi", v === "kaikki" ? null : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kaikki">Kaikki</SelectItem>
            {ajoneuvotyypit.map((t) => (
              <SelectItem key={t.avain} value={t.avain}>
                {t.nimi}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {naytaPoistetutValinta && (
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="naytaPoistetutOsat"
            defaultChecked={searchParams.get("naytaPoistetut") === "1"}
            onCheckedChange={(tila) => paivitaParametri("naytaPoistetut", tila ? "1" : null)}
          />
          <Label htmlFor="naytaPoistetutOsat" className="font-normal">
            Näytä poistetut
          </Label>
        </div>
      )}
    </div>
  );
}
