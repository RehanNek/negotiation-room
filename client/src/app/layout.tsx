import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "The Room — Verifiable Negotiation Infrastructure",
  description: "Private, fair negotiations with TEE attestation on EigenCloud",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${mono.variable} bg-gray-950 text-white min-h-screen antialiased`}>
        <nav className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <Link href="/" className="text-xl font-bold tracking-tight">
              THE ROOM
            </Link>
            <div className="flex gap-6 text-sm">
              <Link href="/negotiate" className="text-gray-400 hover:text-white transition">Negotiate</Link>
              <Link href="/contracts" className="text-gray-400 hover:text-white transition">Contracts</Link>
              <Link href="/profile" className="text-gray-400 hover:text-white transition">Profile</Link>
              <Link href="/verify" className="text-gray-400 hover:text-white transition">Verify</Link>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
