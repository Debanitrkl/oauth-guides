import type { Metadata } from "next";
import Link from "next/link";
import { KeyPrompt } from "@/components/KeyPrompt";
import { hasServerKey, isMock } from "@/lib/pipeline/model";
import "./globals.css";

export const metadata: Metadata = {
  title: "OAuth App Setup Guides",
  description: "How hard it is to get your own OAuth app approved with a provider, how long it takes, what they demand, and which steps an agent can do for you.",
};

const NAV = [
  { href: "/", label: "Library" },
  { href: "/generate", label: "Generate" },
  { href: "/about", label: "Reading a guide" },
  { href: "/how", label: "How we built this" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Decided on the server so the prompt never flashes for a deployment that has a key.
  const needsKey = !hasServerKey() && !isMock();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Schibsted+Grotesk:ital,wght@0,400;0,500;0,600;1,400&family=Fragment+Mono:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 border-b border-hairline bg-basalt/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8">
            <Link href="/" className="t-title whitespace-nowrap text-chalk no-underline">
              OAuth App Setup Guides
            </Link>
            <nav className="-mx-5 flex items-center gap-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0 sm:pb-0" style={{ scrollbarWidth: "none" }}>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="t-label whitespace-nowrap text-chalk-mid no-underline transition-colors hover:text-chalk">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">{children}</main>
        <KeyPrompt needsKey={needsKey} />
        <footer className="border-t border-hairline">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 px-5 py-5 sm:px-8">
            <span className="t-mono text-chalk-faint">Tested: a probe or a recorded walkthrough saw it</span>
            <span className="t-mono text-chalk-faint">Documented: the provider&apos;s own page says it, quote verified</span>
            <span className="t-mono text-chalk-faint">Reported: a community source says it</span>
            <span className="t-mono text-chalk-faint">Unverified: we looked and could not confirm it</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
