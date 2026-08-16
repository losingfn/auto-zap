"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/admin", "Dashboard"], ["/admin/import", "Импорт Excel"], ["/admin/review", "Проверка товаров"],
  ["/admin/content", "Главная"], ["/admin/contacts", "Контакты"], ["/admin/hours", "График"],
  ["/admin/photos", "Фото"], ["/admin/vacancies", "Вакансии"], ["/admin/brand", "Бренд"],
  ["/admin/category-icons", "Иконки"], ["/admin/catalog", "Товары"], ["/admin/categories", "Категории"],
  ["/admin/subcategories", "Подкатегории"], ["/admin/rules", "Правила"], ["/admin/synonyms", "Синонимы"],
  ["/admin/backups", "Резервные копии"], ["/admin/security", "Безопасность"]
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return <nav className="flex gap-2 overflow-x-auto text-sm">{items.map(([href, label]) => {
    const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex h-9 items-center rounded-card border px-3 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93C5FD] ${active ? "border-[#73A0F5] bg-[#1A2740] text-white" : "border-[#243249] text-[#C8D1DF] hover:border-[#73A0F5] hover:text-white"}`}>{label}</Link>;
  })}</nav>;
}
