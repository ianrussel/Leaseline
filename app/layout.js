import { Big_Shoulders, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Self-hosted by next/font at build time - no request to Google Fonts from the visitor's browser,
// and no layout shift while the display face loads.
const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-big-shoulders",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-source-serif",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata = {
  title: "Leaseline - AI Maintenance Triage",
  description:
    "Leaseline reads maintenance requests the moment they land, tags the urgency, and hands you a reply that's ready to send. Currently in development.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔧</text></svg>",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${bigShoulders.variable} ${sourceSerif.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-bg font-serif text-[17px] leading-[1.55] text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
