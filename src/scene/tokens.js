const probe = document
  .createElement("canvas")
  .getContext("2d", { willReadFrequently: true });

export function tokenColor(name) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  probe.fillStyle = "#000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
}
