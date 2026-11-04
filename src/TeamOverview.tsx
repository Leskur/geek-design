import { ManagementSearch } from './ManagementSearch';
import { useState } from 'react';
import { Folder, Plus, ChevronRight, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { projectPath } from './routes';
import { ContextMenu, type MenuPosition } from './ContextMenu';

type Props = {
  team: any;
  projects: any[];
  files: any[];
  onCreateProject: () => void;
  onRename?: (kind: 'team' | 'project', item: any) => void;
  onDelete?: (kind: 'team' | 'project', item: any) => void;
};
export function TeamOverview({
  team,
  projects,
  files,
  onCreateProject,
  onRename,
  onDelete,
}: Props) {
  const canCreate = team.role !== 'member',
    [query, setQuery] = useState(''),
    [menu, setMenu] = useState<(MenuPosition & { kind: 'team' | 'project'; item: any }) | null>(
      null,
    );
  const visible = projects.filter((p) =>
    p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="team-overview management-overview">
      <ManagementSearch
        label="搜索项目"
        value={query}
        onChange={setQuery}
        result={query ? `${visible.length} 个匹配项目` : undefined}
      />

      {visible.length ? (
        <div className="team-overview-projects">
          {visible.map((p) => {
            const designs = files.filter((d) => d.project_id === p.id),
              updated = Math.max(0, ...designs.map((d) => d.updated || d.created || 0));
            return (
              <article className="management-project-card" key={p.id}>
                <a href={projectPath(p.id)} className="team-overview-project">
                  <span className="team-overview-folder">
                    <Folder size={24} strokeWidth={1.6} />
                  </span>
                  <div>
                    <h3>{p.name}</h3>
                    <p>{designs.length} 份设计文件</p>
                  </div>
                  <ChevronRight size={16} />
                </a>
                <div className="management-project-footer">
                  <span>
                    {updated
                      ? `更新于 ${new Date(updated).toLocaleDateString('zh-CN')}`
                      : '尚未上传设计'}
                  </span>
                  {p.role === 'owner' && onRename && (
                    <button
                      className="wb-icon-button"
                      aria-label={`${p.name}的项目操作`}
                      onClick={(e) =>
                        setMenu({ kind: 'project', item: p, x: e.clientX, y: e.clientY })
                      }
                    >
                      <Ellipsis size={16} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="wb-soft-empty">
          <Folder size={30} />
          <h3>
            {query ? '没有找到匹配的项目' : canCreate ? '创建第一个项目' : '还没有可查看的项目'}
          </h3>
          <p>
            {query ? '试试其他名称，或清除搜索。' : '把相关设计放在同一个项目，方便查找和交付。'}
          </p>
          {query ? (
            <button onClick={() => setQuery('')}>清除搜索</button>
          ) : (
            canCreate && (
              <button className="primary" onClick={onCreateProject}>
                <Plus size={15} />
                新建项目
              </button>
            )
          )}
        </div>
      )}
      {menu && (
        <ContextMenu position={menu} onClose={() => setMenu(null)}>
          {onRename && (
            <button onClick={() => onRename(menu.kind, menu.item)}>
              <Pencil size={16} />
              重命名{menu.kind === 'team' ? '团队' : '项目'}
            </button>
          )}
          {onDelete && (menu.kind === 'project' || team.role === 'owner') && (
            <button className="danger" onClick={() => onDelete(menu.kind, menu.item)}>
              <Trash2 size={16} />
              删除{menu.kind === 'team' ? '团队' : '项目'}
            </button>
          )}
        </ContextMenu>
      )}
    </div>
  );
}
