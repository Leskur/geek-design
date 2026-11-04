import { createPortal } from 'react-dom';
import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { ContextMenu, type MenuPosition } from './ContextMenu';

export function ZoomMenu({
  scale,
  onScale,
  onFit,
  fitLabel,
  host,
}: {
  host?: HTMLElement | null;
  scale: number;
  onScale: (scale: number) => void;
  onFit: () => void;
  fitLabel: string;
}) {
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const content = (
    <>
      <button
        className="zoom-menu-trigger"
        aria-label={`缩放比例 ${Math.round(scale * 100)}%`}
        aria-expanded={!!menu}
        aria-haspopup="true"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu(menu ? null : { x: rect.left, y: rect.bottom + 6 });
        }}
      >
        {Math.round(scale * 100)}%<ChevronDown size={12} />
      </button>
      {menu && (
        <ContextMenu position={menu} onClose={() => setMenu(null)}>
          <button title="适合视图 (Ctrl + 0)" onClick={onFit}>
            {fitLabel}
          </button>
          {[0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4].map((value) => (
            <button
              key={value}
              title={value === 1 ? '原始大小 (Ctrl + 1)' : undefined}
              onClick={() => onScale(value)}
            >
              <span className="zoom-menu-check">
                {Math.abs(scale - value) < 0.0001 && <Check size={13} />}
              </span>
              {Math.round(value * 100)}%
            </button>
          ))}
        </ContextMenu>
      )}
    </>
  );
  return host ? createPortal(content, host) : content;
}
