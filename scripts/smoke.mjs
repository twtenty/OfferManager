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
const expectedStages = ['准备投递', '已投递', '测评', '简历筛选', '笔试', 'AI面', '一面', '二面', '三面', 'HR面', 'Offer', '拒绝', '放弃']
if (expectedStages.some((stage, index) => initial.stages[index]?.name !== stage)) throw new Error('招聘流程阶段或顺序不正确')

const opportunityCompany = '__OPPORTUNITY_SMOKE_TEST__'
const staleOpportunities = await evaluate(`window.offerManager.listOpportunities()`)
for (const stale of staleOpportunities.filter(item => item.company === opportunityCompany)) {
  await evaluate(`window.offerManager.deleteOpportunity('${stale.id}')`)
}
const opportunities = await evaluate(`window.offerManager.saveOpportunity(${JSON.stringify({
  company: opportunityCompany, applied: false,
  deadline: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  applicationUrl: 'https://example.com/jobs', imagePath: '', missingMaterials: '成绩单、作品集',
})})`)
const opportunity = opportunities.find(item => item.company === opportunityCompany)
if (!opportunity || opportunity.applied || opportunity.missingMaterials !== '成绩单、作品集') throw new Error('无法创建独立岗位机会')
const editedOpportunities = await evaluate(`window.offerManager.saveOpportunity(${JSON.stringify({ ...opportunity, missingMaterials: '成绩单' })})`)
if (editedOpportunities.filter(item => item.id === opportunity.id).length !== 1 || editedOpportunities.find(item => item.id === opportunity.id)?.missingMaterials !== '成绩单') throw new Error('无法编辑岗位机会')
const toggledOpportunities = await evaluate(`window.offerManager.toggleOpportunityApplied(${JSON.stringify({ id: '__ID__', applied: true }).replace('__ID__', opportunity.id)})`)
if (!toggledOpportunities.find(item => item.id === opportunity.id)?.applied) throw new Error('无法切换岗位投递状态')

const stamp = new Date().toISOString()
const created = await evaluate(`window.offerManager.saveApplication(${JSON.stringify({
  company: '__SMOKE_TEST__', role: '测试职位', location: '', channel: '自动测试', url: '',
  appliedAt: new Date().toISOString(), status: '已投递', nextStep: '', notes: '',
})})`)
const application = created.applications.find(item => item.company === '__SMOKE_TEST__')
if (!application) throw new Error('无法创建投递记录')

const eventInput = {
  applicationId: application.id, title: `自动测试日程 ${stamp}`, eventType: '在线测评',
  startsAt: new Date(Date.now() + 86_400_000).toISOString(), duration: 45, location: '线上',
  meetingUrl: 'https://example.com/assessment', contact: '', status: '待进行', reminderMinutes: 30,
}
const withEvent = await evaluate(`window.offerManager.saveEvent(${JSON.stringify(eventInput)})`)
const interview = withEvent.events.find(item => item.applicationId === application.id)
if (!interview || interview.meetingUrl !== 'https://example.com/assessment') throw new Error('无法创建带独立链接的测评日程')

const createdReview = await evaluate(`window.offerManager.createReview(${JSON.stringify({ applicationId: application.id, eventId: interview.id })})`)
const review = await evaluate(`window.offerManager.readReview('${createdReview.review.id}')`)
if (!review.content.includes('面试问题')) throw new Error('Markdown 模板内容异常')

await evaluate(`window.offerManager.deleteReview('${createdReview.review.id}')`)
await evaluate(`window.offerManager.deleteEvent('${interview.id}')`)
await evaluate(`window.offerManager.deleteApplication('${application.id}')`)

await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('待投岗位'))?.click()`)
await new Promise(resolve => setTimeout(resolve, 800))
if (!await evaluate(`document.body.innerText.includes('可投递公司') && document.body.innerText.includes('缺失材料')`)) throw new Error('待投岗位页面未正确显示')
if (!await evaluate(`[...document.querySelectorAll('button[title="编辑"]')].some(button => button.closest('tr')?.innerText.includes('${opportunityCompany}'))`)) throw new Error('岗位编辑按钮未正确显示')
await evaluate(`[...document.querySelectorAll('button[title="编辑"]')].find(button => button.closest('tr')?.innerText.includes('${opportunityCompany}'))?.click()`)
await new Promise(resolve => setTimeout(resolve, 200))
if (!await evaluate(`document.body.innerText.includes('编辑岗位机会')`)) throw new Error('岗位编辑入口未正确显示')
await evaluate(`document.querySelector('.opportunity-modal .close-button')?.click()`)
await evaluate(`window.offerManager.deleteOpportunity('${opportunity.id}')`)

console.log('Smoke test passed: pages, SQLite CRUD, opportunity editing, schedule and Markdown review are working.')
socket.close()
