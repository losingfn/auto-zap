import type { Metadata, Viewport } from "next";
import "./globals.css";
import { siteConfig } from "@/config/site";
import { publicAbsoluteUrl } from "@/features/seo/structured-data";

const metadataTitle = "Автозапчасти в Талдоме — магазин на Салтыкова-Щедрина";
const metadataDescription =
  "Более 30 000 автозапчастей на собственном складе в Талдоме. Актуальные цены, удобный поиск и помощь в подборе.";
const ogImagePath = "/og-image-v3.png";

export const viewport: Viewport = {
  themeColor: "#07111F"
};

export async function generateMetadata(): Promise<Metadata> {
  const publicUrl = publicAbsoluteUrl("/");
  const ogImageUrl = publicAbsoluteUrl(ogImagePath) ?? ogImagePath;

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: metadataTitle,
      template: `%s | ${metadataTitle}`
    },
    description: metadataDescription,
    manifest: "/site-v2.webmanifest",
    openGraph: {
      title: metadataTitle,
      description: metadataDescription,
      ...(publicUrl ? { url: publicUrl } : {}),
      siteName: "Автозапчасти на Салтыкова-Щедрина",
      locale: "ru_RU",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: "Автозапчасти на Салтыкова-Щедрина в Талдоме",
          type: "image/png"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: metadataTitle,
      description: metadataDescription,
      images: [ogImageUrl]
    },
    icons: {
      icon: [
        { url: "/favicon-v2.ico" },
        { url: "/favicon-v2.svg", type: "image/svg+xml" },
        { url: "/favicon-v2-48x48.png", sizes: "48x48", type: "image/png" },
        { url: "/favicon-v2-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-v2-16x16.png", sizes: "16x16", type: "image/png" }
      ],
      apple: [{ url: "/apple-touch-icon-v2.png", sizes: "180x180", type: "image/png" }],
      shortcut: "/favicon-v2.ico"
    },
    robots: {
      index: true,
      follow: true
    }
  };
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
