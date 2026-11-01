import {ArrowLeft} from 'lucide-react';
import {projectPath} from './routes';
export function ViewerNavigation({projectId}:{projectId?:string}){return <a className="team-link viewer-back" href={projectId?projectPath(projectId):'/teams'}><ArrowLeft size={16}/>{projectId?'返回项目':'工作台'}</a>;}
