import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notion Mock",
  description: "本機單人版的 Notion 仿作，AI 由 Claude 驅動",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // BlockNote needs this so the on-screen keyboard resizes the editor
  // instead of covering it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (custom cursors, dark-mode toggles) add attributes to
    // these two elements before React hydrates, which React reports as a
    // mismatch it cannot patch. Suppression here covers only the attributes on
    // these tags, not the app's own markup.
    <html lang="zh-Hant" className="dark" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
