const targets = await fetch('http://127.0.0.1:9222/json').then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.title === 'Offer Manager')
if (!target) throw new Error('找不到正在运行的 Offer Manager 调试窗口')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(message.error.message))
  else resolve(message.result)
})

function command(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
  return response.result.value
}

await command('Runtime.enable')
const title = await evaluate('document.title')
const initial = await evaluate('window.offerManager.getSnapshot()')
if (title !== 'Offer Manager' || !Array.isArray(initial.applications) || !Array.isArray(initial.events)) {
  throw new Error('应用未正确加载')
}

const stamp = new Date().toISOString()
const created = await evaluate(`window.offerManager.saveApplication(${JSON.stringify({
  company: '__SMOKE_TEST__', role: '测试职位', location: '', channel: '自动测试', url: '',
  appliedAt: new Date().toISOString(), status: '已投递', nextStep: '', notes: '',
})})`)
const application = created.applications.find(item => item.company === '__SMOKE_TEST__')
if (!application) throw new Error('无法创建投递记录')

const eventInput = {
  applicationId: application.id, title: `自动测试日程 ${stamp}`, eventType: '一面',
  startsAt: new Date(Date.now() + 86_400_000).toISOString(), duration: 45, location: '线上',
  meetingUrl: '', contact: '', status: '待进行', reminderMinutes: 30,
}
const withEvent = await evaluate(`window.offerManager.saveEvent(${JSON.stringify(eventInput)})`)
const interview = withEvent.events.find(item => item.applicationId === application.id)
if (!interview) throw new Error('无法创建面试日程')

const createdReview = await evaluate(`window.offerManager.createReview(${JSON.stringify({ applicationId: application.id, eventId: interview.id })})`)
const review = await evaluate(`window.offerManager.readReview('${createdReview.review.id}')`)
if (!review.content.includes('面试问题')) throw new Error('Markdown 模板内容异常')

await evaluate(`window.offerManager.deleteReview('${createdReview.review.id}')`)
await evaluate(`window.offerManager.deleteEvent('${interview.id}')`)
await evaluate(`window.offerManager.deleteApplication('${application.id}')`)

console.log('Smoke test passed: UI bridge, SQLite CRUD, schedule and Markdown review are working.')
socket.close()
