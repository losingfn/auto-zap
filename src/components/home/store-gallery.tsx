"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon
} from "@/components/icons/lucide";

export function StoreGallery({
  photos
}: {
  photos: {
    src: string;
    alt: string;
  }[];
}) {
  const visiblePhotos = photos.slice(0, 2);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const activePhoto = activeIndex === null ? null : visiblePhotos[activeIndex];
  const isLightboxOpen = activeIndex !== null;

  function showPrevious() {
    setActiveIndex((index) => {
      if (index === null) {
        return index;
      }

      return (index - 1 + visiblePhotos.length) % visiblePhotos.length;
    });
  }

  function showNext() {
    setActiveIndex((index) => {
      if (index === null) {
        return index;
      }

      return (index + 1) % visiblePhotos.length;
    });
  }

  function closeLightbox() {
    setActiveIndex(null);
  }

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isLightboxOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.scrollTo(scrollX, scrollY);
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
        showPrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen]);

  const lightbox = activePhoto ? (
    <div
      className="fixed inset-0 z-[999] flex animate-[fade-in_0.22s_ease-out] items-center justify-center bg-[#020617]/85 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={activePhoto.alt}
      onClick={closeLightbox}
    >
      <button
        type="button"
        className="fixed right-4 top-4 z-[1001] inline-flex h-11 w-11 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
        onClick={closeLightbox}
        aria-label="Закрыть"
      >
        <XIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="fixed left-3 top-1/2 z-[1001] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white transition hover:bg-white/15 sm:left-4 sm:h-12 sm:w-12"
        onClick={(event) => {
          event.stopPropagation();
          showPrevious();
        }}
        aria-label="Предыдущее фото"
      >
        <ChevronLeftIcon className="h-6 w-6" />
      </button>
      <button
        type="button"
        className="fixed right-3 top-1/2 z-[1001] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-card border border-white/15 bg-white/10 text-white transition hover:bg-white/15 sm:right-4 sm:h-12 sm:w-12"
        onClick={(event) => {
          event.stopPropagation();
          showNext();
        }}
        aria-label="Следующее фото"
      >
        <ChevronRightIcon className="h-6 w-6" />
      </button>
      <figure
        className="w-[min(92vw,1100px)] animate-[content-rise_0.24s_ease-out] overflow-hidden rounded-card border border-white/10 bg-[#111827] shadow-[0_28px_90px_rgba(0,0,0,0.46)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative aspect-[4/3] max-h-[84vh] w-full">
          <Image
            src={activePhoto.src}
            alt={activePhoto.alt}
            fill
            sizes="100vw"
            className="object-contain"
          />
        </div>
      </figure>
    </div>
  ) : null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {visiblePhotos.map((photo, index) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={[
              "scroll-reveal stagger-card group relative min-h-52 overflow-hidden rounded-card border border-white/10 bg-[#111827] text-left shadow-[0_22px_70px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1 hover:border-[#2563EB]/55",
              visiblePhotos.length === 1 ? "sm:min-h-72" : "sm:min-h-64 lg:min-h-56 xl:min-h-64"
            ].join(" ")}
            style={{ "--stagger": `${index * 80}ms` } as CSSProperties}
            aria-label={`Открыть фото: ${photo.alt}`}
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(min-width: 768px) 33vw, 100vw"
              className="object-cover transition duration-500 group-hover:scale-[1.04]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111827]/40 via-transparent to-transparent" />
          </button>
        ))}
      </div>

      {isMounted && lightbox ? createPortal(lightbox, document.body) : null}
    </>
  );
}
