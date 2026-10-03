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

export function StoreGallery({
  photos
}: {
  photos: {
    src: string;
    alt: string;
  }[];
}) {
  const visiblePhotos = [
    {
      src: "/assets/store/facade-gallery-new.jpg",
      alt: "Фасад магазина автозапчастей в Талдоме"
    },
    ...photos.slice(1, 2)
  ];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const activePhoto = activeIndex === null ? null : visiblePhotos[activeIndex];
  const isLightboxOpen = activeIndex !== null;

  function showPrevious() {
    if (activeIndex === null || isClosing) return;
    setPreviousIndex(activeIndex);
    setActiveIndex((activeIndex - 1 + visiblePhotos.length) % visiblePhotos.length);
  }

  function showNext() {
    if (activeIndex === null || isClosing) return;
    setPreviousIndex(activeIndex);
    setActiveIndex((activeIndex + 1) % visiblePhotos.length);
  }

  function openLightbox(index: number, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setPreviousIndex(null);
    setIsClosing(false);
    setActiveIndex(index);
  }

  function closeLightbox() {
    if (isClosing) return;
    restoreFocusRef.current = true;
    setIsClosing(true);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 16 : 220;
    closeTimerRef.current = window.setTimeout(() => {
      setActiveIndex(null);
      setPreviousIndex(null);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, duration);
  }

  useEffect(() => {
    setIsMounted(true);
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (previousIndex === null) return;
    const timer = window.setTimeout(() => setPreviousIndex(null), 180);
    return () => window.clearTimeout(timer);
  }, [activeIndex, previousIndex]);

  useEffect(() => {
    if (activeIndex !== null || !restoreFocusRef.current) {
      return;
    }

    restoreFocusRef.current = false;
    window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
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
        showPrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
      if (event.key === "Tab") {
        const controls = [closeButtonRef.current, previousButtonRef.current, nextButtonRef.current];
        const current = controls.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        controls[(current + (event.shiftKey ? 2 : 1) + controls.length) % controls.length]?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, isClosing]);

  const lightbox = activePhoto ? (
    <div
      className={`store-lightbox${isClosing ? " store-lightbox--closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Фото ${activeIndex! + 1} из ${visiblePhotos.length}: ${activePhoto.alt}`}
    >
      <div className="store-lightbox-backdrop" onClick={closeLightbox} aria-hidden="true" />
      <button
        type="button"
        ref={closeButtonRef}
        className="store-lightbox-control store-lightbox-close"
        onClick={(event) => {
          event.stopPropagation();
          closeLightbox();
        }}
        aria-label="Закрыть"
      >
        <XIcon className="h-[19px] w-[19px]" />
      </button>
      <button
        type="button"
        ref={previousButtonRef}
        className="store-lightbox-control store-lightbox-previous"
        onClick={(event) => {
          event.stopPropagation();
          showPrevious();
        }}
        aria-label="Предыдущее фото"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        ref={nextButtonRef}
        className="store-lightbox-control store-lightbox-next"
        onClick={(event) => {
          event.stopPropagation();
          showNext();
        }}
        aria-label="Следующее фото"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
      <div className="store-lightbox-stage">
        <figure className="store-lightbox-figure" onClick={(event) => event.stopPropagation()}>
          <div className="store-lightbox-photo-wrap">
            {previousIndex !== null ? (
              <Image
                src={visiblePhotos[previousIndex].src}
                alt=""
                width={previousIndex === 0 ? 1448 : 960}
                height={previousIndex === 0 ? 1086 : 1280}
                sizes="(min-width: 1024px) 84vw, 100vw"
                className="store-lightbox-photo store-lightbox-photo--previous"
                aria-hidden="true"
              />
            ) : null}
            <Image
              key={activePhoto.src}
              src={activePhoto.src}
              alt={activePhoto.alt}
              width={activeIndex === 0 ? 1448 : 960}
              height={activeIndex === 0 ? 1086 : 1280}
              sizes="(min-width: 1024px) 84vw, 100vw"
              className={`store-lightbox-photo store-lightbox-photo--current${previousIndex !== null ? " store-lightbox-photo--switching" : ""}`}
            />
          </div>
          <figcaption className="store-lightbox-counter" aria-live="polite" aria-atomic="true">
            <span>{String(activeIndex! + 1).padStart(2, "0")}</span> / {String(visiblePhotos.length).padStart(2, "0")}
          </figcaption>
        </figure>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {visiblePhotos.map((photo, index) => (
          <button
            key={photo.src}
            type="button"
            onClick={(event) => openLightbox(index, event.currentTarget)}
            className={[
              "tap-target photo-tap-target scroll-reveal stagger-card group relative overflow-hidden rounded-card border border-white/10 bg-[#111827] text-left shadow-[0_22px_70px_rgba(0,0,0,0.28)] hover:-translate-y-1 hover:border-[#2563EB]/55",
              index === 1
                ? "aspect-[3/4] min-h-0 sm:aspect-auto sm:min-h-64 lg:min-h-56 xl:min-h-64"
                : "min-h-52 sm:min-h-64 lg:min-h-56 xl:min-h-64",
              visiblePhotos.length === 1 ? "sm:min-h-72" : ""
            ].join(" ")}
            style={{ "--stagger": `${index * 80}ms` } as CSSProperties}
            aria-label={`Открыть фото: ${photo.alt}`}
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(min-width: 768px) 33vw, 100vw"
              className={[
                "transition duration-500 group-hover:scale-[1.04]",
                index === 1 ? "object-contain sm:object-cover" : "object-cover"
              ].join(" ")}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111827]/40 via-transparent to-transparent" />
          </button>
        ))}
      </div>

      {isMounted && lightbox ? createPortal(lightbox, document.body) : null}
    </>
  );
}
