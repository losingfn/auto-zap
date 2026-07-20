import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Админ-панель",
    template: "%s | Админ-панель"
  },
  description: "Служебный раздел управления каталогом.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true
    }
  },
  openGraph: {
    title: "Админ-панель",
    description: "Служебный раздел управления каталогом.",
    type: "website",
    images: []
  },
  twitter: {
    card: "summary",
    title: "Админ-панель",
    description: "Служебный раздел управления каталогом.",
    images: []
  }
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
