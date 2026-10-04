// Limit the standalone experience to iPhone/iPod; Safari tabs and other devices
// keep their existing navigation and layout.
export function isIPhonePWA(): boolean {
  return /iPhone|iPod/i.test(navigator.userAgent) &&
    ((navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches);
}
