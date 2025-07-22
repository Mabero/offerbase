"use client";

import { usePathname } from 'next/navigation';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

export function ConditionalHeader() {
  const pathname = usePathname();
  const isDashboardRoute = pathname?.startsWith('/dashboard');

  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-border sticky top-0 z-50 px-8 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {!isDashboardRoute && (
          <Link href="/">
            <img src="/offerbase-logo.svg" alt="Offerbase Logo" className="h-7" />
          </Link>
        )}
        {isDashboardRoute && <div></div>} {/* Empty div to maintain spacing */}
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
  );
}