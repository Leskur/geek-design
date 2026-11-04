import { ArrowLeft, X } from 'lucide-react';
import { localOnly, projectPath, withBase } from './routes';
export function ViewerNavigation({
  projectId,
  detail = false,
  onOverview,
}: {
  projectId?: string;
  detail?: boolean;
  onOverview?: () => void;
}) {
  if (detail)
    return (
      <button
        type="button"
        className="viewer-back"
        aria-label="返回总览"
        title="返回总览"
        onClick={onOverview}
      >
        <ArrowLeft size={18} />
      </button>
    );
  const href = localOnly ? withBase('/') : withBase(projectId ? projectPath(projectId) : '/teams');
  const label = localOnly
    ? '关闭设计，返回首页'
    : projectId
      ? '关闭设计，返回项目'
      : '关闭设计，返回工作台';
  return (
    <a className="team-link viewer-back" href={href} aria-label={label} title={label}>
      <X size={18} />
    </a>
  );
}
