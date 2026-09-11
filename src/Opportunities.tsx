import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarDays, Check, Circle, ExternalLink, Image, Link as LinkIcon,
  Plus, Trash2, Upload, X,
} from 'lucide-react'
import type { JobOpportunity, JobOpportunityInput } from './types'

type Props = {
  addSignal: number
  onToast: (message: string) => void
}

const emptyForm: JobOpportunityInput = {
  company: '', applied: false, deadline: '', applicationUrl: '', imagePath: '',
}

function deadlineInfo(deadline: string) {
  if (!deadline) return { text: '暂无截止日期', detail: '', tone: 'normal' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${deadline}T00:00:00`)
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  const display = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(target)
  if (days < 0) return { text: display, detail: `已截止 ${Math.abs(days)} 天`, tone: 'expired' }
  if (days === 0) return { text: display, detail: '今天截止', tone: 'urgent' }
  if (days === 1) return { text: display, detail: '明天截止', tone: 'urgent' }
  if (days <= 7) return { text: display, detail: `${days} 天后截止`, tone: 'soon' }
  return { text: display, detail: `${days} 天后`, tone: 'normal' }
}

export default function Opportunities({ addSignal, onToast }: Props) {
  const [items, setItems] = useState<JobOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<JobOpportunityInput>(emptyForm)
  const [imageName, setImageName] = useState('')
  const [validation, setValidation] = useState('')
  const [preview, setPreview] = useState<{ company: string; source: string; id: string } | null>(null)

  useEffect(() => {
    window.offerManager.listOpportunities().then(setItems).catch(error => onToast(error.message)).finally(() => setLoading(false))
  }, [onToast])

  useEffect(() => {
    if (addSignal > 0) openForm()
  }, [addSignal])

  const stats = useMemo(() => {
    const pending = items.filter(item => !item.applied)
    const urgent = pending.filter(item => ['urgent', 'soon'].includes(deadlineInfo(item.deadline).tone)).length
    const expired = pending.filter(item => deadlineInfo(item.deadline).tone === 'expired').length
    return { pending: pending.length, urgent, expired }
  }, [items])

  function openForm() {
    setForm(emptyForm)
    setImageName('')
    setValidation('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
  }

  async function chooseImage() {
    try {
      const selected = await window.offerManager.chooseOpportunityImage()
      if (!selected) return
      setForm(current => ({ ...current, imagePath: selected.filePath }))
      setImageName(selected.fileName)
      setValidation('')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '无法选择图片')
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form.applicationUrl.trim() && !form.imagePath) {
      setValidation('请填写投递链接或选择一张投递图片')
      return
    }
    try {
      setItems(await window.offerManager.saveOpportunity(form))
      closeForm()
      onToast('岗位机会已添加')
    } catch (error) {
      setValidation(error instanceof Error ? error.message : '保存失败')
    }
  }

  async function toggle(item: JobOpportunity) {
    try {
      setItems(await window.offerManager.toggleOpportunityApplied({ id: item.id, applied: !item.applied }))
      onToast(item.applied ? '已改为未投递' : '已标记为投递')
    } catch (error) { onToast(error instanceof Error ? error.message : '更新失败') }
  }

  async function remove(item: JobOpportunity) {
    if (!confirm(`确认删除「${item.company}」的岗位机会？`)) return
    try {
      setItems(await window.offerManager.deleteOpportunity(item.id))
      onToast('岗位机会已删除')
    } catch (error) { onToast(error instanceof Error ? error.message : '删除失败') }
  }

  async function showImage(item: JobOpportunity) {
    try {
      const source = await window.offerManager.readOpportunityImage(item.id)
      setPreview({ company: item.company, source, id: item.id })
    } catch (error) { onToast(error instanceof Error ? error.message : '无法打开图片') }
  }

  return <>
    <section className="opportunity-stats">
      <div><span>等待投递</span><strong>{stats.pending}</strong><small>按截止日期优先排列</small></div>
      <div><span>7 天内截止</span><strong className={stats.urgent ? 'orange' : ''}>{stats.urgent}</strong><small>建议优先处理</small></div>
      <div><span>已过截止日期</span><strong className={stats.expired ? 'red' : ''}>{stats.expired}</strong><small>仍未标记投递</small></div>
      <div><span>全部岗位机会</span><strong>{items.length}</strong><small>独立于投递记录</small></div>
    </section>

    <section className="panel opportunity-panel">
      <div className="opportunity-toolbar">
        <div><h2>可投递公司</h2><p>未投递的岗位优先，同一状态下截止越近越靠前</p></div>
        <button className="button primary" onClick={openForm}><Plus />添加岗位</button>
      </div>

      {loading ? <div className="opportunity-loading">正在读取岗位机会…</div> : items.length ? (
        <div className="data-table-wrap"><table className="data-table opportunity-table">
          <thead><tr><th>公司名称</th><th>是否投递</th><th>截止日期</th><th>投递资料</th><th>操作</th></tr></thead>
          <tbody>{items.map(item => {
            const deadline = deadlineInfo(item.deadline)
            return <tr key={item.id} className={!item.applied && ['urgent', 'soon', 'expired'].includes(deadline.tone) ? 'priority-row' : ''}>
              <td><div className="opportunity-company"><span>{item.company.slice(0, 1).toUpperCase()}</span><strong>{item.company}</strong>{!item.applied && deadline.tone === 'urgent' && <em>优先</em>}</div></td>
              <td><button className={`applied-toggle ${item.applied ? 'checked' : ''}`} onClick={() => toggle(item)} role="switch" aria-checked={item.applied}>
                <i>{item.applied ? <Check /> : <Circle />}</i><span>{item.applied ? '已投递' : '未投递'}</span>
              </button></td>
              <td><div className={`deadline-cell ${!item.applied ? deadline.tone : 'normal'}`}><strong>{deadline.text}</strong><span>{item.applied ? '已完成投递' : deadline.detail}</span></div></td>
              <td><div className="opportunity-resources">
                {item.applicationUrl && <button onClick={() => window.offerManager.openUrl(item.applicationUrl)}><LinkIcon />投递链接<ExternalLink /></button>}
                {item.hasImage && <button onClick={() => showImage(item)}><Image />查看图片</button>}
                {!item.applicationUrl && !item.hasImage && <span>资料不可用</span>}
              </div></td>
              <td><button className="opportunity-delete" title="删除" onClick={() => remove(item)}><Trash2 /></button></td>
            </tr>
          })}</tbody>
        </table></div>
      ) : <div className="opportunity-empty"><div><Plus /></div><h3>还没有待投岗位</h3><p>收集看到的公司和岗位，避免错过网申截止时间。</p><button className="button secondary" onClick={openForm}>添加第一个岗位</button></div>}
    </section>

    {showForm && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && closeForm()}>
      <div className="modal opportunity-modal">
        <div className="modal-head"><div><h2>添加岗位机会</h2><p>这条记录不会进入现有投递流程</p></div><button className="close-button" onClick={closeForm}><X /></button></div>
        <form onSubmit={save}>
          <label className="field"><span>公司名称<em>*</em></span><input autoFocus required value={form.company} onChange={event => setForm(current => ({ ...current, company: event.target.value }))} placeholder="例如：字节跳动" /></label>
          <div className="form-grid">
            <label className="field"><span>截止日期<em>*</em></span><input type="date" required value={form.deadline} onChange={event => setForm(current => ({ ...current, deadline: event.target.value }))} /></label>
            <label className="field"><span>投递状态</span><button type="button" className={`form-applied-toggle ${form.applied ? 'checked' : ''}`} onClick={() => setForm(current => ({ ...current, applied: !current.applied }))}><i>{form.applied ? <Check /> : <Circle />}</i>{form.applied ? '已经投递' : '暂未投递'}</button></label>
          </div>
          <label className="field"><span>投递链接</span><input type="url" value={form.applicationUrl} onChange={event => { setForm(current => ({ ...current, applicationUrl: event.target.value })); setValidation('') }} placeholder="https://…" /></label>
          <div className="resource-divider"><span>或者</span></div>
          <div className={`image-picker ${form.imagePath ? 'selected' : ''}`}>
            <div>{form.imagePath ? <Image /> : <Upload />}</div>
            <section><strong>{imageName || '选择投递图片'}</strong><span>{form.imagePath ? '图片将在保存后复制到软件数据目录' : '支持 PNG、JPG、WEBP、GIF、BMP，最大 10 MB'}</span></section>
            <button type="button" className="button ghost" onClick={chooseImage}>{form.imagePath ? '重新选择' : '选择图片'}</button>
          </div>
          {validation && <div className="form-validation"><AlertTriangle />{validation}</div>}
          <div className="modal-footer"><button type="button" className="button ghost" onClick={closeForm}>取消</button><button type="submit" className="button primary">添加岗位</button></div>
        </form>
      </div>
    </div>}

    {preview && <div className="image-preview-backdrop" onMouseDown={event => event.target === event.currentTarget && setPreview(null)}>
      <div className="image-preview-dialog"><header><div><strong>{preview.company}</strong><span>岗位投递图片</span></div><div><button className="button ghost" onClick={() => window.offerManager.openOpportunityImage(preview.id)}><ExternalLink />系统打开</button><button className="close-button" onClick={() => setPreview(null)}><X /></button></div></header><div className="image-preview-canvas"><img src={preview.source} alt={`${preview.company} 投递信息`} /></div></div>
    </div>}
  </>
}
