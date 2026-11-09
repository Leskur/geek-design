type ZoomWheel = Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'ctrlKey'>;

export function wheelZoomFactor(event: ZoomWheel, userAgent = navigator.userAgent): number {
  // Chromium encodes trackpad pinch as pixel-mode Ctrl+wheel with
  // deltaY = -100 * log(scale). Invert it to keep zoom following the fingers.
  // Physical Ctrl+wheel is indistinguishable in pixel mode and uses the same mapping.
  const macChromiumPinch =
    event.ctrlKey &&
    event.deltaMode === 0 &&
    /\(Macintosh;/.test(userAgent) &&
    /\bChrome\//.test(userAgent);
  return Math.exp(-event.deltaY * (macChromiumPinch ? 0.01 : 0.002));
}
