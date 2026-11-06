import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { DesignSort } from './workbench';

const options: { id: DesignSort; label: string }[] = [
  { id: 'updated', label: '最近更新' },
  { id: 'name', label: '名称排序' },
];

export function SortMenu({
  value,
  onChange,
}: {
  value: DesignSort;
  onChange: (value: DesignSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const current = options.find((option) => option.id === value) || options[0];
  return (
    <div className={`wb-sort${open ? ' open' : ''}`} ref={root}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="设计排序"
        onClick={() => setOpen((v) => !v)}
      >
        {current.label}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="wb-create-menu" role="listbox" aria-label="设计排序">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              <Check size={14} aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
