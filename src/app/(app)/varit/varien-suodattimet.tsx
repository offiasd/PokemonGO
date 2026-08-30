"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
