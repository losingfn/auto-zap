import type { Metadata, Viewport } from "next";
import "./globals.css";
import { siteConfig } from "@/config/site";
import { publicAbsoluteUrl } from "@/features/seo/structured-data";

const metadataTitle = "Автозапчасти в Талдоме — Салтыкова-Щедрина";
const metadataDescription =
  "Каталог автозапчастей магазина на улице Салтыкова-Щедрина в Талдоме: поиск по товарам, цены, контакты и маршрут.";
const ogImagePath = "/og-image.png";

export const viewport: Viewport = {
  themeColor: "#07111F"
};

export async function generateMetadata(): Promise<Metadata> {
  const publicUrl = publicAbsoluteUrl("/");
  const ogImageUrl = publicAbsoluteUrl(ogImagePath) ?? ogImagePath;

  return {
    metadataBase: siteConfig.url ? new URL(siteConfig.url) : undefined,
    title: {
      default: metadataTitle,
      template: `%s | ${metadataTitle}`
    },
    description: metadataDescription,
    manifest: "/site.webmanifest",
    openGraph: {
      title: metadataTitle,
      description: metadataDescription,
      ...(publicUrl ? { url: publicUrl } : {}),
      siteName: siteConfig.name,
      locale: "ru_RU",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: "Автозапчасти в Талдоме"
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
        { url: "/favicon.ico" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" }
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      shortcut: "/favicon.ico"
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
