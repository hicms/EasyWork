import * as React from 'react';
import { Button, Icon, Input, Select } from 'easywork-ui';
import type { Project, ProjectTemplate } from 'easywork-contracts/projects';

interface Props {
  projects: readonly Project[];
  templates: readonly ProjectTemplate[];
  query: string;
  status: Project['status'];
  onQuery: (query: string) => void;
  onStatus: (status: Project['status']) => void;
  onOpen: (id: string) => void;
  onCreate: (template?: ProjectTemplate) => void;
  onArchive: (project: Project) => void;
  onRestore: (project: Project) => void;
}

const updatedDate = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' });

export function ProjectOverview({ projects, templates, query, status, onQuery, onStatus, onOpen, onCreate, onArchive, onRestore }: Props) {
  // The service returns the current subject's projects in last-updated order.
  const recent = status === 'active' && !query.trim() ? projects[0] : undefined;

  return <div className="easywork-page-content wd-project-overview">
    <nav className="wd-project-breadcrumb" aria-label="当前位置"><span>个人空间</span><span aria-hidden="true">/</span><span aria-current="page">项目</span></nav>
    <header className="easywork-page-header">
      <div><h1 className="easywork-page-title">让想法，有处安放。</h1><p className="easywork-page-description">把资料、对话和灵感，放进同一个项目。</p></div>
      <Button variant="primary" onClick={() => onCreate()}><Icon name="plus" size={16} />新建项目</Button>
    </header>

    {recent && <section className="wd-project-recent" aria-labelledby="wd-project-recent-title">
      <h2 id="wd-project-recent-title">继续最近的工作</h2>
      <div className="easywork-card wd-project-feature">
        <span className="wd-project-icon wd-project-icon-accent"><Icon name="folder" size={26} /></span>
        <div className="wd-project-feature-body"><h3>{recent.name}</h3><p>{recent.description || '接着整理资料，推进项目中的想法与任务。'}</p><small>更新于 <time dateTime={recent.updatedAt}>{updatedDate.format(new Date(recent.updatedAt))}</time></small></div>
        <Button onClick={() => onOpen(recent.id)}><Icon name="arrowUpRight" size={16} />打开项目</Button>
      </div>
    </section>}

    <section aria-labelledby="wd-project-list-title">
      <div className="wd-project-section-header">
        <h2 id="wd-project-list-title">{status === 'active' ? '全部项目' : '已归档项目'}</h2>
        <div className="easywork-toolbar wd-project-filters">
          <Select value={status} onChange={event => onStatus(event.target.value as Project['status'])} aria-label="项目状态"><option value="active">进行中</option><option value="archived">已归档</option></Select>
          <Input value={query} onChange={event => onQuery(event.target.value)} aria-label="搜索项目" placeholder="搜索项目" />
        </div>
      </div>
      {projects.length ? <table className="wd-project-table">
        <thead><tr><th scope="col">项目名称</th><th scope="col" className="wd-project-date">最近更新</th><th scope="col"><span className="wd-project-sr">操作</span></th></tr></thead>
        <tbody>{projects.map(project => <tr key={project.id}>
          <td>{project.status === 'active' ? <button type="button" className="wd-project-open" onClick={() => onOpen(project.id)}>
            <span className="wd-project-icon"><Icon name="folder" size={20} /></span><span><strong>{project.name}</strong><small>{project.description || '个人项目'}</small></span>
          </button> : <div className="wd-project-open"><span className="wd-project-icon"><Icon name="folder" size={20} /></span><span><strong>{project.name}</strong><small>{project.description || '已归档'}</small></span></div>}</td>
          <td className="wd-project-date"><time dateTime={project.updatedAt}>{updatedDate.format(new Date(project.updatedAt))}</time></td>
          <td><div className="wd-project-row-actions">{project.status === 'active' ? <>
            <Button variant="ghost" size="sm" aria-label={`归档${project.name}`} onClick={() => onArchive(project)}>归档</Button>
            <Button variant="ghost" size="sm" aria-label={`打开${project.name}`} onClick={() => onOpen(project.id)}><Icon name="arrowRight" size={16} /></Button>
          </> : <Button variant="ghost" size="sm" aria-label={`恢复${project.name}`} onClick={() => onRestore(project)}>恢复</Button>}</div></td>
        </tr>)}</tbody>
      </table> : <div className="easywork-empty" role="status">{query.trim() ? '没有找到匹配的项目' : status === 'active' ? '从一个想法开始，创建你的第一个项目。' : '没有已归档项目'}</div>}
      <p className="wd-project-count" aria-live="polite">{projects.length} 个{query.trim() ? '匹配的' : ''}项目</p>
    </section>

    {templates.length > 0 && <details className="wd-project-templates">
      <summary>从模板创建<Icon name="chevron" size={16} /></summary>
      <div className="wd-project-template-list">{templates.map(template => <button type="button" key={template.id} className="easywork-card wd-project-template" onClick={() => onCreate(template)}>
        <Icon name="folder" size={20} /><span><strong>{template.name}</strong><small>{template.description}</small></span><Icon name="arrowUpRight" size={16} />
      </button>)}</div>
    </details>}
  </div>;
}
