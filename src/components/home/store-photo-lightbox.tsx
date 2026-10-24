"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon
} from "@/components/icons/lucide";

export type StoreLightboxPhoto = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export function useStorePhotoLightbox(
  photos: StoreLightboxPhoto[],
  { allowTouchSwipe = false }: { allowTouchSwipe?: boolean } = {}
) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [displayedIndex, setDisplayedIndex] = useState<number | null>(null);
  const [hasSwitched, setHasSwitched] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const activePhoto = displayedIndex === null ? null : photos[displayedIndex];
  const isLightboxOpen = activeIndex !== null;

  function showPrevious() {
    if (activeIndex === null || isClosing) return;
    setActiveIndex((index) => index === null ? null : (index - 1 + photos.length) % photos.length);
  }

  function showNext() {
    if (activeIndex === null || isClosing) return;
    setActiveIndex((index) => index === null ? null : (index + 1) % photos.length);
  }

  function openLightbox(index: number, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setHasSwitched(false);
    setIsClosing(false);
    setActiveIndex(index);
    setDisplayedIndex(index);
  }

  function closeLightbox() {
    if (isClosing) return;
    restoreFocusRef.current = true;
    setIsClosing(true);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 16 : 220;
    closeTimerRef.current = window.setTimeout(() => {
      setActiveIndex(null);
      setDisplayedIndex(null);
      setHasSwitched(false);
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
    if (activeIndex === null || activeIndex === displayedIndex || isClosing) return;
    let cancelled = false;
    const image = new window.Image();
    // Local photos are served unoptimized; decode the exact URL used by Next Image.
    image.src = photos[activeIndex].src;
    void image.decode().then(() => {
      if (cancelled) return;
      setHasSwitched(true);
      setDisplayedIndex(activeIndex);
    }).catch(() => {
      // Keep the last loaded photo visible if the requested image cannot load.
    });
    return () => { cancelled = true; };
  }, [activeIndex, displayedIndex, isClosing, photos]);

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
      aria-label={`Фото ${displayedIndex! + 1} из ${photos.length}: ${activePhoto.alt}`}
      onTouchStart={allowTouchSwipe ? (event) => { touchStartRef.current = event.touches[0]?.clientX ?? null; } : undefined}
      onTouchEnd={allowTouchSwipe ? (event) => {
        if (touchStartRef.current === null) return;
        const delta = touchStartRef.current - (event.changedTouches[0]?.clientX ?? touchStartRef.current);
        touchStartRef.current = null;
        if (Math.abs(delta) < 36) return;
        if (delta > 0) showNext();
        else showPrevious();
      } : undefined}
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
            <Image
              key={activePhoto.src}
              src={activePhoto.src}
              alt={activePhoto.alt}
              width={activePhoto.width}
              height={activePhoto.height}
              sizes="(min-width: 1024px) 84vw, 100vw"
              className={`store-lightbox-photo store-lightbox-photo--current${hasSwitched ? " store-lightbox-photo--switching" : ""}`}
            />
          </div>
          <figcaption className="store-lightbox-counter" aria-live="polite" aria-atomic="true">
            <span>{String(displayedIndex! + 1).padStart(2, "0")}</span> / {String(photos.length).padStart(2, "0")}
          </figcaption>
        </figure>
      </div>
    </div>
  ) : null;

  return {
    openLightbox,
    lightbox: isMounted && lightbox ? createPortal(lightbox, document.body) : null
  };
}
