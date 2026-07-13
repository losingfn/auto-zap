"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon
} from "@/components/icons/lucide";

const galleryItems = [
  {
    src: "/assets/store/gallery-shiny.webp",
    alt: "Шины и диски в магазине автозапчастей",
    caption: "Шины и диски"
  },
  {
    src: "/assets/store/gallery-akkumulyatory.webp",
    alt: "Аккумуляторы на складе магазина",
    caption: "Аккумуляторы"
  },
  {
    src: "/assets/store/gallery-masla.webp",
    alt: "Масла и автомобильные жидкости",
    caption: "Масла и жидкости"
  },
  {
    src: "/assets/store/gallery-aksessuary.webp",
    alt: "Автомобильные аксессуары в магазине",
    caption: "Аксессуары"
  },
  {
    src: "/assets/store/gallery-shchetki.webp",
    alt: "Щетки стеклоочистителя в ассортименте",
    caption: "Щётки стеклоочистителя"
  },
  {
    src: "/assets/store/gallery-kuzovnye-detali.webp",
    alt: "Кузовные детали в магазине автозапчастей",
    caption: "Кузовные детали"
  }
];

export function ShopGallerySection() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const mobileGalleryRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);
  const activeItem = activeIndex === null ? null : galleryItems[activeIndex];
  const isLightboxOpen = activeIndex !== null;

  function scrollMobileGallery(index: number) {
    const gallery = mobileGalleryRef.current;
    if (!gallery) {
      return;
    }

    const slide = gallery.children.item(index) as HTMLElement | null;
    if (!slide) {
      return;
    }

    gallery.scrollTo({
      left: slide.offsetLeft - gallery.offsetLeft,
      behavior: "smooth"
    });
  }

  function showPrevious() {
    const index = previousIndex(currentIndex);
    setCurrentIndex(index);
    scrollMobileGallery(index);
  }

  function showNext() {
    const index = nextIndex(currentIndex);
    setCurrentIndex(index);
    scrollMobileGallery(index);
  }

  function openLightbox(index: number, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setActiveIndex(index);
  }

  function closeLightbox() {
    restoreFocusRef.current = true;
    setActiveIndex(null);
  }

  function showPreviousInLightbox() {
    setActiveIndex((index) => (index === null ? index : previousIndex(index)));
  }

  function showNextInLightbox() {
    setActiveIndex((index) => (index === null ? index : nextIndex(index)));
  }

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (activeIndex !== null || !restoreFocusRef.current) {
      return;
    }

    restoreFocusRef.current = false;
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [activeIndex]);

  useEffect(() => {
    if (!isLightboxOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [isLightboxOpen]);

  useEffect(() => {
    if (!isLightboxOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousInLightbox();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextInLightbox();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen]);

  function handleMobileGalleryScroll() {
    const gallery = mobileGalleryRef.current;
    if (!gallery) {
      return;
    }

    const next = Math.round(gallery.scrollLeft / gallery.clientWidth);
    if (next < 0 || next >= galleryItems.length || next === currentIndex) {
      return;
    }

    setCurrentIndex(next);
  }

  function handleLightboxTouchEnd(position: number) {
    if (touchStart === null) {
      return;
    }

    const delta = touchStart - position;
    setTouchStart(null);

    if (Math.abs(delta) < 36) {
      return;
    }

    if (delta > 0) {
      showNextInLightbox();
      return;
    }

    showPreviousInLightbox();
  }

  return (
    <section id="shop-gallery" className="section-shell section-deep py-11 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-5 max-w-3xl sm:mb-8">
          <h2 className="text-2xl font-semibold leading-tight text-white sm:text-3xl lg:text-4xl">
            Загляните внутрь магазина
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#CBD5E1] sm:mt-4 sm:text-base sm:leading-7">
            Несколько фотографий торгового зала, чтобы вы могли заранее увидеть интерьер, полки с товарами и основные разделы ассортимента.
          </p>
        </div>

        <div className="hidden gap-4 lg:grid lg:grid-cols-3">
          {galleryItems.map((item, index) => (
            <button
              key={item.src}
              type="button"
              onClick={(event) => openLightbox(index, event.currentTarget)}
              className="tap-target photo-tap-target scroll-reveal stagger-card group overflow-hidden rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.96),rgba(17,24,39,1))] text-left shadow-[0_18px_58px_rgba(0,0,0,0.24)] hover:-translate-y-1 hover:border-[#2563EB]/55 hover:shadow-[0_24px_74px_rgba(0,0,0,0.3)]"
              style={{ "--stagger": `${index * 55}ms` } as CSSProperties}
              aria-label={`Открыть фото: ${item.caption}`}
            >
              <span className="relative block aspect-[4/3] overflow-hidden bg-[#0B1220]">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.035]"
                />
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1220]/50 via-transparent to-transparent" />
              </span>
              <span className="block px-5 py-4 text-base font-semibold text-white">
                {item.caption}
              </span>
            </button>
          ))}
        </div>

        <div className="lg:hidden">
          <div
            ref={mobileGalleryRef}
            className="photo-snap-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6"
            onScroll={handleMobileGalleryScroll}
          >
            {galleryItems.map((item, index) => (
              <button
                key={item.src}
                type="button"
                onClick={(event) => openLightbox(index, event.currentTarget)}
                className="tap-target photo-tap-target group min-w-full snap-center overflow-hidden rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.96),rgba(17,24,39,1))] text-left shadow-[0_18px_58px_rgba(0,0,0,0.24)]"
                aria-label={`Открыть фото: ${item.caption}`}
              >
                <span className="relative block aspect-[16/10] overflow-hidden bg-[#0B1220]">
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="100vw"
                    className="object-cover transition duration-300 group-hover:scale-[1.025]"
                  />
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1220]/45 via-transparent to-transparent" />
                </span>
                <span className="block px-4 py-3 text-sm font-semibold text-white">
                  {item.caption}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={showPrevious}
              className="tap-target inline-flex h-11 w-11 items-center justify-center rounded-card border border-white/10 bg-white/[0.06] text-[#DBEAFE] hover:border-[#93C5FD] hover:bg-white/[0.1]"
              aria-label="Предыдущее фото"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2" aria-label="Индикатор галереи">
              {galleryItems.map((item, index) => (
                <button
                  key={item.src}
                  type="button"
                  onClick={() => {
                    setCurrentIndex(index);
                    scrollMobileGallery(index);
                  }}
                  className={[
                    "tap-target h-2 rounded-full",
                    index === currentIndex ? "w-5 bg-[#93C5FD]" : "w-2 bg-white/35"
                  ].join(" ")}
                  aria-label={`Показать фото ${index + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={showNext}
              className="tap-target inline-flex h-11 w-11 items-center justify-center rounded-card border border-white/10 bg-white/[0.06] text-[#DBEAFE] hover:border-[#93C5FD] hover:bg-white/[0.1]"
              aria-label="Следующее фото"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {isMounted && activeItem
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex h-[100dvh] min-h-screen w-screen animate-[fade-in_0.22s_ease-out] items-center justify-center bg-[#020617]/85 px-4 py-6 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
              aria-label={activeItem.caption}
              onClick={closeLightbox}
              onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
              onTouchEnd={(event) => handleLightboxTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
            >
          <button
            type="button"
            ref={closeButtonRef}
            className="tap-target absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white hover:bg-white/15"
            onClick={closeLightbox}
            aria-label="Закрыть"
          >
            <XIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="tap-target absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white hover:bg-white/15 sm:left-4 sm:h-12 sm:w-12"
            onClick={(event) => {
              event.stopPropagation();
              showPreviousInLightbox();
            }}
            aria-label="Предыдущее фото"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="tap-target absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white hover:bg-white/15 sm:right-4 sm:h-12 sm:w-12"
            onClick={(event) => {
              event.stopPropagation();
              showNextInLightbox();
            }}
            aria-label="Следующее фото"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
          <figure
            key={activeItem.src}
            className="w-full max-w-5xl animate-[content-rise_0.24s_ease-out] overflow-hidden rounded-card border border-white/10 bg-[#111827] shadow-[0_28px_90px_rgba(0,0,0,0.46)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative aspect-[4/3] max-h-[78vh] w-full">
              <Image
                src={activeItem.src}
                alt={activeItem.alt}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
            <figcaption className="border-t border-white/10 px-5 py-4 text-base font-semibold text-white">
              {activeItem.caption}
            </figcaption>
          </figure>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function previousIndex(index: number) {
  return (index - 1 + galleryItems.length) % galleryItems.length;
}

function nextIndex(index: number) {
  return (index + 1) % galleryItems.length;
}
