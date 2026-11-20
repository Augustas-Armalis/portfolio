import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

const SITE = "https://augustasarmalis.com";
const TITLE = "Augustas Armalis";
const DESCRIPTION =
  "Design engineer and founder from Kaunas, Lithuania. Product design at Sellify, Larpo studio, Lunor, Capto, Contles, Filzy, music and a novel, all inside a little operating system.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: `${TITLE}: design engineer and founder`, template: `%s · ${TITLE}` },
  description: DESCRIPTION,
  applicationName: "Augustas OS",
  authors: [{ name: TITLE, url: SITE }],
  creator: TITLE,
  keywords: [
    "Augustas Armalis",
    "design engineer",
    "product designer",
    "founder",
    "Larpo",
    "Kaunas",
    "Lithuania",
    "portfolio",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: TITLE,
    title: `${TITLE}: design engineer and founder`,
    description: DESCRIPTION,
    locale: "en_US",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: `${TITLE}, design engineer and founder: his desk in a field, the display lit` }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@augustasdesign",
    creator: "@augustasdesign",
    title: `${TITLE}: design engineer and founder`,
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e4e6ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: TITLE,
  url: SITE,
  jobTitle: "Design engineer and founder",
  homeLocation: { "@type": "Place", name: "Kaunas, Lithuania" },
  sameAs: [
    "https://x.com/augustasdesign",
    "https://www.linkedin.com/in/armaugustas",
    "https://larpo.studio",
    "https://github.com/Augustas-Armalis",
  ],
  worksFor: { "@type": "Organization", name: "Larpo", url: "https://larpo.studio" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
      </body>
    </html>
  );
}
