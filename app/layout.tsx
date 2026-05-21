import type { Metadata } from "next";
import { Syne, Space_Grotesk } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Dunner — When payments fail, Dunner calls.",
  description: "The only recovery tool that sounds like you — and only charges when it works.",
  twitter: {
    card: "summary_large_image",
    title: "Dunner — When payments fail, Dunner calls.",
    description: "Your cloned voice. Live Stripe actions. A fee only when it works.",
  },
  openGraph: {
    title: "Dunner — When payments fail, Dunner calls.",
    description: "Voice-native failed payment recovery for SaaS. Your cloned voice. Live Stripe actions. A fee only when it works.",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#0F0F11] text-[#EEEEEF]">
        {children}
      </body>
    </html>
  );
}
