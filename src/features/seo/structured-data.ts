import { siteConfig } from "@/config/site";
import type { PublicBusinessHour, PublicHomeContent } from "@/features/content/public-home";

const baseUrl = siteConfig.url;

export function absoluteUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

export function publicAbsoluteUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (!baseUrl) {
    return undefined;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export function buildBreadcrumbList(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url)
    }))
  };
}

export function buildLocalBusinessJsonLd(content: PublicHomeContent) {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "AutoPartsStore"],
    name: content.brand.name,
    url: absoluteUrl("/"),
    image: absoluteUrl(content.brand.ogImageSrc),
    logo: absoluteUrl(content.brand.logoSrc),
    telephone: content.contact.phone,
    email: content.contact.email,
    address: {
      "@type": "PostalAddress",
      addressCountry: "RU",
      addressRegion: "Московская область",
      addressLocality: "Талдом",
      streetAddress: content.contact.address
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: content.contact.latitude,
      longitude: content.contact.longitude
    },
    openingHoursSpecification: content.workingHours.map(toOpeningHoursSpecification),
    sameAs: [content.contact.yandexMapsUrl]
  };
}

function toOpeningHoursSpecification(hour: PublicBusinessHour) {
  return {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: dayOfWeekUrl(hour.dayOfWeek),
    opens: hour.isClosed ? "00:00" : hour.opensAt,
    closes: hour.isClosed ? "00:00" : hour.closesAt
  };
}

function dayOfWeekUrl(day: number) {
  const names = [
    "",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];
  return `https://schema.org/${names[day] ?? "Monday"}`;
}
