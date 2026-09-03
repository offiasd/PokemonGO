import { Suspense } from "react";

import { VahvistusLomake } from "./vahvistus-lomake";

export default function VahvistusSivu() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Suspense>
        <VahvistusLomake />
      </Suspense>
    </main>
  );
}
