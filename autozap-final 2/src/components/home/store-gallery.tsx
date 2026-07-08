import Image from "next/image";

export function StoreGallery({
  photos
}: {
  photos: {
    src: string;
    alt: string;
  }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {photos.slice(0, 6).map((photo) => (
        <div
          key={photo.src}
          className="relative min-h-56 overflow-hidden rounded-card border border-[#2E3A4C] bg-[#182231] sm:min-h-72"
        >
          <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
        </div>
      ))}
    </div>
  );
}
