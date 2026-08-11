import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PurchaseListProvider } from "@/features/purchase-list/purchase-list-provider";
import { siteConfig } from "@/config/site";
import { publicAbsoluteUrl } from "@/features/seo/structured-data";

const metadataTitle = "Автозапчасти в Талдоме — Салтыкова-Щедрина";
const metadataDescription =
  "Оригинальные и аналоговые автозапчасти в Талдоме. Большой ассортимент, помощь в подборе, честные цены, удобное расположение и реальные отзывы покупателей.";
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
    manifest: "/site.webmanifest",
    verification: {
      yandex: "612ef6dabd30c864"
    },
    openGraph: {
      title: metadataTitle,
      description: metadataDescription,
      ...(publicUrl ? { url: publicUrl } : {}),
      siteName: "Автозапчасти в Талдоме",
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
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
        { url: "/favicon-64x64.png", sizes: "64x64", type: "image/png" }
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
      <body>
        <PurchaseListProvider>{children}</PurchaseListProvider>
      </body>
    </html>
  );
}
