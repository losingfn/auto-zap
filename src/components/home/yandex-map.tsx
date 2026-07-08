"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

declare global {
  interface Window {
    ymaps?: {
      ready(callback: () => void): void;
      Map: new (
        element: HTMLElement,
        options: {
          center: [number, number];
          zoom: number;
          controls?: string[];
        }
      ) => YandexMapInstance;
      Placemark: new (
        coordinates: [number, number],
        properties: Record<string, string>,
        options?: Record<string, unknown>
      ) => unknown;
    };
  }
}

interface YandexMapInstance {
  geoObjects: {
    add(object: unknown): void;
  };
  destroy(): void;
}

export function YandexMap({
  apiKey,
  contact,
  siteName
}: {
  apiKey?: string | null;
  siteName: string;
  contact: {
    address: string;
    addressStreet: string;
    latitude: number;
    longitude: number;
    yandexMapsUrl: string;
  };
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YandexMapInstance | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!apiKey || !containerRef.current) {
      return;
    }

    let cancelled = false;
    setFailed(false);
    const scriptUrl = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;

    function initMap() {
      if (cancelled || !window.ymaps || !containerRef.current || mapRef.current) {
        return;
      }

      try {
        const coordinates: [number, number] = [
          contact.latitude,
          contact.longitude
        ];
        const map = new window.ymaps.Map(containerRef.current, {
          center: coordinates,
          zoom: 16,
          controls: ["zoomControl", "fullscreenControl"]
        });
        const placemark = new window.ymaps.Placemark(
          coordinates,
          {
            balloonContent: siteName,
            hintContent: contact.addressStreet
          },
          {
            preset: "islands#blueAutoIcon"
          }
        );
        map.geoObjects.add(placemark);
        mapRef.current = map;
      } catch (error) {
        console.error("[yandex-map] failed to initialize", error);
        setFailed(true);
      }
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptUrl}"]`
    );

    if (window.ymaps) {
      window.ymaps.ready(initMap);
    } else if (existingScript) {
      existingScript.addEventListener("load", () => window.ymaps?.ready(initMap), { once: true });
      existingScript.addEventListener("error", () => setFailed(true), { once: true });
    } else {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => window.ymaps?.ready(initMap);
      script.onerror = () => setFailed(true);
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [apiKey, contact.addressStreet, contact.latitude, contact.longitude, siteName]);

  return (
    <div className="scroll-reveal h-fit overflow-hidden rounded-card border border-white/10 bg-[#111827] shadow-[0_28px_90px_rgba(0,0,0,0.32)]">
      {!apiKey || failed ? (
        <MapEmbed contact={contact} />
      ) : (
        <div ref={containerRef} className="h-[300px] w-full bg-[#111827] sm:h-[320px]" />
      )}
      <MapActions contact={contact} />
    </div>
  );
}

function MapEmbed({
  contact
}: {
  contact: {
    address: string;
    latitude: number;
    longitude: number;
  };
}) {
  const src = `https://yandex.ru/map-widget/v1/?ll=${contact.longitude}%2C${contact.latitude}&mode=search&text=${encodeURIComponent(contact.address)}&z=16&pt=${contact.longitude},${contact.latitude},pm2blm`;

  return (
    <iframe
      title="Карта проезда к магазину автозапчастей"
      src={src}
      className="h-[300px] w-full border-0 bg-[#111827] sm:h-[320px]"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}

function MapActions({
  contact
}: {
  contact: {
    latitude: number;
    longitude: number;
    yandexMapsUrl: string;
  };
}) {
  const destination = `${contact.latitude}%2C${contact.longitude}`;
  const routeUrl = `https://yandex.ru/maps/?rtext=~${destination}&rtt=auto`;

  function handleRouteClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!navigator.geolocation) {
      return;
    }

    event.preventDefault();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const origin = `${position.coords.latitude}%2C${position.coords.longitude}`;
        window.open(
          `https://yandex.ru/maps/?rtext=${origin}~${destination}&rtt=auto`,
          "_blank",
          "noopener,noreferrer"
        );
      },
      () => {
        window.open(routeUrl, "_blank", "noopener,noreferrer");
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  }

  return (
    <div className="grid gap-3 border-t border-white/10 bg-[#0B1220] p-4 sm:grid-cols-2">
      <a
        href={routeUrl}
        target="_blank"
        rel="noreferrer"
        onClick={handleRouteClick}
        className="rounded-card border border-[#2563EB]/[0.55] px-4 py-3 text-center text-sm font-semibold text-white transition duration-300 hover:border-[#93C5FD] hover:bg-[#1A2740]"
      >
        Как добраться
      </a>
      <a
        href={contact.yandexMapsUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-card bg-[#2563EB] px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_0_30px_rgba(37,99,235,0.32)] transition duration-300 hover:bg-[#1D4ED8]"
      >
        Открыть в Яндекс Картах
      </a>
    </div>
  );
}
