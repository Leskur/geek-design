import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

type Page = { id: string; name: string; count: number };
function PageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4.5" y="4.5" width="8" height="9" rx="1.5" stroke="currentColor" />
      <path d="M9.5 2.5h-5a2 2 0 0 0-2 2v6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}
export function PageSwitcher({
  pages,
  value,
  disabled = false,
  onChange,
  onReselect,
  label = '页面',
}: {
  label?: string;
  pages: Page[];
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
  onReselect?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    options = useRef<(HTMLDivElement | null)[]>([]),
    typed = useRef({ text: '', time: 0 });
  const listId = useId(),
    selected = Math.max(
      0,
      pages.findIndex((p) => p.id === value),
    ),
    page = pages[selected];
  useEffect(() => {
    setActive(selected);
    setOpen(false);
  }, [value, disabled]);
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
    const p = pages[index];
    if (!p) return;
    setOpen(false);
    setActive(index);
    trigger.current?.focus();
    if (p.id !== value) onChange(p.id);
    else onReselect?.();
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      setActive(
        open
          ? Math.max(0, Math.min(pages.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)))
          : selected,
      );
      setOpen(true);
    } else if (e.key === 'Home' || e.key === 'End') {
      setActive(e.key === 'Home' ? 0 : pages.length - 1);
      setOpen(true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (open) choose(active);
      else {
        setActive(selected);
        setOpen(true);
      }
    } else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.stopPropagation();
      const now = Date.now();
      typed.current = {
        text:
          (now - typed.current.time < 600 ? typed.current.text : '') + e.key.toLocaleLowerCase(),
        time: now,
      };
      const next = pages.findIndex((p) =>
        p.name.toLocaleLowerCase().startsWith(typed.current.text),
      );
      if (next >= 0) {
        setActive(next);
        setOpen(true);
      }
    }
  }
  return (
    <div
      className="page-switcher"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className={`page-switcher-trigger${open ? ' expanded' : ''}`}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled || !pages.length}
        onKeyDown={key}
        onClick={() => {
          setActive(selected);
          setOpen((v) => !v);
        }}
      >
        <span className="page-switcher-icon">
          <PageIcon />
        </span>
        <span className="page-switcher-name">{page?.name || `选择${label}`}</span>
        <span className="page-switcher-count">{page?.count ?? 0}</span>
        <svg
          className="page-switcher-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m3 4.5 3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="page-switcher-popover">
          <div className="page-switcher-heading">
            {label}
            <span>{pages.length}</span>
          </div>
          <div role="listbox" id={listId} aria-label={label} className="page-switcher-options">
            {pages.map((p, i) => (
              <div
                key={p.id}
                id={`${listId}-${i}`}
                ref={(el) => {
                  options.current[i] = el;
                }}
                role="option"
                aria-selected={p.id === value}
                className={`page-switcher-option${i === active ? ' highlighted' : ''}${p.id === value ? ' current' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="page-switcher-icon">
                  <PageIcon />
                </span>
                <span className="page-switcher-name" title={p.name}>
                  {p.name}
                </span>
                <span className="page-switcher-count">{p.count}</span>
                <span className="page-switcher-check" aria-hidden="true">
                  {p.id === value ? '✓' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
