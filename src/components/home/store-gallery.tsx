"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useStorePhotoLightbox } from "@/components/home/store-photo-lightbox";

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
      alt: "Фасад магазина автозапчастей в Талдоме",
      width: 1448,
      height: 1086
    },
    ...photos.slice(1, 2).map((photo) => ({ ...photo, width: 960, height: 1280 }))
  ];
  const { openLightbox, lightbox } = useStorePhotoLightbox(visiblePhotos);

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

      {lightbox}
    </>
  );
}
