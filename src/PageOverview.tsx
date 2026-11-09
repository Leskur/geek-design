import { MousePointer2 } from 'lucide-react';
import { ZoomMenu } from './ZoomMenu';
import { wheelZoomFactor } from './wheel-zoom';
import { ContextMenu, type MenuPosition } from './ContextMenu';
import { stabilizeCameraOnResize, viewportArea } from './viewport-area';
import { ViewerToolbar, useViewerShortcuts } from './ViewerToolbar';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize, ArrowUpRight } from 'lucide-react';
import { detailEnabled } from './detail-entry';
import { color, type Layer, type DocumentSource } from './sketch';
import type { SceneCache } from './SceneCache';
import { drawArtboard } from './canvas-scene';
import { ImageLod } from './image-lod';
import {
  fitCameraInArea,
  hitAtPoint,
  isEditingTarget,
  measure,
  panFromAnchor,
  type Camera,
  type IndexedLayer,
  type Rect,
} from './interaction';
import { boardVisible, ellipsisText, matchesBoardName, pageBounds, zoomPage } from './overview';
import { paintRuler } from './canvas-overlay';

/** Below this on-screen size, paint the fixed mini instead of the layer tree. */
const LIVE_SCREEN = 280;
/** Keep generating pictures until the frame has spent this long, then continue next frame. */
const BUILD_BUDGET_MS = 48;
/** Zoomed-out pictures stay at most this long edge. On-screen size is usually smaller. */
const COARSE_CAP = 480;
/** Extra CSS pixels around the viewport so a short pan reuses the sharp slice. */
const SHARP_PAD = 192;

type BoardPicture = {
  canvas: HTMLCanvasElement;
  scale: number;
  sharp: boolean;
  stale?: boolean;
  /** Board-local rect when the canvas is only the on-screen slice. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Full-board picture kept under a slice, so a pan does not open a hole. */
  base?: HTMLCanvasElement;
};

function boardSlice(board: Layer, cam: Camera, viewW: number, viewH: number, pad: number) {
  const f = board.frame;
  const x0 = Math.max(f.x, (-pad - cam.x) / cam.scale);
  const y0 = Math.max(f.y, (-pad - cam.y) / cam.scale);
  const x1 = Math.min(f.x + f.width, (viewW + pad - cam.x) / cam.scale);
  const y1 = Math.min(f.y + f.height, (viewH + pad - cam.y) / cam.scale);
  return {
    x: x0 - f.x,
    y: y0 - f.y,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
  };
}

function sliceCovers(
  crop: { x: number; y: number; width: number; height: number },
  need: { x: number; y: number; width: number; height: number },
) {
  return (
    crop.x <= need.x + 0.5 &&
    crop.y <= need.y + 0.5 &&
    crop.x + crop.width >= need.x + need.width - 0.5 &&
    crop.y + crop.height >= need.y + need.height - 0.5
  );
}

/** Pixel size for a sharp board. Boards larger than the window keep only the visible slice, at screen pixels. */
function sharpPixels(board: Layer, cam: Camera, dpr: number, viewW: number, viewH: number) {
  const f = board.frame;
  const sx = cam.scale * dpr;
  const slice = boardSlice(board, cam, viewW, viewH, SHARP_PAD);
  const covers =
    slice.x <= 0.5 &&
    slice.y <= 0.5 &&
    slice.x + slice.width >= f.width - 0.5 &&
    slice.y + slice.height >= f.height - 0.5;
  if (covers) return { crop: undefined, width: f.width * sx, height: f.height * sx };
  return { crop: slice, width: slice.width * sx, height: slice.height * sx };
}

export function PageOverview({
  boards,
  pageId,
  pageName,
  doc,
  cache,
  selectedId,
  selected,
  onLayer,
  search,
  onSelect,
  onOpen,
  cameras,
  focus,
  toolbarHost,
  zoomHost,
}: {
  boards: Layer[];
  pageId: string;
  pageName: string;
  doc: DocumentSource;
  cache: SceneCache;
  selectedId?: string;
  selected: Layer | null;
  onLayer: (board: Layer, layer: Layer) => void;
  search: string;
  onSelect: (b: Layer | null) => void;
  onOpen: (b: Layer) => void;
  cameras: Map<string, Camera>;
  focus: { id: string; serial: number } | null;
  toolbarHost?: HTMLElement | null;
  zoomHost?: HTMLElement | null;
}) {
  const [menu, setMenu] = useState<(MenuPosition & { board: Layer }) | null>(null);
  const viewport = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLCanvasElement>(null),
    bounds = useMemo(() => pageBounds(boards), [boards]);
  const [camera, setCamera] = useState<Camera>(
      () => cameras.get(pageId) || { x: 0, y: 0, scale: 0.02 },
    ),
    [size, setSize] = useState({ w: 0, h: 0 }),
    [space, setSpace] = useState(false),
    [dragging, setDragging] = useState(false),
    [previewNotice, setPreviewNotice] = useState('');
  const drag = useRef<{
      x: number;
      y: number;
      startX: number;
      startY: number;
      id: number;
      pan: boolean;
      camera: Camera;
    } | null>(null),
    moved = useRef(false),
    spaceKey = useRef(false),
    altKey = useRef(false),
    current = useRef(camera),
    cameraFrame = useRef(0),
    pendingCamera = useRef<Camera | null>(null),
    paintFrame = useRef(0),
    paint = useRef<() => void>(() => {}),
    boardLabels = useRef<{ board: Layer; bounds: Rect }[]>([]),
    roots = useRef(new Map<string, Layer>()),
    pictures = useRef(new Map<string, BoardPicture>()),
    pictureRefs = useRef(new Map<string, Set<string>>()),
    pendingRefs = useRef(new Set<string>()),
    settled = useRef(true),
    shownPage = useRef(pageId),
    cameraEpoch = useRef(0),
    seenEpoch = useRef(0),
    hover = useRef<{ boardId: string; layerId: string | null; entry: IndexedLayer | null } | null>(
      null,
    ),
    viewportOrigin = useRef<{ left: number; top: number } | null>(null),
    paintedSize = useRef({ w: 0, h: 0 }),
    repaint = useRef(() => {}),
    images = useRef(
      new ImageLod(doc, (ref) => {
        if (settled.current) {
          dropPictures(ref);
          repaint.current();
        } else pendingRefs.current.add(ref);
      }),
    ),
    imageDoc = useRef(doc);
  current.current = camera;

  function queueCamera(update: (camera: Camera) => Camera) {
    settled.current = false;
    pendingCamera.current = update(pendingCamera.current || current.current);
    schedulePaint();
    if (!cameraFrame.current)
      cameraFrame.current = requestAnimationFrame(() => {
        cameraFrame.current = 0;
        const next = pendingCamera.current;
        pendingCamera.current = null;
        if (next) {
          current.current = next;
          setCamera(next);
        }
      });
  }
  function paintCamera() {
    return pendingCamera.current || current.current;
  }
  function resizeSurface() {
    const v = viewport.current,
      canvas = surface.current;
    if (!v || !canvas) return 1;
    const dpr = window.devicePixelRatio || 1,
      w = Math.max(1, Math.round(v.clientWidth * dpr)),
      h = Math.max(1, Math.round(v.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return dpr;
  }
  function paintSurface() {
    const canvas = surface.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = resizeSurface(),
      cam = paintCamera(),
      w = viewport.current?.clientWidth || size.w || 0,
      h = viewport.current?.clientHeight || size.h || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * cam.scale, 0, 0, dpr * cam.scale, dpr * cam.x, dpr * cam.y);
    const visible = boards.filter((b) => boardVisible(b, cam, w, h, 240));
    const budget = { start: performance.now(), built: 0, more: false };
    for (const b of visible) {
      const live = boardSharp(b, cam.scale);
      if (usablePicture(b, live, cam, dpr, w, h)) continue;
      // Zoom keeps the previous bitmap until the gesture settles. A pan stays at the
      // same scale, so the newly revealed slice can be drawn while the pointer moves.
      const prev = pictures.current.get(b.do_objectID);
      if (!settled.current && prev && Math.abs(prev.scale - cam.scale) >= 0.001) continue;
      boardPicture(b, live, cam, dpr, w, h, budget);
      if (budget.more) break;
    }
    for (const b of visible) {
      const f = b.frame,
        match = matchesBoardName(b, search),
        boardSelected = selected?.do_objectID === b.do_objectID,
        pointer = hover.current,
        boardHovered = pointer?.boardId === b.do_objectID && !pointer.entry && !boardSelected,
        dimmed = !!(search && !match);
      const entry = pictures.current.get(b.do_objectID);
      const picture = entry?.canvas;
      ctx.save();
      if (dimmed) ctx.globalAlpha = 0.28;
      if (picture && entry?.crop) {
        const c = entry.crop;
        if (entry.base) ctx.drawImage(entry.base, f.x, f.y, f.width, f.height);
        else {
          ctx.fillStyle = b.hasBackgroundColor ? color(b.backgroundColor) : '#fff';
          ctx.fillRect(f.x, f.y, f.width, f.height);
        }
        ctx.imageSmoothingEnabled = Math.abs(entry.scale - cam.scale) >= 0.001;
        ctx.drawImage(picture, f.x + c.x, f.y + c.y, c.width, c.height);
      } else if (picture) ctx.drawImage(picture, f.x, f.y, f.width, f.height);
      else {
        ctx.fillStyle = b.hasBackgroundColor ? color(b.backgroundColor) : '#fff';
        ctx.fillRect(f.x, f.y, f.width, f.height);
      }
      ctx.strokeStyle = boardSelected
        ? '#7656e8'
        : boardHovered
          ? '#9c84e3'
          : search && match
            ? '#9c84e3'
            : '#d5d8e2';
      ctx.lineWidth = (boardSelected ? 2 : boardHovered ? 1.5 : 1) / cam.scale;
      if (boardHovered) ctx.setLineDash([4 / cam.scale, 3 / cam.scale]);
      ctx.strokeRect(f.x, f.y, f.width, f.height);
      ctx.setLineDash([]);
      if (
        pointer?.boardId === b.do_objectID &&
        pointer.entry &&
        pointer.entry.layer.do_objectID !== selected?.do_objectID
      )
        strokeEntry(ctx, pointer.entry, f.x, f.y, cam.scale, '#9c84e3', 1, [3, 2]);
      if (selected && selected.do_objectID !== b.do_objectID && selectedId === b.do_objectID) {
        const entry = cache.index(boardRoot(b)).get(selected.do_objectID);
        if (entry) strokeEntry(ctx, entry, f.x, f.y, cam.scale, '#7656e8', 1.5);
      }
      ctx.restore();
    }
    if (altKey.current && !space && !dragging) {
      for (const d of overviewDistances()) paintRuler(ctx, d, cam.scale);
    }
    // Labels in screen space
    boardLabels.current = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '10px Inter, "Segoe UI", sans-serif';
    ctx.textBaseline = 'bottom';
    for (const b of visible) {
      const f = b.frame,
        match = matchesBoardName(b, search),
        boardSelected = selected?.do_objectID === b.do_objectID,
        hovered = hover.current?.boardId === b.do_objectID,
        screenW = f.width * cam.scale;
      if (screenW <= 45 && !boardSelected && !hovered && !(search && match)) continue;
      if (search && !match) continue;
      const x = f.x * cam.scale + cam.x,
        y = f.y * cam.scale + cam.y - 6;
      ctx.fillStyle = boardSelected ? '#5b45c2' : hovered ? '#7055d8' : '#8f919f';
      ctx.textAlign = 'left';
      const label = ellipsisText(ctx, b.name, screenW);
      ctx.fillText(label, x, y);
      if (label)
        boardLabels.current.push({
          board: b,
          bounds: { x, y: y - 14, width: ctx.measureText(label).width, height: 16 },
        });
    }
    if (!boards.length) {
      ctx.fillStyle = '#8f919f';
      ctx.font = '13px Inter, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        '这个页面还没有画板',
        (viewport.current?.clientWidth || 0) / 2,
        (viewport.current?.clientHeight || 0) / 2,
      );
    }
    if (budget.more) schedulePaint();
  }
  function boardSharp(board: Layer, scale: number) {
    return Math.max(board.frame.width, board.frame.height) * scale > LIVE_SCREEN;
  }
  function coarseSize(board: Layer, scale: number, dpr: number) {
    const frame = board.frame;
    const longest = Math.max(frame.width, frame.height) || 1;
    const target = Math.min(COARSE_CAP, Math.max(1, longest * scale * dpr));
    const fit = Math.min(1, target / longest);
    return {
      width: Math.max(1, Math.round(frame.width * fit)),
      height: Math.max(1, Math.round(frame.height * fit)),
    };
  }
  function usablePicture(
    board: Layer,
    sharp: boolean,
    cam: Camera,
    dpr: number,
    viewW: number,
    viewH: number,
  ) {
    const prev = pictures.current.get(board.do_objectID);
    if (!prev || prev.stale) return null;
    if (sharp) {
      if (!prev.sharp || Math.abs(prev.scale - cam.scale) >= 0.001) return null;
      if (!prev.crop) return prev.canvas;
      return sliceCovers(prev.crop, boardSlice(board, cam, viewW, viewH, 0)) ? prev.canvas : null;
    }
    if (prev.crop) return null;
    if (prev.sharp) return prev.canvas;
    const need = coarseSize(board, cam.scale, dpr);
    return prev.canvas.width + 1 >= need.width && prev.canvas.height + 1 >= need.height
      ? prev.canvas
      : null;
  }
  function boardPicture(
    board: Layer,
    sharp: boolean,
    cam: Camera,
    dpr: number,
    viewW: number,
    viewH: number,
    budget: { start: number; built: number; more: boolean },
  ) {
    const id = board.do_objectID;
    const scale = cam.scale;
    const prev = pictures.current.get(id);
    const ready = usablePicture(board, sharp, cam, dpr, viewW, viewH);
    if (ready) return ready;
    if (!settled.current && prev && Math.abs(prev.scale - scale) >= 0.001) return prev.canvas;
    if (budget.built > 0 && performance.now() - budget.start > BUILD_BUDGET_MS) {
      budget.more = true;
      return prev?.canvas;
    }
    budget.built += 1;
    const frame = board.frame;
    let crop: BoardPicture['crop'];
    let width = frame.width;
    let height = frame.height;
    if (sharp) {
      const raster = sharpPixels(board, cam, dpr, viewW, viewH);
      crop = raster.crop;
      width = raster.width;
      height = raster.height;
      if (crop && Math.abs(width / crop.width - scale * dpr) < 0.01) {
        const sx = scale * dpr;
        const pxX = Math.max(0, Math.floor(crop.x * sx));
        const pxY = Math.max(0, Math.floor(crop.y * sx));
        const pxR = Math.min(frame.width * sx, Math.ceil((crop.x + crop.width) * sx));
        const pxB = Math.min(frame.height * sx, Math.ceil((crop.y + crop.height) * sx));
        width = Math.max(1, pxR - pxX);
        height = Math.max(1, pxB - pxY);
        crop = { x: pxX / sx, y: pxY / sx, width: width / sx, height: height / sx };
      }
    } else {
      const size = coarseSize(board, scale, dpr);
      width = size.width;
      height = size.height;
    }
    const shot = document.createElement('canvas');
    shot.width = Math.max(1, Math.round(width));
    shot.height = Math.max(1, Math.round(height));
    const shotCtx = shot.getContext('2d');
    if (!shotCtx) return prev?.canvas;
    if (crop) {
      const px = shot.width / crop.width;
      const py = shot.height / crop.height;
      shotCtx.setTransform(px, 0, 0, py, -crop.x * px, -crop.y * py);
    } else shotCtx.setTransform(shot.width / frame.width, 0, 0, shot.height / frame.height, 0, 0);
    let root = roots.current.get(id);
    if (!root) {
      root = cache.get(board).root;
      roots.current.set(id, root);
    }
    const used = new Set<string>();
    const covered = crop ? crop.width : frame.width;
    const minPoint = shot.width > 0 ? covered / shot.width : 0;
    drawArtboard(
      shotCtx,
      root,
      doc,
      (ref) => {
        used.add(ref);
        return images.current.image(ref, false);
      },
      { minPoint },
    );
    pictureRefs.current.set(id, used);
    const base = crop ? prev?.base || (prev && !prev.crop ? prev.canvas : undefined) : undefined;
    const next: BoardPicture = { canvas: shot, scale, sharp, crop, base };
    pictures.current.set(id, next);
    return shot;
  }
  function dropPictures(ref: string) {
    for (const [id, refs] of pictureRefs.current) {
      if (!refs.has(ref)) continue;
      const prev = pictures.current.get(id);
      if (prev) prev.stale = true;
    }
  }
  function schedulePaint() {
    if (paintFrame.current) return;
    paintFrame.current = requestAnimationFrame(() => {
      paintFrame.current = 0;
      paint.current();
    });
  }
  function paintNow() {
    if (paintFrame.current) {
      cancelAnimationFrame(paintFrame.current);
      paintFrame.current = 0;
    }
    paint.current();
  }
  paint.current = paintSurface;
  repaint.current = schedulePaint;
  function boardRoot(board: Layer) {
    let root = roots.current.get(board.do_objectID);
    if (!root) {
      root = cache.get(board).root;
      roots.current.set(board.do_objectID, root);
    }
    return root;
  }
  function pageRect(entry: IndexedLayer, board: Layer): Rect {
    const b = entry.bounds;
    return { x: b.x + board.frame.x, y: b.y + board.frame.y, width: b.width, height: b.height };
  }
  function overviewDistances() {
    if (!selected || !selectedId) return [];
    const selectedBoard = boards.find((b) => b.do_objectID === selectedId);
    if (!selectedBoard) return [];
    const selectedEntry = cache.index(boardRoot(selectedBoard)).get(selected.do_objectID);
    if (!selectedEntry) return [];
    const pointer = hover.current;
    const hoverBoard = pointer
      ? boards.find((b) => b.do_objectID === pointer.boardId)
      : selectedBoard;
    if (!hoverBoard) return [];
    const hoverEntry =
      pointer?.entry || cache.index(boardRoot(hoverBoard)).get(hoverBoard.do_objectID);
    if (!hoverEntry || hoverEntry.layer.do_objectID === selectedEntry.layer.do_objectID) return [];
    return measure(pageRect(selectedEntry, selectedBoard), pageRect(hoverEntry, hoverBoard));
  }
  function strokeEntry(
    ctx: CanvasRenderingContext2D,
    entry: IndexedLayer,
    x: number,
    y: number,
    scale: number,
    color: string,
    width: number,
    dash?: number[],
  ) {
    const [first, ...rest] = entry.corners;
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(x + first.x, y + first.y);
    for (const point of rest) ctx.lineTo(x + point.x, y + point.y);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width / scale;
    ctx.setLineDash(dash ? dash.map((part) => part / scale) : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function setHover(
    next: { boardId: string; layerId: string | null; entry: IndexedLayer | null } | null,
  ) {
    const prev = hover.current;
    if (prev?.boardId === next?.boardId && prev?.layerId === next?.layerId) return;
    hover.current = next;
    schedulePaint();
  }
  function hitBoard(clientX: number, clientY: number) {
    const v = viewport.current;
    if (!v) return null;
    const rect = v.getBoundingClientRect(),
      cam = paintCamera(),
      x = (clientX - rect.left - cam.x) / cam.scale,
      y = (clientY - rect.top - cam.y) / cam.scale;
    for (let i = boards.length - 1; i >= 0; i--) {
      const f = boards[i].frame;
      if (x >= f.x && y >= f.y && x <= f.x + f.width && y <= f.y + f.height) return boards[i];
    }
    return null;
  }
  function pick(clientX: number, clientY: number, parent = false) {
    const board = hitBoard(clientX, clientY);
    const v = viewport.current;
    if (!board || !v) return board ? { board, entry: null } : null;
    const rect = v.getBoundingClientRect(),
      cam = paintCamera(),
      x = (clientX - rect.left - cam.x) / cam.scale - board.frame.x,
      y = (clientY - rect.top - cam.y) / cam.scale - board.frame.y,
      root = boardRoot(board);
    return { board, entry: hitAtPoint({ x, y }, root, cache.index(root), parent) };
  }
  useLayoutEffect(() => {
    const el = viewport.current!;
    if (shownPage.current !== pageId) {
      cameras.set(shownPage.current, camera);
      shownPage.current = pageId;
      cameraEpoch.current += 1;
    }
    const saved = cameras.get(pageId);
    const next = saved || fitCameraInArea(bounds, viewportArea(el));
    pendingCamera.current = null;
    current.current = next;
    hover.current = null;
    viewportOrigin.current = null;
    cameras.set(pageId, next);
    setCamera(next);
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      // Panel drags keep the canvas box frozen; ignore spurious RO callbacks.
      if (w === paintedSize.current.w && h === paintedSize.current.h) return;
      paintedSize.current = { w, h };
      const rect = el.getBoundingClientRect();
      const stable = stabilizeCameraOnResize(paintCamera(), viewportOrigin.current, rect);
      viewportOrigin.current = stable.origin;
      if (stable.camera !== paintCamera()) {
        pendingCamera.current = null;
        current.current = stable.camera;
        cameras.set(pageId, stable.camera);
        setCamera(stable.camera);
      }
      setSize({ w, h });
      paintNow();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageId, bounds, cameras]);
  useEffect(() => {
    if (seenEpoch.current !== cameraEpoch.current) {
      seenEpoch.current = cameraEpoch.current;
      return;
    }
    cameras.set(pageId, camera);
  }, [camera, cameras, pageId]);
  useEffect(() => {
    if (!focus) return;
    const b = boards.find(
        (b) => b.do_objectID === focus.id || focus.id.startsWith(b.do_objectID + '/'),
      ),
      el = viewport.current;
    if (!b || !el) return;
    try {
      setCamera(fitCameraInArea(b.frame, viewportArea(el), 2));
    } catch (e) {
      setPreviewNotice((e as Error).message);
    }
  }, [focus, boards]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isEditingTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        spaceKey.current = true;
        setSpace(true);
      }
      if (e.key === 'Alt') {
        e.preventDefault();
        if (!altKey.current) {
          altKey.current = true;
          schedulePaint();
        }
      }
      if (e.key === 'Escape') onSelect(null);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceKey.current = false;
        setSpace(false);
      }
      if (e.key === 'Alt') {
        altKey.current = false;
        schedulePaint();
      }
    };
    const reset = () => {
      spaceKey.current = false;
      altKey.current = false;
      setSpace(false);
      setDragging(false);
      drag.current = null;
      schedulePaint();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, [onSelect]);
  useEffect(() => {
    const el = viewport.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect(),
        factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      queueCamera((c) =>
        e.ctrlKey || e.metaKey
          ? zoomPage(c, c.scale * wheelZoomFactor(e), {
              x: e.clientX - rect.x,
              y: e.clientY - rect.y,
            })
          : {
              ...c,
              x: c.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * factor,
              y: c.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * factor,
            },
      );
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  useEffect(
    () => () => {
      cancelAnimationFrame(cameraFrame.current);
      cancelAnimationFrame(paintFrame.current);
      cameraFrame.current = 0;
      paintFrame.current = 0;
    },
    [],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      settled.current = true;
      for (const ref of pendingRefs.current) dropPictures(ref);
      pendingRefs.current.clear();
      schedulePaint();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [camera.x, camera.y, camera.scale]);
  useEffect(() => {
    if (imageDoc.current === doc) return;
    imageDoc.current = doc;
    roots.current.clear();
    pictures.current.clear();
    pictureRefs.current.clear();
    pendingRefs.current.clear();
    images.current.clear();
    images.current = new ImageLod(doc, (ref) => {
      if (settled.current) {
        dropPictures(ref);
        repaint.current();
      } else pendingRefs.current.add(ref);
    });
    schedulePaint();
  }, [doc]);
  useEffect(() => {
    schedulePaint();
  }, [camera, boards, selectedId, selected, search, size, dragging]);

  function zoom(f: number) {
    const el = viewport.current;
    if (!el) return;
    const area = viewportArea(el);
    queueCamera((c) =>
      zoomPage(c, c.scale * f, { x: area.x + area.width / 2, y: area.y + area.height / 2 }),
    );
  }
  useViewerShortcuts(
    zoom,
    () => {
      const el = viewport.current;
      if (el) queueCamera(() => fitCameraInArea(bounds, viewportArea(el)));
    },
    () => zoom(1 / (pendingCamera.current || current.current).scale),
  );
  function finish(e: React.PointerEvent) {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    if (
      e.type === 'pointerup' &&
      (d.pan || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4)
    ) {
      const next = panFromAnchor(
        d.camera,
        { x: d.startX, y: d.startY },
        { x: e.clientX, y: e.clientY },
      );
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) moved.current = true;
      pendingCamera.current = next;
    }
    cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = 0;
    const next = pendingCamera.current;
    pendingCamera.current = null;
    if (next) {
      current.current = next;
      setCamera(next);
    }
    drag.current = null;
    setDragging(false);
    schedulePaint();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <main className="center page-overview">
      <ViewerToolbar host={toolbarHost}>
        <span>
          {pageName}
          <i>/</i>页面总览 · {boards.length} 个画板
        </span>
        <div>
          <button
            aria-label="默认工具"
            aria-pressed={true}
            title="默认工具"
            onClick={() => viewport.current?.focus({ preventScroll: true })}
          >
            <MousePointer2 size={18} />
          </button>
          <ZoomMenu
            host={zoomHost}
            scale={camera.scale}
            onScale={(scale) => zoom(scale / (pendingCamera.current || current.current).scale)}
            onFit={() =>
              queueCamera(() => fitCameraInArea(bounds, viewportArea(viewport.current!)))
            }
            fitLabel="适合全部"
          />
        </div>
      </ViewerToolbar>
      <div
        className={`overview-viewport${space ? ' is-hand' : ''}${dragging ? ' dragging' : ''}`}
        ref={viewport}
        tabIndex={0}
        aria-label="页面总览画布，悬停预览，单击选中图层，按住 Alt 测量间距"
        data-camera-x={camera.x.toFixed(2)}
        data-camera-y={camera.y.toFixed(2)}
        data-camera-scale={camera.scale.toFixed(5)}
        data-surface="canvas"
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          e.currentTarget.focus({ preventScroll: true });
          moved.current = false;
          if (e.altKey) return;
          const pan = spaceKey.current || e.button === 1;
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            startX: e.clientX,
            startY: e.clientY,
            pan,
            camera: { ...(pendingCamera.current || current.current) },
          };
          if (pan) {
            e.preventDefault();
            moved.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) {
            if (e.altKey !== altKey.current) {
              altKey.current = e.altKey;
              schedulePaint();
            }
            if (spaceKey.current || dragging) setHover(null);
            else {
              const hit = pick(e.clientX, e.clientY, e.shiftKey);
              if (!hit) setHover(null);
              else {
                const cam = paintCamera();
                const sharp =
                  Math.max(hit.board.frame.width, hit.board.frame.height) * cam.scale > LIVE_SCREEN;
                const entry = sharp ? hit.entry : null;
                setHover({
                  boardId: hit.board.do_objectID,
                  layerId: entry?.layer.do_objectID ?? null,
                  entry,
                });
              }
            }
            return;
          }
          if (!d.pan) {
            if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= 4) return;
            d.pan = true;
            moved.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
          }
          e.preventDefault();
          setHover(null);
          const next = panFromAnchor(
            d.camera,
            { x: d.startX, y: d.startY },
            { x: e.clientX, y: e.clientY },
          );
          queueCamera(() => next);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={() => setHover(null)}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
        onClick={(e) => {
          if (moved.current || spaceKey.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          for (let i = boardLabels.current.length - 1; i >= 0; i--) {
            const { board, bounds: b } = boardLabels.current[i];
            if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
              onSelect(board);
              return;
            }
          }
          const hit = pick(e.clientX, e.clientY, e.shiftKey);
          if (!hit) {
            onSelect(null);
            return;
          }
          if (hit.entry) onLayer(hit.board, hit.entry.layer);
          else onSelect(hit.board);
        }}
        onContextMenu={(e) => {
          const board = hitBoard(e.clientX, e.clientY);
          if (!board) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, board });
        }}
      >
        <canvas ref={surface} className="work-canvas" />
      </div>
      {menu && (
        <ContextMenu position={menu} onClose={() => setMenu(null)}>
          <button
            onClick={() => {
              const el = viewport.current;
              if (el) queueCamera(() => fitCameraInArea(menu.board.frame, viewportArea(el)));
              setMenu(null);
            }}
          >
            <Maximize size={14} />
            缩放到画板
          </button>
          {detailEnabled && (
            <button
              onClick={() => {
                onOpen(menu.board);
                setMenu(null);
              }}
            >
              <ArrowUpRight size={14} />
              专注查看
            </button>
          )}
        </ContextMenu>
      )}
      {previewNotice && (
        <div className="canvas-foot" role="status">
          {previewNotice}
        </div>
      )}
    </main>
  );
}
