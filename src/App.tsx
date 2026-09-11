import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Activity, AlertCircle, ArrowRight, BriefcaseBusiness, Building2, CalendarClock, ClipboardList,
  CalendarDays, Check, ChevronRight, Clock3, Columns3, Download, ExternalLink,
  FileText, FolderOpen, Inbox, LayoutDashboard, Link as LinkIcon, MapPin, MoreHorizontal,
  PenLine, Plus, Save, Search, Trash2, Trophy, X,
} from 'lucide-react'
import type { Application, ApplicationInput, EventInput, InterviewEvent, Review, ReviewDocument, Snapshot, Stage } from './types'
import { dateTime, fullDateTime, relativeTime, shortDate, toInputDate, toInputDateTime } from './utils'
import Opportunities from './Opportunities'

type View = 'dashboard' | 'applications' | 'opportunities' | 'kanban' | 'schedule'

const EMPTY: Snapshot = { applications: [], events: [], reviews: [], stages: [], history: [], dataRoot: '' }

const viewMeta: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: '投递概览', subtitle: '把握每一个正在发生的机会' },
  applications: { title: '投递记录', subtitle: '集中查看和管理所有申请' },
  opportunities: { title: '待投岗位', subtitle: '收集值得投递的公司，不错过截止日期' },
  kanban: { title: '招聘流程', subtitle: '拖动卡片即可更新进度' },
  schedule: { title: '面试日程', subtitle: '近期安排按时间由近到远展示' },
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [view, setView] = useState<View>('dashboard')
  const [loading, setLoading] = useState(true)
  const [applicationForm, setApplicationForm] = useState<Application | 'new' | null>(null)
  const [eventForm, setEventForm] = useState<{ applicationId: string; event?: InterviewEvent } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewDocument, setReviewDocument] = useState<ReviewDocument | null>(null)
  const [toast, setToast] = useState<string>('')
  const [opportunityAddSignal, setOpportunityAddSignal] = useState(0)

  useEffect(() => {
    window.offerManager.getSnapshot().then(setSnapshot).catch(error => setToast(error.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  const selected = snapshot.applications.find(item => item.id === selectedId) || null

  async function perform(action: () => Promise<Snapshot>, message?: string) {
    try {
      const next = await action()
      setSnapshot(next)
      if (message) setToast(message)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '操作失败，请重试')
    }
  }

  async function createReview(applicationId: string, eventId?: string | null) {
    try {
      const result = await window.offerManager.createReview({ applicationId, eventId })
      setSnapshot(result.snapshot)
      setReviewDocument(await window.offerManager.readReview(result.review.id))
    } catch (error) {
      setToast(error instanceof Error ? error.message : '创建失败')
    }
  }

  async function openReview(review: Review) {
    try { setReviewDocument(await window.offerManager.readReview(review.id)) }
    catch (error) { setToast(error instanceof Error ? error.message : '无法打开文件') }
  }

  const meta = viewMeta[view]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">O</div>
          <div><strong>Offer Manager</strong><span>秋招进度管家</span></div>
        </div>
        <nav>
          <NavItem icon={<LayoutDashboard />} label="投递概览" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <NavItem icon={<BriefcaseBusiness />} label="投递记录" active={view === 'applications'} onClick={() => setView('applications')} count={snapshot.applications.length} />
          <NavItem icon={<ClipboardList />} label="待投岗位" active={view === 'opportunities'} onClick={() => setView('opportunities')} />
          <NavItem icon={<Columns3 />} label="招聘流程" active={view === 'kanban'} onClick={() => setView('kanban')} />
          <NavItem icon={<CalendarDays />} label="面试日程" active={view === 'schedule'} onClick={() => setView('schedule')} />
        </nav>
        <div className="sidebar-footer">
          <button className="sidebar-action" onClick={() => window.offerManager.exportCsv().then(ok => ok && setToast('CSV 已导出'))}>
            <Download /> 导出投递记录
          </button>
          <button className="sidebar-action" onClick={() => window.offerManager.showDataFolder()}>
            <FolderOpen /> 打开数据目录
          </button>
          <p>数据仅保存在这台电脑</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><h1>{meta.title}</h1><p>{meta.subtitle}</p></div>
          <button className="button primary" onClick={() => view === 'opportunities' ? setOpportunityAddSignal(value => value + 1) : setApplicationForm('new')}><Plus /> {view === 'opportunities' ? '添加岗位' : '新建投递'}</button>
        </header>

        <div className="page-body">
          {loading ? <Loading /> : view === 'dashboard' ? (
            <Dashboard snapshot={snapshot} onSelect={setSelectedId} onAdd={() => setApplicationForm('new')} onGoSchedule={() => setView('schedule')} />
          ) : view === 'applications' ? (
            <Applications snapshot={snapshot} onSelect={setSelectedId} onEdit={setApplicationForm} onAdd={() => setApplicationForm('new')} onCreateReview={createReview} />
          ) : view === 'opportunities' ? (
            <Opportunities addSignal={opportunityAddSignal} onToast={setToast} />
          ) : view === 'kanban' ? (
            <Kanban snapshot={snapshot} onSelect={setSelectedId} onStatus={(id, status) => perform(() => window.offerManager.updateApplicationStatus({ id, status }), `已移动到「${status}」`)} />
          ) : (
            <Schedule snapshot={snapshot} onSelect={setSelectedId} onAdd={() => {
              const first = snapshot.applications[0]
              if (first) setEventForm({ applicationId: first.id })
              else setApplicationForm('new')
            }} />
          )}
        </div>
      </main>

      {applicationForm && <ApplicationModal
        value={applicationForm === 'new' ? undefined : applicationForm}
        stages={snapshot.stages}
        onClose={() => setApplicationForm(null)}
        onSave={input => perform(() => window.offerManager.saveApplication(input), input.id ? '投递记录已更新' : '投递记录已创建').then(() => setApplicationForm(null))}
      />}

      {eventForm && <EventModal
        applicationId={eventForm.applicationId}
        application={snapshot.applications.find(item => item.id === eventForm.applicationId)}
        value={eventForm.event}
        onClose={() => setEventForm(null)}
        onSave={input => perform(() => window.offerManager.saveEvent(input), '日程已保存').then(() => setEventForm(null))}
      />}

      {selected && <ApplicationDetail
        application={selected}
        snapshot={snapshot}
        onClose={() => setSelectedId(null)}
        onEdit={() => setApplicationForm(selected)}
        onAddEvent={() => setEventForm({ applicationId: selected.id })}
        onEditEvent={event => setEventForm({ applicationId: selected.id, event })}
        onCreateReview={createReview}
        onOpenReview={openReview}
        onRefresh={setSnapshot}
        onToast={setToast}
        onDelete={() => {
          if (confirm(`确认删除 ${selected.company} / ${selected.role}？相关日程和复盘关联也会删除。`)) {
            perform(() => window.offerManager.deleteApplication(selected.id), '投递记录已删除').then(() => setSelectedId(null))
          }
        }}
      />}

      {reviewDocument && <ReviewEditor
        document={reviewDocument}
        onClose={() => setReviewDocument(null)}
        onSave={(content) => perform(() => window.offerManager.saveReview({ id: reviewDocument.review.id, content }), '复盘已保存')}
        onExternal={() => window.offerManager.openReviewExternal(reviewDocument.review.id).catch(error => setToast(error.message))}
      />}

      {toast && <div className="toast"><Check />{toast}</div>}
    </div>
  )
}

function NavItem({ icon, label, active, onClick, count }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; count?: number }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <em>{count}</em>}</button>
}

function Loading() {
  return <div className="loading"><div className="loader"/><span>正在读取本地数据…</span></div>
}

function Dashboard({ snapshot, onSelect, onAdd, onGoSchedule }: { snapshot: Snapshot; onSelect: (id: string) => void; onAdd: () => void; onGoSchedule: () => void }) {
  const activeStatuses = new Set(snapshot.stages.filter(stage => stage.active).map(stage => stage.name))
  const active = snapshot.applications.filter(item => activeStatuses.has(item.status)).length
  const offers = snapshot.applications.filter(item => item.status === 'Offer').length
  const rejected = snapshot.applications.filter(item => item.status === '拒绝').length
  const upcoming = snapshot.events.filter(event => new Date(event.startsAt).getTime() >= Date.now() && event.status !== '已取消').slice(0, 5)
  const recent = snapshot.applications.slice(0, 5)
  const maxStageCount = Math.max(1, ...snapshot.stages.map(stage => snapshot.applications.filter(item => item.status === stage.name).length))

  return <>
    <section className="stat-grid">
      <StatCard icon={<BriefcaseBusiness />} label="累计投递" value={snapshot.applications.length} note="全部申请记录" tone="blue" />
      <StatCard icon={<Activity />} label="正在推进" value={active} note="保持节奏，继续加油" tone="orange" />
      <StatCard icon={<Trophy />} label="收到 Offer" value={offers} note={offers ? '好消息正在发生' : '机会正在路上'} tone="green" />
      <StatCard icon={<AlertCircle />} label="流程结束" value={rejected} note="复盘之后再出发" tone="red" />
    </section>

    <section className="dashboard-grid">
      <div className="panel upcoming-panel">
        <PanelTitle title="近期安排" subtitle="未来的笔试与面试" action={upcoming.length ? '查看全部' : undefined} onAction={onGoSchedule} />
        {upcoming.length ? <div className="event-list">{upcoming.map(event => {
          const application = snapshot.applications.find(item => item.id === event.applicationId)
          return <button className="event-row" key={event.id} onClick={() => onSelect(event.applicationId)}>
            <div className="date-chip"><strong>{shortDate(event.startsAt).split('-').at(-1)}</strong><span>{new Intl.DateTimeFormat('zh-CN', { month: 'short' }).format(new Date(event.startsAt))}</span></div>
            <div className="event-main"><strong>{event.title}</strong><span>{application?.company} · {application?.role}</span></div>
            <div className="event-meta"><strong>{relativeTime(event.startsAt)}</strong><span><Clock3 />{dateTime(event.startsAt).split(' ')[1] || dateTime(event.startsAt)}</span></div>
            <ChevronRight />
          </button>
        })}</div> : <EmptyState icon={<CalendarClock />} title="近期没有安排" description="添加面试或笔试后，会优先显示临近事项。" action="添加投递" onAction={onAdd} />}
      </div>

      <div className="panel funnel-panel">
        <PanelTitle title="流程分布" subtitle="当前投递所处阶段" />
        <div className="stage-bars">{snapshot.stages.filter(stage => stage.name !== '放弃').map(stage => {
          const count = snapshot.applications.filter(item => item.status === stage.name).length
          return <div className="stage-bar" key={stage.id}>
            <div><span>{stage.name}</span><strong>{count}</strong></div>
            <div className="bar-track"><i style={{ width: `${Math.max(count ? 8 : 0, (count / maxStageCount) * 100)}%`, background: stage.color }} /></div>
          </div>
        })}</div>
      </div>
    </section>

    <section className="panel recent-panel">
      <PanelTitle title="最近更新" subtitle="最近发生变化的投递" />
      {recent.length ? <div className="recent-list">{recent.map(item => {
        const stage = snapshot.stages.find(stage => stage.name === item.status)
        return <button key={item.id} className="recent-row" onClick={() => onSelect(item.id)}>
          <CompanyAvatar name={item.company} />
          <div className="recent-main"><strong>{item.company}</strong><span>{item.role}</span></div>
          <StatusBadge stage={stage} name={item.status} />
          <span className="muted">更新于 {relativeTime(item.updatedAt)}</span>
          <ChevronRight />
        </button>
      })}</div> : <EmptyState icon={<Inbox />} title="还没有投递记录" description="从第一份申请开始，清晰记录你的秋招进度。" action="新建第一条投递" onAction={onAdd} />}
    </section>
  </>
}

function StatCard({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: number; note: string; tone: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>
}

function PanelTitle({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <div className="panel-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="text-button" onClick={onAction}>{action}<ArrowRight /></button>}</div>
}

function Applications({ snapshot, onSelect, onEdit, onAdd, onCreateReview }: { snapshot: Snapshot; onSelect: (id: string) => void; onEdit: (item: Application) => void; onAdd: () => void; onCreateReview: (applicationId: string, eventId?: string | null) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('全部阶段')
  const filtered = snapshot.applications.filter(item => {
    const matchesQuery = `${item.company} ${item.role} ${item.location}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (status === '全部阶段' || item.status === status)
  })

  return <section className="panel table-panel">
    <div className="table-toolbar">
      <div className="search-box"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索公司、职位或地点" /></div>
      <select value={status} onChange={event => setStatus(event.target.value)}><option>全部阶段</option>{snapshot.stages.map(stage => <option key={stage.id}>{stage.name}</option>)}</select>
      <span className="record-count">{filtered.length} 条记录</span>
    </div>
    {filtered.length ? <div className="data-table-wrap"><table className="data-table">
      <thead><tr><th>公司与职位</th><th>当前阶段</th><th>投递时间</th><th>下个日程</th><th>面试复盘</th><th></th></tr></thead>
      <tbody>{filtered.map(item => {
        const appEvents = snapshot.events.filter(event => event.applicationId === item.id)
        const nextEvent = appEvents.find(event => new Date(event.startsAt).getTime() >= Date.now() && event.status !== '已取消')
        const reviews = snapshot.reviews.filter(review => review.applicationId === item.id)
        const stage = snapshot.stages.find(stage => stage.name === item.status)
        return <tr key={item.id} onClick={() => onSelect(item.id)}>
          <td><div className="company-cell"><CompanyAvatar name={item.company} /><div><strong>{item.company}</strong><span>{item.role}{item.location ? ` · ${item.location}` : ''}</span></div></div></td>
          <td><StatusBadge stage={stage} name={item.status} /></td>
          <td><span className="plain-date">{toInputDate(item.appliedAt)}</span></td>
          <td>{nextEvent ? <div className="next-event"><strong>{relativeTime(nextEvent.startsAt)}</strong><span>{nextEvent.eventType} · {dateTime(nextEvent.startsAt)}</span></div> : <span className="muted">暂未安排</span>}</td>
          <td>{reviews.length ? <div className="review-count has"><FileText />{reviews.length} 篇</div> : <button className="inline-review-button" onClick={event => { event.stopPropagation(); onCreateReview(item.id, null) }}><Plus />新建复盘</button>}</td>
          <td><button className="icon-button" title="编辑" onClick={event => { event.stopPropagation(); onEdit(item) }}><MoreHorizontal /></button></td>
        </tr>
      })}</tbody>
    </table></div> : <EmptyState icon={<Search />} title="没有匹配的投递" description="换个关键词或阶段试试。" action="新建投递" onAction={onAdd} />}
  </section>
}

function Kanban({ snapshot, onSelect, onStatus }: { snapshot: Snapshot; onSelect: (id: string) => void; onStatus: (id: string, status: string) => void }) {
  const [dragged, setDragged] = useState<string | null>(null)
  return <div className="kanban-board">{snapshot.stages.map(stage => {
    const items = snapshot.applications.filter(item => item.status === stage.name)
    return <div className="kanban-column" key={stage.id} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragged) onStatus(dragged, stage.name); setDragged(null) }}>
      <div className="kanban-head"><div><i style={{ background: stage.color }} /><strong>{stage.name}</strong><span>{items.length}</span></div></div>
      <div className="kanban-cards">{items.map(item => {
        const next = snapshot.events.find(event => event.applicationId === item.id && new Date(event.startsAt) >= new Date())
        const reviewCount = snapshot.reviews.filter(review => review.applicationId === item.id).length
        return <article className="kanban-card" key={item.id} draggable onDragStart={() => setDragged(item.id)} onClick={() => onSelect(item.id)}>
          <div className="kanban-company"><CompanyAvatar name={item.company} small /><div><strong>{item.company}</strong><span>{item.role}</span></div></div>
          {item.nextStep && <p>{item.nextStep}</p>}
          <div className="kanban-foot"><span><CalendarDays />{next ? shortDate(next.startsAt) : toInputDate(item.appliedAt)}</span><span><FileText />{reviewCount}</span></div>
        </article>
      })}{!items.length && <div className="drop-hint">拖动投递到这里</div>}</div>
    </div>
  })}</div>
}

function Schedule({ snapshot, onSelect, onAdd }: { snapshot: Snapshot; onSelect: (id: string) => void; onAdd: () => void }) {
  const [showPast, setShowPast] = useState(false)
  const now = Date.now()
  const events = snapshot.events.filter(item => showPast || new Date(item.startsAt).getTime() >= now).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  return <section className="panel schedule-panel">
    <div className="schedule-toolbar"><div className="segmented"><button className={!showPast ? 'active' : ''} onClick={() => setShowPast(false)}>即将开始</button><button className={showPast ? 'active' : ''} onClick={() => setShowPast(true)}>全部日程</button></div><button className="button secondary" onClick={onAdd}><Plus />添加日程</button></div>
    {events.length ? <div className="schedule-list">{events.map((event, index) => {
      const app = snapshot.applications.find(item => item.id === event.applicationId)
      const review = snapshot.reviews.find(item => item.eventId === event.id)
      const isPast = new Date(event.startsAt).getTime() < now
      return <button className={`schedule-item ${isPast ? 'past' : ''}`} key={event.id} onClick={() => onSelect(event.applicationId)}>
        <div className="timeline-line">{index < events.length - 1 && <i />}</div>
        <div className="schedule-date"><strong>{dateTime(event.startsAt)}</strong><span>{relativeTime(event.startsAt)}</span></div>
        <div className="schedule-dot" />
        <div className="schedule-card"><div><span className="eyebrow">{event.eventType}</span><h3>{event.title}</h3><p>{app?.company} · {app?.role}</p></div><div className="schedule-info">{event.location && <span><MapPin />{event.location}</span>}<span><Clock3 />{event.duration} 分钟</span>{review && <span className="review-ready"><FileText />已有复盘</span>}</div><ChevronRight /></div>
      </button>
    })}</div> : <EmptyState icon={<CalendarDays />} title="没有待进行的日程" description="为投递添加笔试或面试，时间越近越靠前。" action="添加日程" onAction={onAdd} />}
  </section>
}

function ApplicationDetail({ application, snapshot, onClose, onEdit, onAddEvent, onEditEvent, onCreateReview, onOpenReview, onRefresh, onToast, onDelete }: {
  application: Application; snapshot: Snapshot; onClose: () => void; onEdit: () => void; onAddEvent: () => void; onEditEvent: (event: InterviewEvent) => void
  onCreateReview: (applicationId: string, eventId?: string | null) => void; onOpenReview: (review: Review) => void; onRefresh: (data: Snapshot) => void; onToast: (message: string) => void; onDelete: () => void
}) {
  const events = snapshot.events.filter(event => event.applicationId === application.id).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const reviews = snapshot.reviews.filter(review => review.applicationId === application.id)
  const history = snapshot.history.filter(item => item.applicationId === application.id)
  const stage = snapshot.stages.find(stage => stage.name === application.status)

  async function linkReview(eventId?: string | null) {
    try {
      const result = await window.offerManager.linkReview({ applicationId: application.id, eventId, copyToManaged: true })
      if (result) { onRefresh(result); onToast('Markdown 已导入') }
    } catch (error) { onToast(error instanceof Error ? error.message : '导入失败') }
  }

  return <div className="drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <aside className="detail-drawer">
      <div className="drawer-head"><button className="close-button" onClick={onClose}><X /></button><div className="drawer-actions"><button className="button ghost" onClick={onEdit}><PenLine />编辑</button><button className="icon-button danger" onClick={onDelete}><Trash2 /></button></div></div>
      <div className="detail-hero"><CompanyAvatar name={application.company} /><div><span className="eyebrow">投递详情</span><h2>{application.company}</h2><p>{application.role}{application.location && ` · ${application.location}`}</p></div></div>
      <div className="detail-summary"><div><span>当前阶段</span><StatusBadge stage={stage} name={application.status} /></div><div><span>投递日期</span><strong>{toInputDate(application.appliedAt)}</strong></div><div><span>投递渠道</span><strong>{application.channel || '未填写'}</strong></div></div>
      {(application.nextStep || application.url || application.notes) && <section className="detail-section compact">
        {application.nextStep && <div className="info-line"><span>下一步</span><strong>{application.nextStep}</strong></div>}
        {application.url && <button className="link-line" onClick={() => window.offerManager.openUrl(application.url)}><ExternalLink />打开招聘页面</button>}
        {application.notes && <p className="application-note">{application.notes}</p>}
      </section>}

      <section className="detail-section">
        <div className="section-heading"><div><h3>面试与笔试</h3><span>{events.length} 个日程</span></div><button className="text-button" onClick={onAddEvent}><Plus />添加</button></div>
        {events.length ? <div className="detail-events">{events.map(event => {
          const review = reviews.find(review => review.eventId === event.id)
          return <article key={event.id} className="detail-event">
            <div className="event-type-icon"><CalendarClock /></div>
            <div className="detail-event-main"><div><strong>{event.title}</strong><span>{event.eventType}</span></div><p>{fullDateTime(event.startsAt)} · {event.duration} 分钟</p>{event.location && <p><MapPin />{event.location}</p>}
              <div className="event-actions">{review ? <button onClick={() => onOpenReview(review)}><FileText />编辑复盘</button> : <button onClick={() => onCreateReview(application.id, event.id)}><Plus />新建复盘</button>}<button onClick={() => onEditEvent(event)}>编辑日程</button></div>
            </div>
          </article>
        })}</div> : <div className="mini-empty">尚未添加笔试或面试安排</div>}
      </section>

      <section className="detail-section">
        <div className="section-heading"><div><h3>Markdown 复盘</h3><span>{reviews.length} 篇文档</span></div><div className="heading-actions"><button className="text-button" onClick={() => linkReview(null)}><LinkIcon />导入</button><button className="text-button" onClick={() => onCreateReview(application.id, null)}><Plus />新建总结</button></div></div>
        {reviews.length ? <div className="review-list">{reviews.map(review => <button key={review.id} className="review-item" onClick={() => onOpenReview(review)}>
          <div className={`file-icon ${review.exists ? '' : 'missing'}`}><FileText /></div><div><strong>{review.title}</strong><span>{review.exists ? `${review.storageMode === 'linked' ? '外部关联' : '本地管理'} · 更新于 ${relativeTime(review.updatedAt)}` : '文件已移动或删除'}</span></div><ChevronRight />
        </button>)}</div> : <div className="mini-empty">还没有复盘，完成面试后记得记录。</div>}
      </section>

      <section className="detail-section history-section"><div className="section-heading"><div><h3>进度历史</h3><span>{history.length} 次变化</span></div></div>{history.map(item => <div className="history-item" key={item.id}><i /><span>进入「{item.status}」</span><time>{fullDateTime(item.changedAt)}</time></div>)}</section>
    </aside>
  </div>
}

function ApplicationModal({ value, stages, onClose, onSave }: { value?: Application; stages: Stage[]; onClose: () => void; onSave: (input: ApplicationInput) => void }) {
  const [form, setForm] = useState<ApplicationInput>({
    id: value?.id, company: value?.company || '', role: value?.role || '', location: value?.location || '', channel: value?.channel || '',
    url: value?.url || '', appliedAt: value?.appliedAt ? toInputDate(value.appliedAt) : toInputDate(), status: value?.status || stages[1]?.name || '已投递',
    nextStep: value?.nextStep || '', notes: value?.notes || '',
  })
  const update = (key: keyof ApplicationInput, next: string) => setForm(current => ({ ...current, [key]: next }))
  return <Modal title={value ? '编辑投递' : '新建投递'} subtitle="记录这次申请的关键信息" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave({ ...form, appliedAt: new Date(`${form.appliedAt}T12:00:00`).toISOString() }) }}>
      <div className="form-grid"><Field label="公司名称" required><input autoFocus required value={form.company} onChange={e => update('company', e.target.value)} placeholder="例如：字节跳动" /></Field><Field label="职位名称" required><input required value={form.role} onChange={e => update('role', e.target.value)} placeholder="例如：前端开发工程师" /></Field></div>
      <div className="form-grid"><Field label="当前阶段"><select value={form.status} onChange={e => update('status', e.target.value)}>{stages.map(stage => <option key={stage.id}>{stage.name}</option>)}</select></Field><Field label="投递日期"><input type="date" value={form.appliedAt} onChange={e => update('appliedAt', e.target.value)} /></Field></div>
      <div className="form-grid"><Field label="工作地点"><input value={form.location} onChange={e => update('location', e.target.value)} placeholder="北京 / 上海 / 远程" /></Field><Field label="投递渠道"><input value={form.channel} onChange={e => update('channel', e.target.value)} placeholder="官网 / Boss / 内推" /></Field></div>
      <Field label="招聘链接"><input type="url" value={form.url} onChange={e => update('url', e.target.value)} placeholder="https://" /></Field>
      <Field label="下一步事项"><input value={form.nextStep} onChange={e => update('nextStep', e.target.value)} placeholder="例如：周五前完成在线测评" /></Field>
      <Field label="备注"><textarea rows={3} value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="薪资范围、联系人或其他信息…" /></Field>
      <ModalFooter onClose={onClose} label={value ? '保存修改' : '创建投递'} />
    </form>
  </Modal>
}

function EventModal({ applicationId, application, value, onClose, onSave }: { applicationId: string; application?: Application; value?: InterviewEvent; onClose: () => void; onSave: (input: EventInput) => void }) {
  const [form, setForm] = useState<EventInput>({
    id: value?.id, applicationId, title: value?.title || `${application?.company || ''} 面试`, eventType: value?.eventType || '一面',
    startsAt: value?.startsAt ? toInputDateTime(value.startsAt) : toInputDateTime(), duration: value?.duration || 60,
    location: value?.location || '', meetingUrl: value?.meetingUrl || '', contact: value?.contact || '', status: value?.status || '待进行', reminderMinutes: value?.reminderMinutes || 30,
  })
  const update = (key: keyof EventInput, next: string | number) => setForm(current => ({ ...current, [key]: next }))
  return <Modal title={value ? '编辑日程' : '添加面试日程'} subtitle={`${application?.company || ''} · ${application?.role || ''}`} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave({ ...form, startsAt: new Date(form.startsAt).toISOString() }) }}>
      <Field label="日程名称" required><input required autoFocus value={form.title} onChange={e => update('title', e.target.value)} /></Field>
      <div className="form-grid"><Field label="流程类型"><select value={form.eventType} onChange={e => update('eventType', e.target.value)}>{['在线测评', '笔试', 'AI面', '一面', '二面', '三面', 'HR面', '终面', '其他沟通'].map(item => <option key={item}>{item}</option>)}</select></Field><Field label="状态"><select value={form.status} onChange={e => update('status', e.target.value)}><option>待进行</option><option>已完成</option><option>已取消</option></select></Field></div>
      <div className="form-grid"><Field label="开始时间"><input required type="datetime-local" value={form.startsAt} onChange={e => update('startsAt', e.target.value)} /></Field><Field label="预计时长（分钟）"><input min="10" type="number" value={form.duration} onChange={e => update('duration', Number(e.target.value))} /></Field></div>
      <Field label="地点或方式"><input value={form.location} onChange={e => update('location', e.target.value)} placeholder="线上 / 公司地址 / 腾讯会议" /></Field>
      <Field label="会议链接"><input type="url" value={form.meetingUrl} onChange={e => update('meetingUrl', e.target.value)} placeholder="https://" /></Field>
      <div className="form-grid"><Field label="联系人"><input value={form.contact} onChange={e => update('contact', e.target.value)} /></Field><Field label="提前提醒"><select value={form.reminderMinutes} onChange={e => update('reminderMinutes', Number(e.target.value))}><option value={15}>15 分钟</option><option value={30}>30 分钟</option><option value={60}>1 小时</option><option value={1440}>1 天</option></select></Field></div>
      <ModalFooter onClose={onClose} label="保存日程" />
    </form>
  </Modal>
}

function ReviewEditor({ document, onClose, onSave, onExternal }: { document: ReviewDocument; onClose: () => void; onSave: (content: string) => void; onExternal: () => void }) {
  const [content, setContent] = useState(document.content)
  const [mode, setMode] = useState<'split' | 'edit' | 'preview'>('split')
  return <div className="editor-overlay">
    <header className="editor-header"><div><button className="close-button" onClick={onClose}><X /></button><div><strong>{document.review.title}</strong><span>{document.review.filePath}</span></div></div><div className="editor-actions"><div className="segmented"><button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>编辑</button><button className={mode === 'split' ? 'active' : ''} onClick={() => setMode('split')}>分栏</button><button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>预览</button></div><button className="button ghost" onClick={onExternal}><ExternalLink />外部打开</button><button className="button primary" onClick={() => onSave(content)}><Save />保存</button></div></header>
    <div className={`markdown-workspace mode-${mode}`}>{mode !== 'preview' && <textarea spellCheck={false} value={content} onChange={event => setContent(event.target.value)} />}{mode !== 'edit' && <article className="markdown-preview"><ReactMarkdown>{content}</ReactMarkdown></article>}</div>
  </div>
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="close-button" onClick={onClose}><X /></button></div>{children}</div></div>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="field"><span>{label}{required && <em>*</em>}</span>{children}</label>
}

function ModalFooter({ onClose, label }: { onClose: () => void; label: string }) {
  return <div className="modal-footer"><button type="button" className="button ghost" onClick={onClose}>取消</button><button type="submit" className="button primary">{label}</button></div>
}

function CompanyAvatar({ name, small }: { name: string; small?: boolean }) {
  const colors = ['#e9ddd1', '#dce4d7', '#d9e1ea', '#e7dbea', '#eee2bd']
  const color = colors[(name.codePointAt(0) || 0) % colors.length]
  return <div className={`company-avatar ${small ? 'small' : ''}`} style={{ background: color }}>{name.slice(0, 1).toUpperCase() || <Building2 />}</div>
}

function StatusBadge({ stage, name }: { stage?: Stage; name: string }) {
  return <span className="status-badge" style={{ color: stage?.color, backgroundColor: `${stage?.color || '#777'}16` }}><i style={{ background: stage?.color }} />{name}</span>
}

function EmptyState({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div>{icon}</div><h3>{title}</h3><p>{description}</p>{action && <button className="button secondary" onClick={onAction}>{action}</button>}</div>
}

export default App
