export function formatStorePhone(value: string) {
  const normalized = value.trim();
  const digits = normalized.replace(/\D/g, "");

  if (digits === "84962063304") {
    return "8-496-206-33-04";
  }

  return normalized;
}

export function formatBusinessTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return value;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function formatBusinessTimeRange(opensAt: string, closesAt: string) {
  return `${formatBusinessTime(opensAt)}–${formatBusinessTime(closesAt)}`;
}
