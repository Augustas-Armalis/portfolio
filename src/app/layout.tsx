import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

const SITE = "https://augustasarmalis.com";
const TITLE = "Augustas Armalis";
const DESCRIPTION =
  "Design engineer and founder from Kaunas, Lithuania. Head of design at Webstern (webstern.co), a full-stack web partner for SaaS and AI teams. Contles, Lunor, Filzy, Capto, music and a novel, all inside a little operating system.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: `${TITLE}: design engineer and founder`, template: `%s · ${TITLE}` },
  description: DESCRIPTION,
  applicationName: "Augustas OS",
  authors: [{ name: TITLE, url: SITE }],
  creator: TITLE,
  publisher: TITLE,
  category: "portfolio",
  keywords: [
    "Augustas Armalis",
    "Augustas Armalis portfolio",
    "Augustas Armalis design engineer",
    "design engineer",
    "design engineer Lithuania",
    "product designer",
    "UI designer",
    "creative developer",
    "WebGL portfolio",
    "three.js portfolio",
    "founder",
    "Webstern",
    "webstern.co",
    "Webstern studio",
    "Contles",
    "Lunor",
    "Filzy",
    "Capto",
    "Kaunas",
    "Lithuania",
    "portfolio",
  ],
  other: { author: TITLE, owner: TITLE, copyright: `© ${new Date().getFullYear()} ${TITLE}` },
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

const PERSON_ID = `${SITE}/#person`;
const SITE_ID = `${SITE}/#website`;
// who owns and wrote the site, in the forms search engines and assistants read: the person, the site he owns and
// publishes, and the page that is about him
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": PERSON_ID,
      name: TITLE,
      givenName: "Augustas",
      familyName: "Armalis",
      url: SITE,
      image: `${SITE}/img/augustas.jpg`,
      jobTitle: "Design engineer and founder",
      description: DESCRIPTION,
      nationality: { "@type": "Country", name: "Lithuania" },
      homeLocation: { "@type": "Place", name: "Kaunas, Lithuania" },
      knowsAbout: ["Product design", "Interface design", "Design engineering", "Front-end development", "WebGL and three.js", "Music production", "Writing"],
      sameAs: [
        "https://webstern.co",
        "https://x.com/augustasdesign",
        "https://www.instagram.com/augustas_armalis",
        "https://www.linkedin.com/in/armaugustas",
        "https://github.com/Augustas-Armalis",
      ],
      worksFor: { "@type": "Organization", name: "Webstern", url: "https://webstern.co" },
    },
    {
      "@type": "WebSite",
      "@id": SITE_ID,
      url: SITE,
      name: TITLE,
      alternateName: "Augustas OS",
      description: DESCRIPTION,
      inLanguage: "en",
      author: { "@id": PERSON_ID },
      creator: { "@id": PERSON_ID },
      publisher: { "@id": PERSON_ID },
      copyrightHolder: { "@id": PERSON_ID },
    },
    {
      "@type": "ProfilePage",
      "@id": `${SITE}/#profile`,
      url: SITE,
      name: `${TITLE}: design engineer and founder`,
      isPartOf: { "@id": SITE_ID },
      mainEntity: { "@id": PERSON_ID },
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
        {/* what a crawler, a reader without WebGL or an assistant sees: the plain facts about the owner */}
        <noscript>
          <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
            <h1>{TITLE}</h1>
            <p>{DESCRIPTION}</p>
            <p>
              This site is a small operating system inside a 3D field: a desk with a display, a piano, headphones, a camera, a novel and a sketchbook.
              It needs JavaScript and WebGL to run. Contact and links: <a href="https://x.com/augustasdesign">X</a>, <a href="https://www.linkedin.com/in/armaugustas">LinkedIn</a>,{" "}
              <a href="https://github.com/Augustas-Armalis">GitHub</a>, <a href="https://webstern.co">Webstern</a>, <a href="https://www.instagram.com/augustas_armalis">Instagram</a>.
            </p>
          </main>
        </noscript>
      </body>
    </html>
  );
}
