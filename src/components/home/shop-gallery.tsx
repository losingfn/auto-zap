"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  const activeItem = activeIndex === null ? null : galleryItems[activeIndex];
  const currentItem = galleryItems[currentIndex];

  function showPrevious() {
    setCurrentIndex((index) => previousIndex(index));
  }

  function showNext() {
    setCurrentIndex((index) => nextIndex(index));
  }

  function openLightbox(index: number) {
    setActiveIndex(index);
  }

  function showPreviousInLightbox() {
    setActiveIndex((index) => (index === null ? index : previousIndex(index)));
  }

  function showNextInLightbox() {
    setActiveIndex((index) => (index === null ? index : nextIndex(index)));
  }

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveIndex(null);
      }
      if (event.key === "ArrowLeft") {
        showPreviousInLightbox();
      }
      if (event.key === "ArrowRight") {
        showNextInLightbox();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeIndex]);

  function handleTouchEnd(position: number) {
    if (touchStart === null) {
      return;
    }

    const delta = touchStart - position;
    setTouchStart(null);

    if (Math.abs(delta) < 36) {
      return;
    }

    if (delta > 0) {
      showNext();
      return;
    }

    showPrevious();
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

        <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
          {galleryItems.map((item, index) => (
            <button
              key={item.src}
              type="button"
              onClick={() => openLightbox(index)}
              className="scroll-reveal stagger-card group overflow-hidden rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.96),rgba(17,24,39,1))] text-left shadow-[0_18px_58px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-1 hover:border-[#2563EB]/55 hover:shadow-[0_24px_74px_rgba(0,0,0,0.3)]"
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

        <div
          className="sm:hidden"
          onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
          onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
        >
          <button
            type="button"
            onClick={() => openLightbox(currentIndex)}
            className="group w-full overflow-hidden rounded-card border border-white/10 bg-[linear-gradient(145deg,rgba(31,41,55,0.96),rgba(17,24,39,1))] text-left shadow-[0_18px_58px_rgba(0,0,0,0.24)]"
            aria-label={`Открыть фото: ${currentItem.caption}`}
          >
            <span className="relative block aspect-[16/10] overflow-hidden bg-[#0B1220]">
              <Image
                src={currentItem.src}
                alt={currentItem.alt}
                fill
                sizes="100vw"
                className="object-cover transition duration-300 group-hover:scale-[1.025]"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1220]/45 via-transparent to-transparent" />
            </span>
            <span className="block px-4 py-3 text-sm font-semibold text-white">
              {currentItem.caption}
            </span>
          </button>

          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={showPrevious}
              className="inline-flex h-11 w-11 items-center justify-center rounded-card border border-white/10 bg-white/[0.06] text-[#DBEAFE] transition duration-300 hover:border-[#93C5FD] hover:bg-white/[0.1]"
              aria-label="Предыдущее фото"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2" aria-label="Индикатор галереи">
              {galleryItems.map((item, index) => (
                <button
                  key={item.src}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={[
                    "h-2 rounded-full transition duration-300",
                    index === currentIndex ? "w-5 bg-[#93C5FD]" : "w-2 bg-white/35"
                  ].join(" ")}
                  aria-label={`Показать фото ${index + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={showNext}
              className="inline-flex h-11 w-11 items-center justify-center rounded-card border border-white/10 bg-white/[0.06] text-[#DBEAFE] transition duration-300 hover:border-[#93C5FD] hover:bg-white/[0.1]"
              aria-label="Следующее фото"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {activeItem ? (
        <div
          className="fixed inset-0 z-50 flex animate-[fade-in_0.22s_ease-out] items-center justify-center bg-[#020617]/85 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={activeItem.caption}
          onClick={() => setActiveIndex(null)}
          onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
          onTouchEnd={(event) => handleLightboxTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
            onClick={() => setActiveIndex(null)}
            aria-label="Закрыть"
          >
            <XIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white transition hover:bg-white/15 sm:left-4 sm:h-12 sm:w-12"
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
            className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white transition hover:bg-white/15 sm:right-4 sm:h-12 sm:w-12"
            onClick={(event) => {
              event.stopPropagation();
              showNextInLightbox();
            }}
            aria-label="Следующее фото"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
          <figure
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
        </div>
      ) : null}
    </section>
  );
}

function previousIndex(index: number) {
  return (index - 1 + galleryItems.length) % galleryItems.length;
}

function nextIndex(index: number) {
  return (index + 1) % galleryItems.length;
}
