import { useState, type ReactNode } from 'react';
import { Folder, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { folderPath } from './routes';
import { ContextMenu, type MenuPosition } from './ContextMenu';

type Props = {
  team: any;
  folders: any[];
  files: any[];
  listView?: boolean;
  headingActions?: ReactNode;
  onCreateFolder: () => void;
  onRename?: (kind: 'space' | 'folder', item: any) => void;
  onDelete?: (kind: 'space' | 'folder', item: any) => void;
};
function activityStamp(updated: number, created: number) {
  const when = updated || created;
  if (!when) return '';
  return `${updated > created ? '更新于' : '创建于'} ${new Date(when).toLocaleDateString('zh-CN')}`;
}
export function TeamOverview({
  team,
  folders,
  files,
  listView = false,
  headingActions,
  onRename,
  onDelete,
}: Props) {
  const [menu, setMenu] = useState<(MenuPosition & { kind: 'space' | 'folder'; item: any }) | null>(
    null,
  );
  if (!folders.length) return null;
  return (
    <div className="team-overview management-overview">
      <div className="wb-section-heading">
        <h2>文件夹</h2>
        {headingActions}
      </div>
      <div className={`team-overview-projects${listView ? ' list' : ''}`}>
        {folders.map((p) => {
          const latest = Math.max(0, ...files.filter((d) => d.folder_id === p.id).map((d) => d.updated || d.created || 0));
          return (
            <article className="management-project-card" key={p.id}>
              <a href={folderPath(p.id)} className="team-overview-project">
                <span className="team-overview-folder">
                  <Folder size={24} strokeWidth={1.6} />
                </span>
                <div>
                  <h3>{p.name}</h3>
                  <p>{activityStamp(latest, p.created || 0)}</p>
                </div>
              </a>
              {onRename && (
                <button
                  className="wb-icon-button"
                  aria-label={`${p.name}的文件夹操作`}
                  onClick={(e) =>
                    setMenu({ kind: 'folder', item: p, x: e.clientX, y: e.clientY })
                  }
                >
                  <Ellipsis size={16} />
                </button>
              )}
            </article>
          );
        })}
      </div>
      {menu && (
        <ContextMenu position={menu} onClose={() => setMenu(null)}>
          {onRename && (
            <button onClick={() => onRename(menu.kind, menu.item)}>
              <Pencil size={16} />
              重命名{menu.kind === 'space' ? '空间' : '文件夹'}
            </button>
          )}
          {onDelete && team.role === 'owner' && (
            <button className="danger" onClick={() => onDelete(menu.kind, menu.item)}>
              <Trash2 size={16} />
              删除{menu.kind === 'space' ? '空间' : '文件夹'}
            </button>
          )}
        </ContextMenu>
      )}
    </div>
  );
}
