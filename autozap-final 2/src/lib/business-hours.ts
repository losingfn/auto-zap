import { siteConfig } from "@/config/site";

const MOSCOW_TIME_ZONE = "Europe/Moscow";

export interface StoreWorkStatus {
  isOpen: boolean;
  label: "Открыто" | "Закрыто";
  detail: string;
  todayHours: string;
}

export function getStoreWorkStatus(date = new Date()): StoreWorkStatus {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const weekdayText = parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const dayIndex = weekdayToIndex(weekdayText);
  const hours = dayIndex >= 1 && dayIndex <= 5 ? siteConfig.workingHours[0] : siteConfig.workingHours[1];
  const opensAtMinutes = timeToMinutes(hours.opensAt);
  const closesAtMinutes = timeToMinutes(hours.closesAt);
  const currentMinutes = hour * 60 + minute;
  const isOpen = currentMinutes >= opensAtMinutes && currentMinutes < closesAtMinutes;

  return {
    isOpen,
    label: isOpen ? "Открыто" : "Закрыто",
    detail: isOpen ? `Сегодня до ${hours.closesAt}` : `Сегодня с ${hours.opensAt}`,
    todayHours: `${hours.opensAt}-${hours.closesAt}`
  };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function weekdayToIndex(value: string) {
  if (value.startsWith("пн")) return 1;
  if (value.startsWith("вт")) return 2;
  if (value.startsWith("ср")) return 3;
  if (value.startsWith("чт")) return 4;
  if (value.startsWith("пт")) return 5;
  if (value.startsWith("сб")) return 6;
  return 7;
}
