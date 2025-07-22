import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from './providers';
import { Toaster } from "@/components/ui/toaster";
import { ConditionalHeader } from "@/components/ConditionalHeader";
import "../globals.css";

export const metadata: Metadata = {
  title: "Offerbase",
  description: "Offerbase ",
  icons: {
    icon: '/offerbase-fav.png',
    shortcut: '/offerbase-fav.png',
    apple: '/offerbase-fav.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="/offerbase-fav.png" />
        <link rel="shortcut icon" href="/offerbase-fav.png" />
        <link rel="apple-touch-icon" href="/offerbase-fav.png" />
      </head>
      <body suppressHydrationWarning>
        <ClerkProvider>
          <Providers>
            <ConditionalHeader />
            <main className="min-h-screen">{children}</main>
            <Toaster />
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}