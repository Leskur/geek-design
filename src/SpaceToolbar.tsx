import { useEffect, useRef, type ReactNode } from 'react';
import {
  ChevronDown,
  FileUp,
  Ellipsis,
  FolderPlus,
  Link2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
export function SpaceToolbar({
  spaceName,
  mark,
  canInvite,
  canRename,
  canDelete,
  canManageMembers,
  canUpload,
  identity = true,
  controls,
  onInvite,
  onMembers,
  onCreateFolder,
  onUpload,
  onRename,
  onCopy,
  onDelete,
}: {
  spaceName: string;
  mark: string;
  canInvite: boolean;
  canRename: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canUpload: boolean;
  identity?: boolean;
  controls?: ReactNode;
  onInvite: () => void;
  onMembers: () => void;
  onCreateFolder: () => void;
  onUpload: () => void;
  onRename: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const create = useRef<HTMLDetailsElement>(null);
  const actions = useRef<HTMLDetailsElement>(null);
  function close(menu: HTMLDetailsElement | null) {
    if (menu) menu.open = false;
  }
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      for (const menu of [create.current, actions.current]) {
        if (menu && !menu.contains(event.target)) menu.open = false;
      }
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const groups: ReactNode[][] = [
    [
      canManageMembers ? (
        <button key="members" type="button" role="menuitem" onClick={() => { close(actions.current); onMembers(); }}>
          <Users size={16} aria-hidden="true" />
          成员
        </button>
      ) : null,
      canInvite ? (
        <button key="invite" type="button" role="menuitem" onClick={() => { close(actions.current); onInvite(); }}>
          <UserPlus size={16} aria-hidden="true" />
          邀请
        </button>
      ) : null,
    ],
    [
      <button key="copy" type="button" role="menuitem" onClick={() => { close(actions.current); onCopy(); }}>
        <Link2 size={16} aria-hidden="true" />
        复制链接
      </button>,
      canRename ? (
        <button key="rename" type="button" role="menuitem" onClick={() => { close(actions.current); onRename(); }}>
          <Pencil size={16} aria-hidden="true" />
          重命名
        </button>
      ) : null,
    ],
    [
      canDelete ? (
        <button
          key="delete"
          type="button"
          role="menuitem"
          className="danger"
          onClick={() => {
            close(actions.current);
            onDelete();
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
          删除
        </button>
      ) : null,
    ],
  ]
    .map((group) => group.filter(Boolean))
    .filter((group) => group.length > 0);
  return (
    <div className="wb-space-head">
      <div className="wb-toolbar-actions">
        <details className="wb-create" ref={create}>
          <summary className="primary">
            <Plus size={16} aria-hidden="true" />
            新建
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="wb-create-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { close(create.current); onCreateFolder(); }}>
              <FolderPlus size={16} aria-hidden="true" />
              文件夹
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canUpload}
              onClick={() => {
                close(create.current);
                onUpload();
              }}
            >
              <FileUp size={16} aria-hidden="true" />
              上传设计
            </button>
          </div>
        </details>
        {canInvite && (
          <button type="button" onClick={onInvite}>
            <UserPlus size={16} aria-hidden="true" />
            邀请
          </button>
        )}
      </div>
      {identity && (
        <div className="wb-space-title-row">
          <div className="wb-space-title">
            <span className="wb-space-title-mark" aria-hidden="true">
              {mark}
            </span>
            <h1>{spaceName}</h1>
            <details className="wb-space-ops" ref={actions}>
              <summary aria-label="空间操作">
                <Ellipsis size={16} aria-hidden="true" />
              </summary>
              <div className="wb-create-menu" role="menu">
                {groups.map((group, index) => (
                  <div key={index} className="wb-menu-group">
                    {index > 0 && <div className="wb-menu-sep" />}
                    {group}
                  </div>
                ))}
              </div>
            </details>
          </div>
          {controls}
        </div>
      )}
    </div>
  );
}
