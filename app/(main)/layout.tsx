import type { Metadata } from "next";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import { Providers } from './providers';
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import "../globals.css";

export const metadata: Metadata = {
  title: "Offerbase - Clerk Authentication",
  description: "Offerbase application with Clerk authentication",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClerkProvider>
          <Providers>
            <header className="bg-white/95 backdrop-blur-sm border-b border-border sticky top-0 z-50 px-8 py-4">
              <div className="max-w-7xl mx-auto flex justify-between items-center">
                <Link href="/">
                  <img src="/offerbase-logo.svg" alt="Offerbase Logo" className="h-7" />
                </Link>
                <div className="flex gap-4 items-center">
                  <SignedOut>
                    <Link href="/auth/login">
                      <Button variant="outline" size="sm">Sign In</Button>
                    </Link>
                    <Link href="/auth/signup">
                      <Button size="sm">Sign Up</Button>
                    </Link>
                  </SignedOut>
                  <SignedIn>
                    <Link href="/dashboard">
                      <Button variant="ghost" size="sm">Dashboard</Button>
                    </Link>
                    <UserButton afterSignOutUrl="/" />
                  </SignedIn>
                </div>
              </div>
            </header>
            <main className="min-h-screen">{children}</main>
            <Toaster />
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}