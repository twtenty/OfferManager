const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron')
const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { initializeOpportunityStorage, registerOpportunityIpc } = require('./opportunities.cjs')

let mainWindow
let db
let dataRoot

const DEFAULT_STAGES = [
  ['准备投递', '#8a8a80', 0, 1],
  ['已投递', '#5975a4', 1, 1],
  ['测评', '#6f83b5', 2, 1],
  ['简历筛选', '#8b6fb0', 3, 1],
  ['笔试', '#c0823f', 4, 1],
  ['AI面', '#c96f48', 5, 1],
  ['一面', '#cf6b4f', 6, 1],
  ['二面', '#d44f5f', 7, 1],
  ['三面', '#c0446a', 8, 1],
  ['HR面', '#b33f80', 9, 1],
  ['Offer', '#3c8c6b', 10, 0],
  ['拒绝', '#8f5555', 11, 0],
  ['放弃', '#797971', 12, 0],
]

function ensureDatabase() {
  dataRoot = path.join(app.getPath('userData'), 'OfferManagerData')
  fs.mkdirSync(dataRoot, { recursive: true })
  fs.mkdirSync(path.join(dataRoot, 'reviews'), { recursive: true })
  fs.mkdirSync(path.join(dataRoot, 'backups'), { recursive: true })

  const dbPath = path.join(dataRoot, 'offer-manager.db')
  db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      applied_at TEXT NOT NULL,
      status TEXT NOT NULL,
      next_step TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS status_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 60,
      location TEXT NOT NULL DEFAULT '',
      meeting_url TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '待进行',
      reminder_minutes INTEGER NOT NULL DEFAULT 30,
      time_mode TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      storage_mode TEXT NOT NULL DEFAULT 'managed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
    CREATE INDEX IF NOT EXISTS idx_reviews_application ON reviews(application_id);
  `)
  const eventColumns = db.prepare('PRAGMA table_info(events)').all()
  if (!eventColumns.some(column => column.name === 'time_mode')) {
    db.exec("ALTER TABLE events ADD COLUMN time_mode TEXT NOT NULL DEFAULT 'scheduled'")
  }
  initializeOpportunityStorage(db, dataRoot)

  const upsertStage = db.prepare(`INSERT INTO stages (name, color, sort_order, active) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET sort_order=excluded.sort_order, active=excluded.active`)
  for (const stage of DEFAULT_STAGES) upsertStage.run(...stage)
  createAutomaticBackup(dbPath)
}

function createAutomaticBackup(dbPath) {
  const stamp = new Date().toISOString().slice(0, 10)
  const backupPath = path.join(dataRoot, 'backups', `offer-manager-${stamp}.db`)
  if (!fs.existsSync(backupPath) && fs.existsSync(dbPath)) {
    try { fs.copyFileSync(dbPath, backupPath) } catch { /* 下次启动重试 */ }
  }
}

function mapApplication(row) {
  return {
    id: row.id, company: row.company, role: row.role, location: row.location,
    channel: row.channel, url: row.url, appliedAt: row.applied_at,
    status: row.status, nextStep: row.next_step, notes: row.notes,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function mapEvent(row) {
  return {
    id: row.id, applicationId: row.application_id, title: row.title,
    eventType: row.event_type, startsAt: row.starts_at, duration: row.duration,
    location: row.location, meetingUrl: row.meeting_url, contact: row.contact,
    status: row.status, reminderMinutes: row.reminder_minutes,
    timeMode: row.time_mode || 'scheduled', createdAt: row.created_at,
  }
}

function mapReview(row) {
  return {
    id: row.id, applicationId: row.application_id, eventId: row.event_id,
    title: row.title, filePath: row.file_path, storageMode: row.storage_mode,
    createdAt: row.created_at, updatedAt: row.updated_at,
    exists: fs.existsSync(row.file_path),
  }
}

function getSnapshot() {
  const applications = db.prepare('SELECT * FROM applications ORDER BY updated_at DESC').all().map(mapApplication)
  const events = db.prepare('SELECT * FROM events ORDER BY starts_at ASC').all().map(mapEvent)
  const reviews = db.prepare('SELECT * FROM reviews ORDER BY updated_at DESC').all().map(mapReview)
  const stages = db.prepare('SELECT * FROM stages ORDER BY sort_order ASC').all().map(row => ({
    id: row.id, name: row.name, color: row.color, sortOrder: row.sort_order, active: Boolean(row.active),
  }))
  const history = db.prepare('SELECT * FROM status_history ORDER BY changed_at DESC').all().map(row => ({
    id: row.id, applicationId: row.application_id, status: row.status, changedAt: row.changed_at,
  }))
  return { applications, events, reviews, stages, history, dataRoot }
}

function registerIpc() {
  ipcMain.handle('data:snapshot', () => getSnapshot())

  ipcMain.handle('application:save', (_event, input) => {
    const now = new Date().toISOString()
    const existing = input.id ? db.prepare('SELECT * FROM applications WHERE id = ?').get(input.id) : null
    const id = input.id || crypto.randomUUID()
    if (existing) {
      db.prepare(`UPDATE applications SET company=?, role=?, location=?, channel=?, url=?, applied_at=?,
        status=?, next_step=?, notes=?, updated_at=? WHERE id=?`).run(
        input.company, input.role, input.location || '', input.channel || '', input.url || '', input.appliedAt,
        input.status, input.nextStep || '', input.notes || '', now, id,
      )
      if (existing.status !== input.status) {
        db.prepare('INSERT INTO status_history VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), id, input.status, now)
      }
    } else {
      db.prepare(`INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, input.company, input.role, input.location || '', input.channel || '', input.url || '',
        input.appliedAt, input.status, input.nextStep || '', input.notes || '', now, now,
      )
      db.prepare('INSERT INTO status_history VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), id, input.status, now)
    }
    return getSnapshot()
  })

  ipcMain.handle('application:status', (_event, { id, status }) => {
    const now = new Date().toISOString()
    db.prepare('UPDATE applications SET status=?, updated_at=? WHERE id=?').run(status, now, id)
    db.prepare('INSERT INTO status_history VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), id, status, now)
    return getSnapshot()
  })

  ipcMain.handle('application:delete', (_event, id) => {
    db.prepare('DELETE FROM applications WHERE id=?').run(id)
    return getSnapshot()
  })

  ipcMain.handle('event:save', (_event, input) => {
    const id = input.id || crypto.randomUUID()
    const now = new Date().toISOString()
    if (input.id && db.prepare('SELECT id FROM events WHERE id=?').get(input.id)) {
      db.prepare(`UPDATE events SET application_id=?, title=?, event_type=?, starts_at=?, duration=?,
        location=?, meeting_url=?, contact=?, status=?, reminder_minutes=?, time_mode=? WHERE id=?`).run(
        input.applicationId, input.title, input.eventType, input.startsAt, Number(input.duration) || 60,
        input.location || '', input.meetingUrl || '', input.contact || '', input.status || '待进行',
        Number(input.reminderMinutes) || 30, input.timeMode || 'scheduled', id,
      )
    } else {
      db.prepare(`INSERT INTO events
        (id, application_id, title, event_type, starts_at, duration, location, meeting_url,
          contact, status, reminder_minutes, time_mode, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, input.applicationId, input.title, input.eventType, input.startsAt, Number(input.duration) || 60,
        input.location || '', input.meetingUrl || '', input.contact || '', input.status || '待进行',
        Number(input.reminderMinutes) || 30, input.timeMode || 'scheduled', now,
      )
    }
    return getSnapshot()
  })

  ipcMain.handle('event:delete', (_event, id) => {
    db.prepare('DELETE FROM events WHERE id=?').run(id)
    return getSnapshot()
  })

  ipcMain.handle('review:create', (_event, input) => {
    const application = db.prepare('SELECT * FROM applications WHERE id=?').get(input.applicationId)
    if (!application) throw new Error('找不到对应的投递记录')
    const linkedEvent = input.eventId ? db.prepare('SELECT * FROM events WHERE id=?').get(input.eventId) : null
    const id = crypto.randomUUID()
    const directory = path.join(dataRoot, 'reviews', input.applicationId)
    fs.mkdirSync(directory, { recursive: true })
    const filePath = path.join(directory, `${id}.md`)
    const title = input.title || (linkedEvent ? `${linkedEvent.event_type}复盘` : '整体总结')
    const eventTime = linkedEvent ? new Date(linkedEvent.starts_at).toLocaleString('zh-CN') : '待填写'
    const content = `# ${application.company} - ${application.role} - ${title}\n\n- 面试时间：${eventTime}\n- 面试轮次：${linkedEvent?.event_type || '整体总结'}\n- 面试方式：${linkedEvent?.location || '待填写'}\n- 面试官：\n- 面试结果：等待反馈\n\n## 面试问题\n\n### 问题 1\n\n问题描述：\n\n我的回答：\n\n改进方向：\n\n## 整体表现\n\n\n## 不熟悉的知识点\n\n\n## 后续行动\n\n`
    fs.writeFileSync(filePath, content, 'utf8')
    const now = new Date().toISOString()
    db.prepare('INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, input.applicationId, input.eventId || null, title, filePath, 'managed', now, now,
    )
    return { snapshot: getSnapshot(), review: mapReview(db.prepare('SELECT * FROM reviews WHERE id=?').get(id)) }
  })

  ipcMain.handle('review:link', async (_event, input) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择已有 Markdown 复盘', properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const source = result.filePaths[0]
    const id = crypto.randomUUID()
    let filePath = source
    let storageMode = 'linked'
    if (input.copyToManaged) {
      const directory = path.join(dataRoot, 'reviews', input.applicationId)
      fs.mkdirSync(directory, { recursive: true })
      filePath = path.join(directory, `${id}.md`)
      fs.copyFileSync(source, filePath)
      storageMode = 'managed'
    }
    const now = new Date().toISOString()
    const title = input.title || path.basename(source, path.extname(source))
    db.prepare('INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, input.applicationId, input.eventId || null, title, filePath, storageMode, now, now,
    )
    return getSnapshot()
  })

  ipcMain.handle('review:read', (_event, id) => {
    const review = db.prepare('SELECT * FROM reviews WHERE id=?').get(id)
    if (!review || !fs.existsSync(review.file_path)) throw new Error('Markdown 文件不存在，请重新关联')
    return { review: mapReview(review), content: fs.readFileSync(review.file_path, 'utf8') }
  })

  ipcMain.handle('review:save', (_event, { id, content }) => {
    const review = db.prepare('SELECT * FROM reviews WHERE id=?').get(id)
    if (!review) throw new Error('找不到复盘记录')
    fs.writeFileSync(review.file_path, content, 'utf8')
    db.prepare('UPDATE reviews SET updated_at=? WHERE id=?').run(new Date().toISOString(), id)
    return getSnapshot()
  })

  ipcMain.handle('review:openExternal', async (_event, id) => {
    const review = db.prepare('SELECT * FROM reviews WHERE id=?').get(id)
    if (!review || !fs.existsSync(review.file_path)) throw new Error('Markdown 文件不存在')
    const error = await shell.openPath(review.file_path)
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle('review:delete', (_event, id) => {
    const review = db.prepare('SELECT * FROM reviews WHERE id=?').get(id)
    if (review?.storage_mode === 'managed' && fs.existsSync(review.file_path)) {
      const trash = path.join(dataRoot, 'reviews', '_trash')
      fs.mkdirSync(trash, { recursive: true })
      fs.renameSync(review.file_path, path.join(trash, `${Date.now()}-${path.basename(review.file_path)}`))
    }
    db.prepare('DELETE FROM reviews WHERE id=?').run(id)
    return getSnapshot()
  })

  ipcMain.handle('system:openUrl', async (_event, url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http 或 https 链接')
    await shell.openExternal(url)
  })
  ipcMain.handle('system:showData', () => shell.openPath(dataRoot))

  ipcMain.handle('data:exportCsv', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出投递记录', defaultPath: `投递记录-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (result.canceled || !result.filePath) return false
    const rows = db.prepare('SELECT * FROM applications ORDER BY applied_at DESC').all()
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
    const header = ['公司', '职位', '地点', '渠道', '投递时间', '当前阶段', '下一步', '招聘链接', '备注']
    const csv = [header.map(escape).join(','), ...rows.map(row => [
      row.company, row.role, row.location, row.channel, row.applied_at, row.status,
      row.next_step, row.url, row.notes,
    ].map(escape).join(','))].join('\r\n')
    fs.writeFileSync(result.filePath, `\uFEFF${csv}`, 'utf8')
    return true
  })

  registerOpportunityIpc({ ipcMain, db, dataRoot, getWindow: () => mainWindow })
}

function createWindow() {
  nativeTheme.themeSource = 'light'
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f7f7f2',
    title: 'Offer Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  ensureDatabase()
  registerIpc()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try { db?.close() } catch { /* ignore */ }
})
