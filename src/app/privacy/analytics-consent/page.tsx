import type { Metadata } from "next";
import { SiteHeader } from "@/components/home/site-header";
import { PublicFooter } from "@/components/site/public-footer";
import { PrivacyConsentDocument } from "@/components/site/privacy-consent-document";
import { buildPublicPageMetadata } from "@/features/seo/metadata";
import styles from "../privacy.module.css";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Согласие на Яндекс.Метрику — Автозапчасти на Салтыкова-Щедрина",
  description: "Полный текст согласия на обработку персональных данных с использованием сервиса «Яндекс.Метрика» на сайте магазина.",
  path: "/privacy/analytics-consent"
});

export default function AnalyticsConsentPage() {
  return (
    <div className={`home-page ${styles.page}`}>
      <SiteHeader siteName="Автозапчасти на Салтыкова-Щедрина" navigationBasePath="/" />
      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <PrivacyConsentDocument />
      </main>
      <PublicFooter />
    </div>
  );
}
