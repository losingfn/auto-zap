import type { Metadata } from "next";
import { PurchaseListPage } from "@/components/purchase-list/purchase-list-page";
import { PublicFooter } from "@/components/site/public-footer";
import { getPublicHomeContent } from "@/features/content/public-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Список покупок",
  robots: {
    index: false,
    follow: true
  }
};

export default async function PurchaseListRoute() {
  const content = await getPublicHomeContent();

  return (
    <>
      <PurchaseListPage
        contact={{
          phone: content.contact.phone,
          address: `${content.contact.addressCity}, ${content.contact.addressStreet.replace(/д\.\s*/u, "")}`,
          yandexMapsUrl: content.contact.yandexMapsUrl
        }}
      />
      <PublicFooter content={content} />
    </>
  );
}
