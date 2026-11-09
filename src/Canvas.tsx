import { MousePointer2 } from 'lucide-react';
import { ZoomMenu } from './ZoomMenu';
import { wheelZoomFactor } from './wheel-zoom';
import { stabilizeCameraOnResize, viewportArea } from './viewport-area';
import { ViewerToolbar, useViewerShortcuts } from './ViewerToolbar';
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Layer, DocumentSource } from './sketch';
import { color } from './sketch';
import type { Scene } from '../shared/rendering/scene';
import { Children, LiteRenderContext } from '../shared/rendering/renderer';
import { drawArtboard, type BitmapSource } from './canvas-scene';
import {
  countLayers,
  fitCameraInArea,
  panFromAnchor,
  hitAtPoint,
  indexLayers,
  isEditingTarget,
  measure,
  panBy,
  pointerToArtboard,
  zoomAt,
  type Camera,
  type Distance,
  type IndexedLayer,
  type Rect,
} from './interaction';
import { ellipsisText } from './overview';
import { paintRuler } from './canvas-overlay';

function strokePolygon(
  ctx: CanvasRenderingContext2D,
  corners: { x: number; y: number }[],
  stroke: string,
  lineWidth: number,
  dash?: number[],
) {
  if (corners.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash || []);
  ctx.stroke();
  ctx.setLineDash([]);
}

const ignore = () => {};
export const Drawing = memo(function Drawing({
  root,
  doc,
  lite = false,
}: {
  root: Layer;
  doc: DocumentSource;
  lite?: boolean;
}) {
  return (
    <LiteRenderContext.Provider value={lite}>
      <Children
        layers={root.layers || []}
        doc={doc}
        choose={ignore}
        w={root.frame.width}
        h={root.frame.height}
      />
    </LiteRenderContext.Provider>
  );
});
export function Outline({
  entry,
  scale,
  kind,
}: {
  entry: IndexedLayer;
  scale: number;
  kind: 'selected' | 'hover';
}) {
  return (
    <polygon
      data-testid={`${kind}-outline`}
      data-layer-id={entry.layer.do_objectID}
      points={entry.corners.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke={kind === 'selected' ? '#7656e8' : '#9c84e3'}
      strokeWidth={(kind === 'selected' ? 1.5 : 1) / scale}
      strokeDasharray={kind === 'hover' ? `${3 / scale} ${2 / scale}` : undefined}
    />
  );
}
export function Ruler({ distance: d, scale }: { distance: Distance; scale: number }) {
  const x = (d.from.x + d.to.x) / 2,
    y = (d.from.y + d.to.y) / 2,
    label = `${Number(d.value.toFixed(1))}`,
    width = (label.length * 6 + 12) / scale,
    height = 17 / scale;
  const lx = d.axis === 'x' ? x - width / 2 : x + 7 / scale,
    ly = d.axis === 'x' ? y - 23 / scale : y - height / 2;
  return (
    <g className="distance" data-distance={Number(d.value.toFixed(3))}>
      {d.guides.map((g, i) => (
        <line
          key={i}
          x1={g.from.x}
          y1={g.from.y}
          x2={g.to.x}
          y2={g.to.y}
          strokeDasharray={`${3 / scale} ${3 / scale}`}
          opacity=".6"
        />
      ))}
      <line x1={d.from.x} y1={d.from.y} x2={d.to.x} y2={d.to.y} />
      {[d.from, d.to].map((p, i) => (
        <line
          key={i}
          x1={p.x - (d.axis === 'y' ? 3 / scale : 0)}
          y1={p.y - (d.axis === 'x' ? 3 / scale : 0)}
          x2={p.x + (d.axis === 'y' ? 3 / scale : 0)}
          y2={p.y + (d.axis === 'x' ? 3 / scale : 0)}
        />
      ))}
      <rect
        x={lx}
        y={ly}
        width={width}
        height={height}
        rx={3 / scale}
        fill="#f45a76"
        stroke="none"
      />
      <text
        data-testid="measurement-label"
        x={lx + width / 2}
        y={ly + height / 2}
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={10 / scale}
        fill="white"
        stroke="none"
      >
        {label}
      </text>
    </g>
  );
}

export function Canvas({
  doc,
  scene,
  board,
  pageName,
  selected,
  onSelect,
  onWarnings,
  onOverview,
  focusRequest,
  toolbarHost,
  zoomHost,
  cameras,
  cameraKey,
}: {
  doc: DocumentSource;
  scene: Scene | null;
  board: Layer;
  pageName: string;
  selected: Layer | null;
  onSelect: (l: Layer | null) => void;
  onWarnings: () => void;
  onOverview: () => void;
  focusRequest: { id: string; serial: number } | null;
  toolbarHost?: HTMLElement | null;
  zoomHost?: HTMLElement | null;
  cameras?: Map<string, Camera>;
  cameraKey?: string;
}) {
  const root = scene?.root || null,
    frame = board.frame,
    bg = board.hasBackgroundColor ? color(board.backgroundColor) : '#fff',
    viewport = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLCanvasElement>(null),
    index = useMemo(() => (root ? indexLayers(root) : new Map()), [root]),
    layers = useMemo(() => countLayers(root || board), [root, board]);
  const key = cameraKey || board.do_objectID;
  const [camera, setCameraState] = useState<Camera>(
      () => cameras?.get(key) || { x: 60, y: 50, scale: 0.7 },
    ),
    [space, setSpace] = useState(false),
    [dragging, setDragging] = useState(false),
    [alt, setAlt] = useState(false),
    [inside, setInside] = useState(false),
    [hoverId, setHoverId] = useState<string | null>(null);
  const cameraRef = useRef(camera),
    cameraFrame = useRef(0),
    pendingCamera = useRef<Camera | null>(null),
    bitmaps = useRef(new Map<string, HTMLImageElement>()),
    paintFrame = useRef(0),
    paint = useRef<() => void>(() => {}),
    boardLabel = useRef<Rect | null>(null),
    settled = useRef(true),
    boardPicture = useRef<{ canvas: HTMLCanvasElement; scale: number } | null>(null),
    pictureDirty = useRef(false),
    settleTimer = useRef(0),
    overlayRef = useRef({
      selectedEntry: null as IndexedLayer | null | undefined,
      hovered: null as IndexedLayer | null | undefined,
      distances: [] as Distance[],
      space: false,
      dragging: false,
    }),
    viewportOrigin = useRef<{ left: number; top: number } | null>(null),
    paintedSize = useRef({ w: 0, h: 0 });
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
  const bitmap: BitmapSource = (ref) => {
    const cached = bitmaps.current.get(ref);
    if (cached) return cached.complete && cached.naturalWidth ? cached : null;
    const img = new Image();
    bitmaps.current.set(ref, img);
    void doc.image(ref).then((url) => {
      if (!url) return;
      img.onload = () => {
        if (settled.current) {
          boardPicture.current = null;
          schedulePaint();
        } else pictureDirty.current = true;
      };
      img.src = url;
    });
    return null;
  };
  function paintSurface() {
    const canvas = surface.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = resizeSurface(),
      cam = cameraRef.current,
      overlay = overlayRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * cam.scale, 0, 0, dpr * cam.scale, dpr * cam.x, dpr * cam.y);
    const picture = root ? detailPicture(root, cam.scale, dpr) : null;
    if (picture) ctx.drawImage(picture, 0, 0, frame.width, frame.height);
    if (overlay.selectedEntry)
      strokePolygon(ctx, overlay.selectedEntry.corners, '#7656e8', 1.5 / cam.scale);
    if (
      overlay.hovered &&
      overlay.hovered !== overlay.selectedEntry &&
      !overlay.space &&
      !overlay.dragging
    )
      strokePolygon(ctx, overlay.hovered.corners, '#9c84e3', 1 / cam.scale, [
        3 / cam.scale,
        2 / cam.scale,
      ]);
    for (const d of overlay.distances) paintRuler(ctx, d, cam.scale);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#8f919f';
    ctx.font = '10px Inter, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const label = ellipsisText(ctx, board.name, frame.width * cam.scale);
    ctx.fillText(label, cam.x, cam.y - 8);
    boardLabel.current = label
      ? { x: cam.x, y: cam.y - 22, width: ctx.measureText(label).width, height: 16 }
      : null;
  }
  function detailPicture(rootLayer: Layer, scale: number, dpr: number) {
    const prev = boardPicture.current;
    if (prev && Math.abs(prev.scale - scale) < 0.001) return prev.canvas;
    if (!settled.current && prev) return prev.canvas;
    let width = rootLayer.frame.width * scale * dpr;
    let height = rootLayer.frame.height * scale * dpr;
    const edge = Math.max(width, height);
    if (edge > 8192) {
      const fit = 8192 / edge;
      width *= fit;
      height *= fit;
    }
    const shot = document.createElement('canvas');
    shot.width = Math.max(1, Math.round(width));
    shot.height = Math.max(1, Math.round(height));
    const shotCtx = shot.getContext('2d');
    if (!shotCtx) return prev?.canvas;
    shotCtx.setTransform(
      shot.width / rootLayer.frame.width,
      0,
      0,
      shot.height / rootLayer.frame.height,
      0,
      0,
    );
    drawArtboard(shotCtx, rootLayer, doc, bitmap);
    boardPicture.current = { canvas: shot, scale };
    return shot;
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
  function commitCamera(next: Camera, syncReact: boolean) {
    settled.current = false;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settled.current = true;
      if (pictureDirty.current) {
        boardPicture.current = null;
        pictureDirty.current = false;
      }
      schedulePaint();
    }, 160);
    cameraRef.current = next;
    cameras?.set(key, next);
    schedulePaint();
    if (!syncReact) return;
    pendingCamera.current = next;
    if (!cameraFrame.current)
      cameraFrame.current = requestAnimationFrame(() => {
        cameraFrame.current = 0;
        const queued = pendingCamera.current;
        pendingCamera.current = null;
        if (queued) setCameraState(queued);
      });
  }
  function setCamera(update: Camera | ((camera: Camera) => Camera)) {
    const next = typeof update === 'function' ? update(cameraRef.current) : update;
    commitCamera(next, true);
  }
  const keys = useRef({ space: false, alt: false }),
    drag = useRef<{ id: number; x: number; y: number; camera: Camera; pan: boolean } | null>(null),
    suppress = useRef(false);
  const selectedEntry = selected && root ? index.get(selected.do_objectID) : null,
    hovered = hoverId ? index.get(hoverId) : null;
  const target =
    alt && inside && selectedEntry && !hovered && root ? index.get(root.do_objectID) : hovered;
  const distances =
    alt && selectedEntry && target && selectedEntry !== target && !space && !dragging
      ? measure(selectedEntry.bounds, target.bounds)
      : [];
  overlayRef.current = { selectedEntry, hovered, distances, space, dragging };
  function fit(widthOnly = false) {
    const v = viewport.current;
    if (v)
      setCamera(
        fitCameraInArea(
          { x: 0, y: 0, width: frame.width, height: frame.height },
          viewportArea(v),
          widthOnly ? 4 : 1,
          widthOnly,
        ),
      );
  }
  useLayoutEffect(() => {
    setHoverId(null);
    bitmaps.current.clear();
    boardPicture.current = null;
    pictureDirty.current = false;
    viewportOrigin.current = null;
    if (!cameras?.has(key)) fit();
    schedulePaint();
  }, [board.do_objectID, key, cameras]);
  useEffect(() => {
    schedulePaint();
  }, [
    selectedEntry,
    hovered,
    distances,
    camera,
    space,
    dragging,
    frame.width,
    frame.height,
    bg,
    board.name,
    root,
  ]);
  useEffect(() => {
    const v = viewport.current;
    if (!v) return;
    const ro = new ResizeObserver(() => {
      const w = v.clientWidth,
        h = v.clientHeight;
      // Panel drags keep the canvas box frozen; ignore spurious RO callbacks.
      if (w === paintedSize.current.w && h === paintedSize.current.h) return;
      paintedSize.current = { w, h };
      const rect = v.getBoundingClientRect();
      const stable = stabilizeCameraOnResize(cameraRef.current, viewportOrigin.current, rect);
      viewportOrigin.current = stable.origin;
      if (stable.camera !== cameraRef.current) {
        cameraRef.current = stable.camera;
        cameras?.set(key, stable.camera);
        pendingCamera.current = stable.camera;
        if (!cameraFrame.current)
          cameraFrame.current = requestAnimationFrame(() => {
            cameraFrame.current = 0;
            const queued = pendingCamera.current;
            pendingCamera.current = null;
            if (queued) setCameraState(queued);
          });
      }
      paintNow();
    });
    ro.observe(v);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = viewport.current,
      entry = focusRequest ? index.get(focusRequest.id) : null;
    if (el && entry) setCamera(fitCameraInArea(entry.bounds, viewportArea(el), 2));
  }, [focusRequest, index]);
  useEffect(() => {
    const v = viewport.current;
    if (!v) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? v.clientHeight : 1;
      const bounds = v.getBoundingClientRect();
      setHoverId(null);
      if (e.ctrlKey || e.metaKey)
        setCamera(
          zoomAt(cameraRef.current, cameraRef.current.scale * wheelZoomFactor(e), {
            x: e.clientX - bounds.x,
            y: e.clientY - bounds.y,
          }),
        );
      else
        setCamera(
          panBy(
            cameraRef.current,
            -(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * factor,
            -(e.shiftKey && !e.deltaX ? 0 : e.deltaY) * factor,
          ),
        );
    };
    v.addEventListener('wheel', wheel, { passive: false });
    return () => {
      v.removeEventListener('wheel', wheel);
    };
  }, [root]);
  useEffect(
    () => () => {
      cancelAnimationFrame(cameraFrame.current);
      cancelAnimationFrame(paintFrame.current);
      window.clearTimeout(settleTimer.current);
      cameras?.set(key, pendingCamera.current || cameraRef.current);
    },
    [cameras, key],
  );
  useEffect(() => {
    function reset() {
      keys.current = { space: false, alt: false };
      setSpace(false);
      setAlt(false);
      setDragging(false);
      setHoverId(null);
      drag.current = null;
    }
    function down(e: KeyboardEvent) {
      if (isEditingTarget(e.target) || e.ctrlKey || e.metaKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        keys.current.space = true;
        setSpace(true);
        setHoverId(null);
      }
      if (e.key === 'Alt') {
        e.preventDefault();
        keys.current.alt = true;
        setAlt(true);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (e.repeat) return;
        setHoverId(null);
        if (!selectedEntry) {
          onOverview();
          return;
        }
        const parent = selectedEntry?.parent ? index.get(selectedEntry.parent) : null;
        onSelect(parent?.parent ? parent.layer : null);
      }
    }
    function up(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        keys.current.space = false;
        setSpace(false);
      }
      if (e.key === 'Alt') {
        keys.current.alt = false;
        setAlt(false);
      }
    }
    function hidden() {
      if (document.hidden) reset();
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [index, selectedEntry, onSelect, onOverview]);
  function hitFromPointer(clientX: number, clientY: number, parent = false) {
    const v = viewport.current;
    if (!v || !root) return null;
    const point = pointerToArtboard(
      { x: clientX, y: clientY },
      v.getBoundingClientRect(),
      cameraRef.current,
    );
    return hitAtPoint(point, root, index, parent)?.layer.do_objectID || null;
  }
  function end(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    if (e.type === 'pointerup' && (d.pan || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4)) {
      suppress.current = true;
      commitCamera(panFromAnchor(d.camera, d, { x: e.clientX, y: e.clientY }), true);
    }
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function click(e: React.MouseEvent<HTMLCanvasElement>) {
    e.stopPropagation();
    e.preventDefault();
    if (suppress.current || keys.current.space || keys.current.alt || e.altKey) return;
    const label = boardLabel.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (
      label &&
      x >= label.x &&
      x <= label.x + label.width &&
      y >= label.y &&
      y <= label.y + label.height
    ) {
      onSelect(board);
      return;
    }
    const id = hitFromPointer(e.clientX, e.clientY, e.shiftKey);
    onSelect(id ? index.get(id)!.layer : null);
  }
  function zoom(factor: number) {
    const v = viewport.current;
    if (v) {
      const area = viewportArea(v);
      setCamera((c) =>
        zoomAt(c, c.scale * factor, { x: area.x + area.width / 2, y: area.y + area.height / 2 }),
      );
    }
  }
  useViewerShortcuts(
    zoom,
    () => fit(),
    () => zoom(1 / cameraRef.current.scale),
  );

  return (
    <main className="center">
      <ViewerToolbar host={toolbarHost}>
        <span>
          {pageName}
          <i>/</i>
          <b>{board.name}</b>
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
            onScale={(scale) => zoom(scale / cameraRef.current.scale)}
            onFit={() => fit()}
            fitLabel="适合画板"
          />
        </div>
      </ViewerToolbar>
      <div
        ref={viewport}
        className={`viewport interactive-canvas${space ? ' is-space' : ''}${dragging ? ' is-dragging' : ''}`}
        tabIndex={0}
        aria-label="设计画布，悬停预览，单击选中内部图层，Shift 选择父级，拖动平移画布，按住 Alt 测量间距"
        data-space={space}
        data-dragging={dragging}
        data-camera-x={camera.x.toFixed(2)}
        data-camera-y={camera.y.toFixed(2)}
        data-camera-scale={camera.scale.toFixed(5)}
        data-surface="canvas"
        data-layers={layers}
        onPointerDown={(e) => {
          suppress.current = false;
          if (e.button !== 0 && e.button !== 1) return;
          e.currentTarget.focus({ preventScroll: true });
          if (keys.current.alt || e.altKey) return;
          const pan = keys.current.space || e.button === 1;
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            camera: { ...cameraRef.current },
            pan,
          };
          if (pan) {
            e.preventDefault();
            suppress.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            setHoverId(null);
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && d.id === e.pointerId) {
            if (!d.pan) {
              if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 4) return;
              d.pan = true;
              suppress.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
              setHoverId(null);
            }
            e.preventDefault();
            commitCamera(panFromAnchor(d.camera, d, { x: e.clientX, y: e.clientY }), false);
            return;
          }
          if (e.altKey !== keys.current.alt) {
            keys.current.alt = e.altKey;
            setAlt(e.altKey);
          }
          if (keys.current.space) return;
          setHoverId(
            hitFromPointer(e.clientX, e.clientY, e.shiftKey && !keys.current.alt && !e.altKey),
          );
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
          setCameraState({ ...cameraRef.current });
        }}
        onPointerEnter={() => setInside(true)}
        onPointerLeave={() => {
          setInside(false);
          if (!drag.current) setHoverId(null);
        }}
        onClickCapture={(e) => {
          if (suppress.current || keys.current.space || keys.current.alt) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <canvas ref={surface} className="work-canvas" onClick={click} />
      </div>
      {!!scene?.warnings.length && (
        <div className="canvas-foot">
          <button className="compatibility" onClick={onWarnings}>
            查看 {scene.warnings.length} 项兼容提示
          </button>
        </div>
      )}
    </main>
  );
}
