import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, LogOut, Plus } from 'lucide-react';
import { spacePath } from './routes';
import { rememberSpace } from './workbench';
import { visit } from './visit';

export type SpaceOption = {
  id: string;
  name: string;
  kind?: string;
  role?: string;
};

function sortSpaces(spaces: SpaceOption[]) {
  return [...spaces].sort((a, b) => {
    if (a.kind === 'personal' && b.kind !== 'personal') return -1;
    if (b.kind === 'personal' && a.kind !== 'personal') return 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

function spaceMark(space: { name: string; kind?: string } | undefined, username?: string) {
  const source = space?.kind === 'personal' && username ? username : space?.name || '空';
  return Array.from(source)[0]?.toUpperCase() || '空';
}

function kindLabel(kind?: string) {
  return kind === 'personal' ? '个人' : '协作';
}

export function SpaceSwitcher({
  userId,
  username,
  spaces,
  value,
  busy = false,
  onCreate,
  onLogout,
}: {
  userId: string;
  username?: string;
  spaces: SpaceOption[];
  value?: string;
  busy?: boolean;
  onCreate: () => void;
  onLogout?: () => void;
}) {
  const sorted = sortSpaces(spaces);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [box, setBox] = useState({ top: 0, left: 0, width: 248 });
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    options = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId(),
    selected = Math.max(
      0,
      sorted.findIndex((s) => s.id === value),
    ),
    current = sorted[selected];
  useEffect(() => {
    setActive(selected);
    setOpen(false);
  }, [value, selected]);
  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open) options.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  function choose(index: number) {
    const space = sorted[index];
    if (!space) return;
    setOpen(false);
    trigger.current?.focus();
    if (space.id === value) return;
    rememberSpace(userId, space.id);
    visit(spacePath(space.id));
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      setActive(
        open
          ? Math.max(0, Math.min(sorted.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)))
          : selected,
      );
      setOpen(true);
    } else if (e.key === 'Home' || e.key === 'End') {
      setActive(e.key === 'Home' ? 0 : sorted.length - 1);
      setOpen(true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (open) choose(active);
      else {
        setActive(selected);
        setOpen(true);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
  }
  return (
    <div
      className={`wb-space-switch${open ? ' open' : ''}`}
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="wb-space-trigger"
        role="combobox"
        aria-label="切换空间"
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={busy || !sorted.length}
        onKeyDown={key}
        onClick={() => {
          const rect = trigger.current?.getBoundingClientRect();
          if (rect)
            setBox({
              top: rect.bottom + 6,
              left: rect.left,
              width: Math.max(rect.width, 248),
            });
          setActive(selected);
          setOpen((v) => !v);
        }}
      >
        <span className="wb-space-mark" aria-hidden="true">
          {spaceMark(current, username)}
        </span>
        <span className="wb-space-trigger-name">{current?.name || '选择空间'}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && current && (
        <div
          className="wb-space-menu"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          <div className="wb-space-identity">
            <span className="wb-space-mark lg" aria-hidden="true">
              {spaceMark(current, username)}
            </span>
            <b>{current.name}</b>
            <span className="wb-space-kind">{kindLabel(current.kind)}</span>
          </div>
          <p className="wb-space-section">空间</p>
          <div role="listbox" id={listId} aria-label="空间" className="wb-space-options">
            {sorted.map((space, i) => (
              <button
                key={space.id}
                id={`${listId}-${i}`}
                ref={(el) => {
                  options.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={space.id === value}
                className={`wb-space-option${i === active ? ' highlighted' : ''}${space.id === value ? ' current' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="wb-space-mark" aria-hidden="true">
                  {spaceMark(space, username)}
                </span>
                <span className="wb-space-option-name">{space.name}</span>
                <span className="wb-space-tag">{kindLabel(space.kind)}</span>
              </button>
            ))}
          </div>
          <div className="wb-space-footer">
            <button
              type="button"
              className="wb-space-create"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              <Plus size={15} />
              新建协作空间
            </button>
            {onLogout && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={14} />
                退出登录
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
