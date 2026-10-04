"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon
} from "@/components/icons/lucide";
import { useStorePhotoLightbox } from "@/components/home/store-photo-lightbox";

const galleryItems = [
  {
    src: "/assets/store/gallery-shiny.webp",
    alt: "Шины и диски в магазине автозапчастей",
    caption: "Шины и диски",
    width: 960,
    height: 1280
  },
  {
    src: "/assets/store/gallery-akkumulyatory.webp",
    alt: "Аккумуляторы на складе магазина",
    caption: "Аккумуляторы",
    width: 960,
    height: 1280
  },
  {
    src: "/assets/store/gallery-masla.webp",
    alt: "Масла и автомобильные жидкости",
    caption: "Масла и жидкости",
    width: 1280,
    height: 960
  },
  {
    src: "/assets/store/gallery-aksessuary.webp",
    alt: "Автомобильные аксессуары в магазине",
    caption: "Аксессуары",
    width: 960,
    height: 1280
  },
  {
    src: "/assets/store/gallery-shchetki.webp",
    alt: "Щетки стеклоочистителя в ассортименте",
    caption: "Щётки стеклоочистителя",
    width: 960,
    height: 1280
  },
  {
    src: "/assets/store/gallery-kuzovnye-detali.webp",
    alt: "Кузовные детали в магазине автозапчастей",
    caption: "Кузовные детали",
    width: 960,
    height: 1280
  }
];

export function ShopGallerySection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const mobileGalleryRef = useRef<HTMLDivElement | null>(null);
  const { openLightbox, lightbox } = useStorePhotoLightbox(galleryItems, { allowTouchSwipe: true });

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

  return (
    <section id="shop-gallery" className="shop-gallery-section section-shell section-deep py-11 sm:py-16 lg:py-20">
      <div className="shop-gallery-shell mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="shop-gallery-intro mb-5 max-w-3xl sm:mb-8">
          <h2 className="shop-gallery-title text-2xl font-semibold leading-tight text-white sm:text-3xl lg:text-4xl">
            Загляните внутрь магазина
          </h2>
          <p className="shop-gallery-description mt-3 text-sm leading-6 text-[#CBD5E1] sm:mt-4 sm:text-base sm:leading-7">
            Несколько фотографий торгового зала, чтобы вы могли заранее увидеть интерьер, полки с товарами и основные разделы ассортимента
          </p>
        </div>

        <div className="shop-gallery-grid hidden gap-4 lg:grid lg:grid-cols-3">
          {galleryItems.map((item, index) => (
            <button
              key={item.src}
              type="button"
              onClick={(event) => openLightbox(index, event.currentTarget)}
              className="shop-gallery-card"
              aria-label={`Открыть фото: ${item.caption}`}
            >
              <span className="shop-gallery-photo">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="shop-gallery-image"
                />
                <span className="shop-gallery-shade" aria-hidden="true" />
                <span className="shop-gallery-caption">{item.caption}</span>
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

      {lightbox}
    </section>
  );
}

function previousIndex(index: number) {
  return (index - 1 + galleryItems.length) % galleryItems.length;
}

function nextIndex(index: number) {
  return (index + 1) % galleryItems.length;
}
