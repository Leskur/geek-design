import { type MouseEvent } from 'react';
import { Folder, Users, UserPlus, Plus, Settings, Type } from 'lucide-react';
import { teamPath } from './routes';
export function TeamPageHeader({
  team,
  projectCount,
  fileCount,
  members,
  onNavigate,
  onRename,
  onDelete,
  onInvite,
  onCreateProject,
  settings = false,
  fonts = false,
}: {
  team: any;
  projectCount: number;
  fileCount: number;
  members: boolean;
  settings?: boolean;
  fonts?: boolean;
  onNavigate?: (
    e: MouseEvent<HTMLAnchorElement>,
    members: boolean,
    settings?: boolean,
    fonts?: boolean,
  ) => void;
  onRename: () => void;
  onDelete: () => void;
  onInvite?: () => void;
  onCreateProject?: () => void;
}) {
  return (
    <div className="management-team-header">
      <div className="team-overview-heading">
        <span className="team-overview-avatar">{Array.from(team.name as string)[0]}</span>
        <div>
          <h1>{team.name}</h1>
        </div>
        {team.role !== 'member' && (
          <div className="management-team-actions">
            {onInvite && (
              <button onClick={onInvite}>
                <UserPlus size={16} />
                邀请成员
              </button>
            )}
            {onCreateProject && (
              <button className="primary" onClick={onCreateProject}>
                <Plus size={16} />
                新建项目
              </button>
            )}
          </div>
        )}
      </div>
      <nav className="management-team-tabs" aria-label="团队内容">
        <a
          href={teamPath(team.id)}
          aria-current={!members && !settings && !fonts ? 'page' : undefined}
          onClick={(e) => onNavigate?.(e, false)}
        >
          <Folder size={16} />
          项目<span className="management-tab-count">{projectCount}</span>
        </a>
        <a
          href={teamPath(team.id) + '/members'}
          aria-current={members ? 'page' : undefined}
          onClick={(e) => onNavigate?.(e, true)}
        >
          <Users size={16} />
          成员<span className="management-tab-count">{team.member_count}</span>
        </a>
        <a
          href={teamPath(team.id) + '/fonts'}
          aria-current={fonts ? 'page' : undefined}
          onClick={(e) => onNavigate?.(e, false, false, true)}
        >
          <Type size={16} />
          字体库
        </a>
        <a
          href={teamPath(team.id) + '/settings'}
          aria-current={settings ? 'page' : undefined}
          onClick={(e) => onNavigate?.(e, false, true)}
        >
          <Settings size={16} />
          设置
        </a>
      </nav>
    </div>
  );
}
