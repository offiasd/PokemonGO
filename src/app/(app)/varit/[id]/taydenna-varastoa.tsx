"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { lisaaVarastotayennys } from "../actions";

export function TaydennaVarastoa({ variId }: { variId: string }) {
  const [maara, setMaara] = useState("");
  const [kaynnissa, aloita] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="taydennys">
          Täydennä varastoa (g)
        </label>
        <Input
          id="taydennys"
          type="number"
          min="1"
          step="1"
          value={maara}
          onChange={(e) => setMaara(e.target.value)}
          className="w-36"
        />
      </div>
      <Button
        type="button"
        disabled={kaynnissa || !maara}
        onClick={() =>
          aloita(async () => {
            try {
              await lisaaVarastotayennys(variId, Number(maara));
              setMaara("");
              toast.success("Varasto täydennetty.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Täydennys epäonnistui.");
            }
          })
        }
      >
        <PackagePlus className="size-4" />
        Lisää
      </Button>
    </div>
  );
}
