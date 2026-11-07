import { Frame, Shapes } from 'lucide-react';
import { spacePath } from './routes';

type Props = {
  spaceId?: string;
  section?: 'overview' | 'resources';
};

export function SpaceTree({ spaceId, section }: Props) {
  if (!spaceId) return null;
  const resources = section === 'resources';
  const all = section !== 'resources';
  return (
    <nav className="wb-team-tree management-team-list" aria-label="空间菜单">
      <a
        className={`wb-tree-root${all ? ' current' : ''}`}
        href={spacePath(spaceId)}
        aria-current={all ? 'page' : undefined}
      >
        <Frame size={15} strokeWidth={1.8} aria-hidden="true" />
        全部设计
      </a>
      <a
        className={`wb-tree-root${resources ? ' current' : ''}`}
        href={`${spacePath(spaceId)}/resources`}
        aria-current={resources ? 'page' : undefined}
      >
        <Shapes size={15} strokeWidth={1.8} aria-hidden="true" />
        资源
      </a>
    </nav>
  );
}
