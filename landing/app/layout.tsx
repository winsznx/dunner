import type { Metadata } from "next";
import { Syne, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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
  metadataBase: new URL("https://dunner.xyz"),
  title: {
    default: "Dunner — When payments fail, Dunner calls.",
    template: "%s · Dunner",
  },
  description:
    "Voice-native failed-payment recovery for SaaS. Your cloned voice calls customers, negotiates a fix in real-time using live Stripe actions, and only charges when it works.",
  applicationName: "Dunner",
  keywords: [
    "failed payment recovery",
    "subscription recovery",
    "voice AI",
    "Stripe Connect",
    "SaaS dunning",
    "involuntary churn",
    "ElevenLabs",
  ],
  authors: [{ name: "Dunner", url: "https://dunner.xyz" }],
  creator: "Dunner",
  publisher: "Dunner",
  twitter: {
    card: "summary_large_image",
    site: "@dunner_app",
    creator: "@dunner_app",
    title: "Dunner — When payments fail, Dunner calls.",
    description:
      "Your cloned voice. Live Stripe actions. A fee only when it works.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Dunner — When payments fail, Dunner calls.",
      },
    ],
  },
  openGraph: {
    title: "Dunner — When payments fail, Dunner calls.",
    description:
      "Voice-native failed-payment recovery for SaaS. Your cloned voice. Live Stripe actions. A fee only when it works.",
    url: "https://dunner.xyz",
    siteName: "Dunner",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Dunner — When payments fail, Dunner calls.",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${syne.variable} ${spaceGrotesk.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col bg-[#0F0F11] text-[#EEEEEF]">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
