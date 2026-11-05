import type { PointerEvent as ReactPointerEvent } from 'react';

export const PANEL_MIN_CENTER = 280;
export const LEFT_PANEL_MIN = 180;
export const LEFT_PANEL_MAX = 420;
export const RIGHT_PANEL_MIN = 240;
export const RIGHT_PANEL_MAX = 480;
export const LEFT_PANEL_KEY = 'gd-viewer-left-width';
export const RIGHT_PANEL_KEY = 'gd-viewer-right-width';

export function readPanelWidth(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value) && value >= 120 && value <= 640) return Math.round(value);
  } catch {
    /* ignore unavailable storage */
  }
  return fallback;
}

export function writePanelWidth(key: string, width: number) {
  try {
    localStorage.setItem(key, String(width));
  } catch {
    /* ignore unavailable storage */
  }
}

/**
 * Drag a vertical panel edge.
 * onBegin runs on the first pointer move (expand canvas once), then onChange tracks the panel.
 * onCommit settles canvas insets after release.
 */
export function beginPanelResize(
  event: ReactPointerEvent<HTMLButtonElement>,
  {
    startWidth,
    otherWidth,
    min,
    max,
    direction,
    onBegin,
    onChange,
    onCommit,
    storageKey,
  }: {
    startWidth: number;
    otherWidth: number;
    min: number;
    max: number;
    direction: 1 | -1;
    onBegin: () => void;
    onChange: (width: number) => void;
    onCommit: (width: number) => void;
    storageKey: string;
  },
) {
  if (event.button !== 0) return;
  event.preventDefault();
  const handle = event.currentTarget;
  const workspace = handle.closest('.viewer-workspace');
  const originX = event.clientX;
  let latest = startWidth;
  let began = false;
  handle.setPointerCapture(event.pointerId);
  const move = (ev: PointerEvent) => {
    if (!began) {
      if (ev.clientX === originX) return;
      began = true;
      onBegin();
      workspace?.querySelector<HTMLElement>(':scope > .center')?.getBoundingClientRect();
      workspace?.classList.add('is-panel-resizing');
    }
    const room = (workspace?.clientWidth || window.innerWidth) - otherWidth - PANEL_MIN_CENTER;
    latest = Math.min(
      max,
      room,
      Math.max(min, Math.round(startWidth + (ev.clientX - originX) * direction)),
    );
    onChange(latest);
  };
  const stop = (ev: PointerEvent) => {
    handle.releasePointerCapture(ev.pointerId);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', stop);
    handle.removeEventListener('pointercancel', stop);
    workspace?.classList.remove('is-panel-resizing');
    if (!began) return;
    writePanelWidth(storageKey, latest);
    onCommit(latest);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}
