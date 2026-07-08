"use client";

import { useEffect, useRef, useState } from "react";

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
  const [failed, setFailed] = useState(!apiKey);

  useEffect(() => {
    if (!apiKey || !containerRef.current) {
      setFailed(true);
      return;
    }

    let cancelled = false;
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
      } catch {
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
    <div className="overflow-hidden rounded-card border border-[#2E3A4C] bg-[#182231]">
      {failed ? (
        <MapFallback address={contact.address} />
      ) : (
        <div ref={containerRef} className="min-h-[360px] w-full bg-[#121B29]" />
      )}
      <MapActions contact={contact} />
    </div>
  );
}

function MapFallback({ address }: { address: string }) {
  return (
    <div className="flex min-h-[360px] flex-col justify-center gap-4 bg-[#121B29] p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#9DBDFB]">
          Адрес магазина
        </p>
        <p className="mt-3 max-w-xl text-2xl font-semibold leading-tight text-white">
          {address}
        </p>
      </div>
      <p className="max-w-xl text-sm leading-6 text-[#C8D1DF]">
        Карта сейчас недоступна или API-ключ не настроен. Адрес и маршрут можно открыть в
        Яндекс Картах.
      </p>
    </div>
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
  const routeUrl = `https://yandex.ru/maps/?rtext=~${contact.latitude}%2C${contact.longitude}&rtt=auto`;

  return (
    <div className="grid gap-3 border-t border-[#2E3A4C] bg-[#101827] p-4 sm:grid-cols-2">
      <a
        href={routeUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-card border border-[#4169A8] px-4 py-3 text-center text-sm font-semibold text-white transition hover:border-[#73A0F5] hover:bg-[#1A2740]"
      >
        Как добраться
      </a>
      <a
        href={contact.yandexMapsUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-card bg-[#2563EB] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
      >
        Открыть в Яндекс Картах
      </a>
    </div>
  );
}
