const UNITS = ["B", "KB", "MB", "GB"];

export function formatBytes(bytes: number) {
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unit]}`;
}

export function formatMimeType(mimeType: string) {
  return mimeType.replace(/^image\//, "").replace("svg+xml", "svg").toUpperCase();
}
