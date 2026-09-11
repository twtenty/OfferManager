const { dialog, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function initializeOpportunityStorage(db, dataRoot) {
  fs.mkdirSync(path.join(dataRoot, 'opportunity-images'), { recursive: true })
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_opportunities (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      applied INTEGER NOT NULL DEFAULT 0,
      deadline TEXT NOT NULL DEFAULT '',
      application_url TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_opportunities_priority
      ON job_opportunities(applied, deadline);
  `)
}

function mapOpportunity(row) {
  return {
    id: row.id,
    company: row.company,
    applied: Boolean(row.applied),
    deadline: row.deadline,
    applicationUrl: row.application_url,
    imagePath: row.image_path,
    hasImage: Boolean(row.image_path && fs.existsSync(row.image_path)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listOpportunities(db) {
  return db.prepare(`
    SELECT * FROM job_opportunities
    ORDER BY
      CASE
        WHEN applied = 0 AND deadline >= date('now', 'localtime') THEN 0
        WHEN applied = 0 THEN 1
        ELSE 2
      END ASC,
      CASE WHEN applied = 0 AND deadline >= date('now', 'localtime') THEN deadline END ASC,
      CASE WHEN applied = 0 AND deadline < date('now', 'localtime') THEN deadline END DESC,
      created_at DESC
  `).all().map(mapOpportunity)
}

function ensureValidImage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('选择的图片不存在')
  const extension = path.extname(filePath).toLowerCase()
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error('仅支持 PNG、JPG、WEBP、GIF 或 BMP 图片')
  if (fs.statSync(filePath).size > MAX_IMAGE_BYTES) throw new Error('图片不能超过 10 MB')
  return extension
}

function moveManagedImageToTrash(filePath, dataRoot) {
  if (!filePath || !fs.existsSync(filePath)) return
  const imageRoot = path.resolve(path.join(dataRoot, 'opportunity-images'))
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(`${imageRoot}${path.sep}`)) return
  const trash = path.join(imageRoot, '_trash')
  fs.mkdirSync(trash, { recursive: true })
  fs.renameSync(resolved, path.join(trash, `${Date.now()}-${path.basename(resolved)}`))
}

function registerOpportunityIpc({ ipcMain, db, dataRoot, getWindow }) {
  ipcMain.handle('opportunity:list', () => listOpportunities(db))

  ipcMain.handle('opportunity:chooseImage', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择岗位投递图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    ensureValidImage(filePath)
    return { filePath, fileName: path.basename(filePath) }
  })

  ipcMain.handle('opportunity:save', (_event, input) => {
    const company = String(input.company || '').trim()
    const applicationUrl = String(input.applicationUrl || '').trim()
    const deadline = String(input.deadline || '').trim()
    if (!company) throw new Error('请填写公司名称')
    if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error('请选择有效的截止日期')
    if (applicationUrl && !/^https?:\/\//i.test(applicationUrl)) throw new Error('投递链接需要以 http:// 或 https:// 开头')
    if (!applicationUrl && !input.imagePath) throw new Error('请填写投递链接或选择投递图片')

    const id = crypto.randomUUID()
    let managedImagePath = ''
    if (input.imagePath) {
      const extension = ensureValidImage(input.imagePath)
      managedImagePath = path.join(dataRoot, 'opportunity-images', `${id}${extension}`)
      fs.copyFileSync(input.imagePath, managedImagePath)
    }

    const now = new Date().toISOString()
    db.prepare('INSERT INTO job_opportunities VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, company, input.applied ? 1 : 0, deadline, applicationUrl, managedImagePath, now, now,
    )
    return listOpportunities(db)
  })

  ipcMain.handle('opportunity:toggleApplied', (_event, { id, applied }) => {
    db.prepare('UPDATE job_opportunities SET applied=?, updated_at=? WHERE id=?').run(
      applied ? 1 : 0, new Date().toISOString(), id,
    )
    return listOpportunities(db)
  })

  ipcMain.handle('opportunity:delete', (_event, id) => {
    const opportunity = db.prepare('SELECT * FROM job_opportunities WHERE id=?').get(id)
    if (opportunity) moveManagedImageToTrash(opportunity.image_path, dataRoot)
    db.prepare('DELETE FROM job_opportunities WHERE id=?').run(id)
    return listOpportunities(db)
  })

  ipcMain.handle('opportunity:openImage', async (_event, id) => {
    const opportunity = db.prepare('SELECT image_path FROM job_opportunities WHERE id=?').get(id)
    if (!opportunity?.image_path || !fs.existsSync(opportunity.image_path)) throw new Error('投递图片不存在')
    const error = await shell.openPath(opportunity.image_path)
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle('opportunity:readImage', (_event, id) => {
    const opportunity = db.prepare('SELECT image_path FROM job_opportunities WHERE id=?').get(id)
    if (!opportunity?.image_path || !fs.existsSync(opportunity.image_path)) throw new Error('投递图片不存在')
    const extension = path.extname(opportunity.image_path).toLowerCase()
    const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' }
    return `data:${mimeTypes[extension] || 'application/octet-stream'};base64,${fs.readFileSync(opportunity.image_path).toString('base64')}`
  })
}

module.exports = { initializeOpportunityStorage, registerOpportunityIpc }
