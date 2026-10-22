"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { publicBrandLogoSrc } from "@/config/public-brand";
import { PurchaseListNavigationLink } from "@/components/purchase-list/purchase-list-navigation-link";

const navigationItems = [
  { href: "#catalog", label: "Каталог" },
  { href: "#about", label: "О магазине" },
  { href: "#reviews", label: "Отзывы" },
  { href: "#vacancies", label: "Вакансии" },
  { href: "#contacts", label: "Контакты" }
];

export function SiteHeader({
  siteName,
  navigationBasePath = ""
}: {
  siteName: string;
  navigationBasePath?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const floatingRef = useRef(false);
  const namePositionsRef = useRef<{ element: HTMLElement; rect: DOMRect }[]>([]);
  const nameAnimationsRef = useRef<Animation[]>([]);
  const [isFloating, setIsFloating] = useState(false);
  const [brandPrimary, brandLocation] = siteName.split(" на ");

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      const floating = !entry.isIntersecting;
      if (floating === floatingRef.current) return;
      floatingRef.current = floating;
      if (window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches) {
        namePositionsRef.current = Array.from(nameRef.current?.querySelectorAll<HTMLElement>(
          ":scope > span:first-child, .home-header-name-location"
        ) ?? []).map((element) => ({ element, rect: element.getBoundingClientRect() }));
      }
      setIsFloating(floating);
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      nameAnimationsRef.current.forEach((animation) => animation.cancel());
    };
  }, []);

  useLayoutEffect(() => {
    const previous = namePositionsRef.current;
    namePositionsRef.current = [];
    nameAnimationsRef.current.forEach((animation) => animation.cancel());
    // Wrapping is discrete; interpolate the existing text spans' positions instead.
    nameAnimationsRef.current = previous.map(({ element, rect }) => {
      const next = element.getBoundingClientRect();
      const x = rect.x - next.x;
      const y = rect.y - next.y;
      const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
      const frames: Keyframe[] = [{ transform: `translate(${x}px, ${y}px)`, easing }];
      if (element.classList.contains("home-header-name-location")) {
        // Move to the second row before sliding left; slide right before joining the first row.
        frames.push(isFloating
          ? { offset: 0.3, transform: `translate(${x}px, 0)`, easing }
          : { offset: 0.75, transform: `translate(${x * 0.03}px, ${y}px)`, easing });
      }
      frames.push({ transform: "translate(0, 0)" });
      return element.animate(frames, { duration: 220 });
    });
  }, [isFloating]);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="home-header-sentinel" />
      <header className={`home-header relative z-20 ${isFloating ? "home-header--floating" : ""}`}>
        <div className="home-header-shell mx-auto max-w-7xl px-5 lg:px-12">
          <div className="home-header-primary flex items-center justify-between gap-4">
            <Link href="/" className="home-header-brand flex min-w-0 items-center gap-3">
              <Image
                src={publicBrandLogoSrc}
                alt=""
                width={72}
                height={72}
                sizes="(min-width: 1024px) 72px, 44px"
                priority
                className="home-header-logo aspect-square h-11 w-11 shrink-0 object-contain lg:h-[72px] lg:w-[72px]"
              />
              <span ref={nameRef} className="home-header-name min-w-0 max-w-[218px] text-xs font-semibold leading-4 text-white sm:max-w-none sm:text-sm sm:leading-5">
                <span>{brandPrimary}</span>
                {brandLocation ? <><span> </span><span className="home-header-name-location">на {brandLocation}</span></> : null}
              </span>
            </Link>

            <nav className="home-header-desktop-nav hidden items-center lg:flex">
              {navigationItems.map((item) => (
                <Link key={item.href} href={`${navigationBasePath}${item.href}`} className="home-header-desktop-link tap-target">
                  {item.label}
                </Link>
              ))}
              <PurchaseListNavigationLink
                className="home-header-desktop-link home-header-purchase-link tap-target"
              />
            </nav>
          </div>

          <nav className="home-header-mobile-nav grid grid-cols-3 lg:hidden">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={`${navigationBasePath}${item.href}`}
                className="home-header-mobile-link tap-target flex min-h-11 min-w-0 items-center justify-center px-1.5 py-2"
              >
                {item.label}
              </Link>
            ))}
            <PurchaseListNavigationLink
              mobileLabel="Список"
              className="home-header-mobile-link tap-target flex min-h-11 min-w-0 items-center justify-center px-1.5 py-2"
            />
          </nav>
        </div>
      </header>
    </>
  );
}
