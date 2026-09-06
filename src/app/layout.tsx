import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jauhemaalaamo",
  description: "Jauhemaalaamon värivaraston, osalistan ja kustannusten hallinta",
};

/**
 * Selaimen tilapalkin väri mobiilissa.
 *
 * Sama valkoinen kuin yläpalkilla, jolloin palkki jatkuu tilapalkkiin eikä
 * niiden väliin jää rajaa. Sisältöalue on harmaa, mutta se alkaa vasta
 * yläpalkin alta.
 */
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
