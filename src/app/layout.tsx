import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "@/config/site";
import { getPublicHomeContent } from "@/features/content/public-home";
import { publicAbsoluteUrl } from "@/features/seo/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublicHomeContent();
  const publicUrl = publicAbsoluteUrl("/");
  const ogImageUrl = publicAbsoluteUrl(content.brand.ogImageSrc);

  return {
    metadataBase: siteConfig.url ? new URL(siteConfig.url) : undefined,
    title: {
      default: siteConfig.name,
      template: `%s | ${siteConfig.name}`
    },
    description:
      "Каталог автозапчастей магазина на улице Салтыкова-Щедрина в Талдоме: поиск по товарам, цены, контакты и маршрут.",
    openGraph: {
      title: siteConfig.name,
      description: "Более 30 000 товаров на собственном складе в Талдоме.",
      ...(publicUrl ? { url: publicUrl } : {}),
      siteName: siteConfig.name,
      locale: "ru_RU",
      type: "website",
      ...(ogImageUrl
        ? {
            images: [
              {
                url: ogImageUrl,
                width: 1200,
                height: 630,
                alt: "Магазин автозапчастей на Салтыкова-Щедрина"
              }
            ]
          }
        : {})
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
