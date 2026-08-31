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
import { MAALI_TYYPIT, VARISAVYN_VARIKOODI, VARISAVYT } from "@/lib/vakiot";

export function VarienSuodattimet({
  naytaPoistetutValinta,
}: {
  naytaPoistetutValinta: boolean;
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
    router.push(`/varit?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative w-full max-w-xs">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Hae nimellä tai valmistajalla..."
          defaultValue={searchParams.get("q") ?? ""}
          className="pl-8"
          onChange={(e) => paivitaParametri("q", e.target.value || null)}
        />
      </div>
      <Select
        value={searchParams.get("tyyppi") ?? "kaikki"}
        onValueChange={(arvo) => paivitaParametri("tyyppi", arvo === "kaikki" ? null : arvo)}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="kaikki">Kaikki tyypit</SelectItem>
          {MAALI_TYYPIT.map(({ arvo, nimi }) => (
            <SelectItem key={arvo} value={arvo}>
              {nimi}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get("savy") ?? "kaikki"}
        onValueChange={(arvo) => paivitaParametri("savy", arvo === "kaikki" ? null : arvo)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="kaikki">Kaikki värit</SelectItem>
          {VARISAVYT.map(({ arvo, nimi }) => (
            <SelectItem key={arvo} value={arvo}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-3 rounded-full border"
                  style={{ backgroundColor: VARISAVYN_VARIKOODI[arvo] }}
                />
                {nimi}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {naytaPoistetutValinta && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="naytaPoistetut"
            defaultChecked={searchParams.get("naytaPoistetut") === "1"}
            onCheckedChange={(tila) => paivitaParametri("naytaPoistetut", tila ? "1" : null)}
          />
          <Label htmlFor="naytaPoistetut" className="font-normal">
            Näytä poistetut
          </Label>
        </div>
      )}
    </div>
  );
}
