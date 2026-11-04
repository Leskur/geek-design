import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type CSSProperties,
} from 'react';
import { color, point, type Layer, type DocumentSource } from '../document';
import { geometry, transform, fillRule } from './geometry';
import { maskChains, textRuns } from './scene';
import { fontFamilies } from '../fonts';

type Props = { l: Layer; doc: DocumentSource; choose: (l: Layer) => void; interactive?: boolean };
const blends = [
  'normal',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

export function Bitmap({
  doc,
  refName,
  w,
  h,
  fit = 'none',
}: {
  doc: DocumentSource;
  refName: string;
  w: number;
  h: number;
  fit?: string;
}) {
  const [url, setUrl] = useState(
    () =>
      (doc as DocumentSource & { previewImages?: Map<string, string> }).previewImages?.get(
        refName,
      ) || '',
  );
  useEffect(() => {
    let active = true;
    setUrl('');
    doc
      .image(refName)
      .then((x) => {
        if (active) setUrl(x);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [doc, refName]);
  return url ? <image href={url} width={w} height={h} preserveAspectRatio={fit} /> : null;
}

function ClipShape({ l, parent = '' }: { l: Layer; parent?: string }) {
  const d = geometry(l),
    matrix = `${parent} ${transform(l)}`;
  // SVG clipPath accepts geometry directly; a <g> child creates an empty clip in Chromium.
  return d ? (
    <path d={d} transform={matrix} clipRule={fillRule(l)} />
  ) : l.layers?.length ? (
    <>
      {l.layers.map((x) => (
        <ClipShape key={x.do_objectID} l={x} parent={matrix} />
      ))}
    </>
  ) : (
    <rect transform={matrix} width={l.frame.width} height={l.frame.height} />
  );
}

export function Children({
  layers,
  doc,
  choose,
  w,
  h,
  interactive = true,
}: {
  layers: Layer[];
  doc: DocumentSource;
  choose: (l: Layer) => void;
  w: number;
  h: number;
  interactive?: boolean;
}) {
  const key = useId().replace(/:/g, '');
  const chains = maskChains(layers);
  return (
    <>
      {chains.map(({ layer: l, mask }, i) => {
        const clipId = `clip-${key}-${i}`;
        return (
          <React.Fragment key={l.do_objectID}>
            {mask && (
              <defs>
                {mask.clippingMaskMode === 1 ? (
                  <mask
                    id={clipId}
                    maskUnits="userSpaceOnUse"
                    x={-w}
                    y={-h}
                    width={w * 3}
                    height={h * 3}
                    style={{ maskType: 'alpha' }}
                  >
                    <Node l={mask} doc={doc} choose={() => {}} interactive={false} />
                  </mask>
                ) : (
                  <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                    <ClipShape l={mask} />
                  </clipPath>
                )}
              </defs>
            )}
            <g
              clipPath={mask && mask.clippingMaskMode !== 1 ? `url(#${clipId})` : undefined}
              mask={mask?.clippingMaskMode === 1 ? `url(#${clipId})` : undefined}
            >
              <Node l={l} doc={doc} choose={choose} interactive={interactive} />
            </g>
          </React.Fragment>
        );
      })}
    </>
  );
}

function Gradient({ paint, id }: { paint: any; id: string }) {
  const g = paint.gradient,
    a = point(g.from, 1, 1),
    b = point(g.to, 1, 1);
  const stops = g.stops?.map((s: any, i: number) => (
    <stop key={i} offset={s.position} stopColor={color(s.color)} />
  ));
  if (g.gradientType === 1)
    return (
      <radialGradient
        id={id}
        cx={a[0]}
        cy={a[1]}
        r={Math.max(0.0001, Math.hypot(b[0] - a[0], b[1] - a[1]))}
      >
        {stops}
      </radialGradient>
    );
  return (
    <linearGradient id={id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}>
      {stops}
    </linearGradient>
  );
}

function Shape({ l, doc, maskId }: { l: Layer; doc: DocumentSource; maskId: string }) {
  const { width: w, height: h } = l.frame,
    s = l.style || {},
    d = geometry(l);
  const fills = (s.fills || []).filter((p: any) => p.isEnabled),
    borders = (s.borders || []).filter((p: any) => p.isEnabled);
  if (!d) return null;
  const opacity = (p: any) => p.contextSettings?.opacity ?? 1;
  const paint = (p: any, id: string) => (p.fillType === 1 ? `url(#${id})` : color(p.color));
  const common = { d, fillRule: fillRule(l) };
  return (
    <>
      <defs>
        <clipPath id={maskId}>
          <path {...common} />
        </clipPath>
        {[...fills, ...borders].map((p: any, i: number) =>
          p.fillType === 1 ? <Gradient key={i} paint={p} id={`${maskId}-p${i}`} /> : null,
        )}
      </defs>
      {fills.map((p: any, i: number) =>
        p.fillType === 4 && p.image?._ref ? (
          <g key={i} clipPath={`url(#${maskId})`} opacity={opacity(p)}>
            <Bitmap
              doc={doc}
              refName={p.image._ref}
              w={w}
              h={h}
              fit={
                p.patternFillType === 2
                  ? 'none'
                  : p.patternFillType === 3
                    ? 'xMidYMid meet'
                    : 'xMidYMid slice'
              }
            />
          </g>
        ) : (
          <path key={i} {...common} fill={paint(p, `${maskId}-p${i}`)} opacity={opacity(p)} />
        ),
      )}
      {borders.map((p: any, i: number) => {
        const id = `${maskId}-border${i}`,
          inside = p.position === 1,
          outside = p.position === 2;
        return (
          <React.Fragment key={i}>
            {outside && (
              <defs>
                <mask
                  id={id}
                  maskUnits="userSpaceOnUse"
                  x={-w - 100}
                  y={-h - 100}
                  width={w * 3 + 200}
                  height={h * 3 + 200}
                >
                  <rect
                    x={-w - 100}
                    y={-h - 100}
                    width={w * 3 + 200}
                    height={h * 3 + 200}
                    fill="white"
                  />
                  <path {...common} fill="black" />
                </mask>
              </defs>
            )}
            <path
              {...common}
              fill="none"
              stroke={paint(p, `${maskId}-p${fills.length + i}`)}
              strokeWidth={(p.thickness || 0) * (inside || outside ? 2 : 1)}
              clipPath={inside ? `url(#${maskId})` : undefined}
              mask={outside ? `url(#${id})` : undefined}
              strokeLinecap={
                (['butt', 'round', 'square'] as const)[s.borderOptions?.lineCapStyle || 0]
              }
              strokeLinejoin={
                (['miter', 'round', 'bevel'] as const)[s.borderOptions?.lineJoinStyle || 0]
              }
              strokeDasharray={s.borderOptions?.dashPattern?.join(' ')}
              opacity={opacity(p)}
            />
          </React.Fragment>
        );
      })}
      {!fills.length && !borders.length && <path {...common} fill="transparent" />}
    </>
  );
}

export function fontStyle(a: any): CSSProperties {
  const f = a.MSAttributedStringFontAttribute?.attributes || {};
  return {
    fontFamily: [
      ...fontFamilies(f.name || 'Arial').map((name) => `"${name.replace(/["\\]/g, '')}"`),
      '"Microsoft YaHei"',
      'sans-serif',
    ].join(','),
    fontSize: f.size || 14,
    fontWeight: /black|heavy/i.test(f.name)
      ? 900
      : /semibold|demibold/i.test(f.name)
        ? 600
        : /bold/i.test(f.name)
          ? 700
          : /medium/i.test(f.name)
            ? 500
            : /light|thin/i.test(f.name)
              ? 300
              : 400,
    fontStyle: /italic|oblique/i.test(f.name) ? 'italic' : 'normal',
    color: a.MSAttributedStringColorAttribute ? color(a.MSAttributedStringColorAttribute) : '#000',
    letterSpacing: a.kerning || 0,
    textDecoration:
      [a.underlineStyle ? 'underline' : '', a.strikethroughStyle ? 'line-through' : '']
        .filter(Boolean)
        .join(' ') || undefined,
  };
}
export const ThumbnailTextContext = createContext(false);
/** Low-detail preview: compact text and skip expensive filters (shadows). */
export const LiteRenderContext = createContext(false);
function Text({ l }: { l: Layer }) {
  const runs = textRuns(l),
    first = runs[0]?.attributes || {},
    p = first.paragraphStyle || {},
    size = first.MSAttributedStringFontAttribute?.attributes?.size || 14,
    vertical = l.style?.textStyle?.verticalAlignment || 0;
  const thumbnailText = useContext(ThumbnailTextContext),
    liteRender = useContext(LiteRenderContext),
    compact = thumbnailText || liteRender;
  const autoWidth = l.textBehaviour === 0;
  if (compact) {
    const style = fontStyle(first),
      lineHeight = p.maximumLineHeight || p.minimumLineHeight || size * 1.2;
    return (
      <svg
        width={Math.max(1, l.frame.width)}
        height={Math.max(1, l.frame.height)}
        overflow="hidden"
      >
        <text
          x={p.alignment === 2 ? l.frame.width / 2 : p.alignment === 1 ? l.frame.width : 0}
          y={size}
          textAnchor={p.alignment === 2 ? 'middle' : p.alignment === 1 ? 'end' : 'start'}
          fill={style.color}
          fontFamily={style.fontFamily}
          fontSize={size}
          fontWeight={style.fontWeight}
          fontStyle={style.fontStyle}
        >
          {runs
            .map((r) => r.text)
            .join('')
            .split(/\r?\n/)
            .map((line, i) => (
              <tspan
                key={i}
                x={p.alignment === 2 ? l.frame.width / 2 : p.alignment === 1 ? l.frame.width : 0}
                dy={i ? lineHeight : 0}
              >
                {line}
              </tspan>
            ))}
        </text>
      </svg>
    );
  }
  return (
    <foreignObject
      width={Math.max(1, l.frame.width)}
      height={Math.max(1, l.frame.height)}
      style={{ overflow: autoWidth ? 'visible' : 'hidden' }}
    >
      <div
        {...{ xmlns: 'http://www.w3.org/1999/xhtml' }}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: vertical === 1 ? 'center' : vertical === 2 ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            ...fontStyle(first),
            lineHeight: p.maximumLineHeight
              ? `${p.maximumLineHeight}px`
              : p.minimumLineHeight
                ? `${p.minimumLineHeight}px`
                : `${size * 1.2}px`,
            textAlign:
              ({ 0: 'left', 1: 'right', 2: 'center', 3: 'justify' } as any)[p.alignment] || 'left',
            whiteSpace: autoWidth ? 'pre' : 'pre-wrap',
            overflowWrap: autoWidth ? 'normal' : 'break-word',
            width: autoWidth ? 'max-content' : undefined,
            minWidth: autoWidth ? '100%' : undefined,
            flexShrink: 0,
            margin: 0,
          }}
        >
          {runs.map((run, i) => (
            <span key={i} style={fontStyle(run.attributes)}>
              {run.text}
            </span>
          ))}
        </div>
      </div>
    </foreignObject>
  );
}

export function Node({ l, doc, choose, interactive = true }: Props) {
  const key = useId().replace(/:/g, '');
  const liteRender = useContext(LiteRenderContext),
    thumbnailText = useContext(ThumbnailTextContext),
    lite = liteRender || thumbnailText;
  if (l.isVisible === false || l._hiddenSymbol || l._class === 'slice') return null;
  const { width: w, height: h } = l.frame,
    s = l.style || {};
  const shape = [
    'rectangle',
    'oval',
    'shapePath',
    'shapeGroup',
    'triangle',
    'star',
    'polygon',
  ].includes(l._class);
  const shadows = lite
    ? ''
    : (s.shadows || [])
        .filter((x: any) => x.isEnabled)
        .map(
          (x: any) =>
            `drop-shadow(${x.offsetX || 0}px ${x.offsetY || 0}px ${Math.max(0, (x.blurRadius || 0) / 2)}px ${color(x.color)})`,
        )
        .join(' ');
  return (
    <g
      data-layer={interactive ? l.do_objectID : undefined}
      transform={transform(l)}
      opacity={s.contextSettings?.opacity ?? 1}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              choose(l);
            }
          : undefined
      }
      style={{
        cursor: interactive ? 'pointer' : undefined,
        mixBlendMode: (lite
          ? 'normal'
          : blends[s.contextSettings?.blendMode || 0] || 'normal') as CSSProperties['mixBlendMode'],
        filter: shadows || undefined,
      }}
    >
      {shape ? (
        <>
          <Shape l={l} doc={doc} maskId={`shape-${key}`} />
          {interactive &&
            l.layers?.map((child) => <GeometryMarker key={child.do_objectID} l={child} />)}
        </>
      ) : l._class === 'text' ? (
        <Text l={l} />
      ) : l._class === 'bitmap' ? (
        <Bitmap doc={doc} refName={l.image?._ref || ''} w={w} h={h} />
      ) : l._missingSymbol ? (
        <>
          <rect width={w} height={h} fill="#a78bfa15" stroke="#a78bfa" strokeDasharray="4 4" />
          <title>缺少组件：{l.symbolID}</title>
        </>
      ) : (
        <>
          {l._background && <rect width={w} height={h} fill={color(l._background)} />}
          {l.layers?.length ? (
            <>
              <rect width={w} height={h} fill="transparent" />
              <Children
                layers={l.layers}
                doc={doc}
                choose={choose}
                w={w}
                h={h}
                interactive={interactive}
              />
            </>
          ) : null}
        </>
      )}
    </g>
  );
}

function GeometryMarker({ l }: { l: Layer }) {
  if (l.isVisible === false) return null;
  return (
    <g data-layer={l.do_objectID} transform={transform(l)} pointerEvents="none">
      <path d={geometry(l)} fill="none" stroke="none" />
      {l.layers?.map((child) => (
        <GeometryMarker key={child.do_objectID} l={child} />
      ))}
    </g>
  );
}
