import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Folder, Type, Image, Shapes } from 'lucide-react';
import type { Layer } from './sketch';
import { matchesLayer } from './overview';
import { indexLayers } from './interaction';
export function LayerTree({
  root,
  selected,
  choose,
  query = '',
}: {
  root: Layer;
  selected: Layer | null;
  choose: (l: Layer) => void;
  query?: string;
}) {
  const index = useMemo(() => indexLayers(root), [root]),
    path = useMemo(() => {
      const ids = new Set<string>();
      if (query.trim())
        for (const e of index.values())
          if (matchesLayer(e.layer, query)) ids.add(e.layer.do_objectID);
      let e = selected ? index.get(selected.do_objectID) : null;
      while (e) {
        ids.add(e.layer.do_objectID);
        e = e.parent ? index.get(e.parent) : undefined;
      }
      return ids;
    }, [index, selected, query]);
  return (
    <>
      {root.layers?.map((l) => (
        <TreeNode
          key={l.do_objectID}
          layer={l}
          path={path}
          selected={selected?.do_objectID}
          choose={choose}
          query={query}
          level={0}
        />
      ))}
    </>
  );
}
function TreeNode({
  layer: l,
  path,
  selected,
  choose,
  level,
  query,
}: {
  query: string;
  layer: Layer;
  path: Set<string>;
  selected?: string;
  choose: (l: Layer) => void;
  level: number;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(level === 0),
    active = selected === l.do_objectID,
    children = !!l.layers?.length,
    Icon = l._class === 'text' ? Type : l._class === 'bitmap' ? Image : children ? Folder : Shapes;
  useEffect(() => {
    if (path.has(l.do_objectID)) setOpen(true);
  }, [path, l.do_objectID]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() =>
      ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, path]);
  if (l.isVisible === false || l._hiddenSymbol || (query.trim() && !matchesLayer(l, query)))
    return null;
  return (
    <div>
      <div
        ref={ref}
        className={`layer-tree-row${active ? ' active' : ''}`}
        style={{ paddingLeft: 8 + level * 12 }}
      >
        <button
          className="layer-tree-toggle"
          aria-label={`${open ? '收起' : '展开'}${l.name}`}
          aria-expanded={children ? open : undefined}
          disabled={!children}
          onClick={() => setOpen((v) => !v)}
        >
          {children && (
            <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
          )}
        </button>
        <button
          className="layer-tree-name"
          aria-current={active ? 'true' : undefined}
          title={l.name}
          onClick={() => choose(l)}
        >
          <Icon size={13} />
          <span>{l.name}</span>
        </button>
      </div>
      {children && open && (
        <div>
          {l.layers!.map((child) => (
            <TreeNode
              key={child.do_objectID}
              layer={child}
              path={path}
              selected={selected}
              choose={choose}
              query={query}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
