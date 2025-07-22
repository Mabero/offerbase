import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Chat Widget",
  description: "Chat widget for external embedding",
};

export default function WidgetRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ 
        margin: 0, 
        padding: 0, 
        backgroundColor: 'transparent',
        overflow: 'hidden'
      }}>
        {children}
      </body>
    </html>
  );
}