import { File } from 'lucide-react';

type Page = { id: string; name: string; count: number };

export function PageList({
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
  function choose(id: string) {
    if (disabled) return;
    if (id !== value) onChange(id);
    else onReselect?.();
  }

  return (
    <div
      className="page-list"
      role="listbox"
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      {pages.map((page) => {
        const current = page.id === value;
        return (
          <button
            key={page.id}
            type="button"
            role="option"
            aria-selected={current}
            className={`page-list-item${current ? ' current' : ''}`}
            disabled={disabled}
            title={page.name}
            onClick={() => choose(page.id)}
          >
            <span className="page-list-icon">
              <File size={15} strokeWidth={1.7} />
            </span>
            <span className="page-list-name">{page.name}</span>
            <span className="page-list-count">{page.count}</span>
          </button>
        );
      })}
    </div>
  );
}
