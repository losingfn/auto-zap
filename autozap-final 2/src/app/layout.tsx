import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "@/config/site";
import { getPublicHomeContent } from "@/features/content/public-home";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublicHomeContent();

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: `Автозапчасти в Талдоме — более 30 000 товаров | ${content.brand.name}`,
      template: `%s | ${content.brand.name}`
    },
    description:
      "Каталог автозапчастей магазина на улице Салтыкова-Щедрина в Талдоме: поиск по товарам, цены, контакты и маршрут.",
    openGraph: {
      title: content.brand.name,
      description: "Более 30 000 товаров на собственном складе в Талдоме.",
      url: siteConfig.url,
      siteName: content.brand.name,
      locale: "ru_RU",
      type: "website",
      images: [
        {
          url: content.brand.ogImageSrc,
          width: 1200,
          height: 630,
          alt: "Магазин автозапчастей на Салтыкова-Щедрина"
        }
      ]
    },
    icons: {
      icon: [{ url: content.brand.faviconSrc }],
      apple: [{ url: "/assets/brand/apple-touch-icon.png" }]
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
