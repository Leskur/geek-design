import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Frame } from 'lucide-react';
import type { Layer } from './sketch';
import type { SceneCache } from './SceneCache';
import { LayerTree } from './LayerTree';
import { matchesBoardName } from './overview';
export function UnifiedTree({
  boards,
  cache,
  activeBoardId,
  selected,
  search,
  onBoard,
  onLayer,
}: {
  boards: Layer[];
  cache: SceneCache;
  activeBoardId?: string;
  selected: Layer | null;
  search: string;
  onBoard: (b: Layer) => void;
  onLayer: (b: Layer, l: Layer) => void;
}) {
  const filtered = useMemo(
    () => boards.filter((b) => matchesBoardName(b, search)),
    [boards, search],
  );
  return (
    <div className="list unified-tree" aria-label="页面画板与图层">
      {filtered.map((b) => (
        <BoardNode
          key={b.do_objectID}
          board={b}
          cache={cache}
          active={activeBoardId === b.do_objectID}
          selected={selected}
          onBoard={onBoard}
          onLayer={onLayer}
        />
      ))}
      {!filtered.length && <p className="unified-no-results">没有找到匹配的图层</p>}
    </div>
  );
}
function BoardNode({
  board: b,
  cache,
  active,
  selected,
  onBoard,
  onLayer,
}: {
  board: Layer;
  cache: SceneCache;
  active: boolean;
  selected: Layer | null;
  onBoard: (b: Layer) => void;
  onLayer: (b: Layer, l: Layer) => void;
}) {
  const [open, setOpen] = useState(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active && selected && selected.do_objectID !== b.do_objectID) setOpen(true);
  }, [active, selected, b.do_objectID]);
  useEffect(() => {
    if (active && selected?.do_objectID === b.do_objectID) {
      const frame = requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'nearest' }));
      return () => cancelAnimationFrame(frame);
    }
  }, [active, selected, b]);
  const scene = useMemo(() => {
    if (!open) return null;
    try {
      return cache.get(b);
    } catch {
      return null;
    }
  }, [open, b, cache]);
  return (
    <section className="unified-board">
      <div
        ref={ref}
        className={`unified-board-row${active && selected?.do_objectID === b.do_objectID ? ' active' : ''}`}
      >
        <button
          className="layer-tree-toggle"
          aria-label={`${open ? '收起画板' : '展开画板'} ${b.name}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
        </button>
        <button
          className="unified-board-name"
          aria-label={`导航画板 ${b.name}`}
          title={b.name}
          onClick={() => onBoard(b)}
        >
          <Frame size={15} />
          <span>{b.name}</span>
        </button>
      </div>
      {open && (
        <div className="unified-board-children">
          {scene ? (
            <LayerTree
              root={scene.root}
              selected={active ? selected : null}
              choose={(l) => onLayer(b, l)}
            />
          ) : (
            <p className="unified-no-results">图层暂不可用，请尝试打开画板</p>
          )}
        </div>
      )}
    </section>
  );
}
