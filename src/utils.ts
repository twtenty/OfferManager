export const dateTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

export const fullDateTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

export const shortDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit',
}).format(new Date(value)).replaceAll('/', '-')

export const relativeTime = (value: string) => {
  const difference = new Date(value).getTime() - Date.now()
  const absolute = Math.abs(difference)
  if (absolute < 60_000) return difference >= 0 ? '即将开始' : '刚刚'
  if (absolute < 3_600_000) {
    const minutes = Math.round(absolute / 60_000)
    return difference >= 0 ? `${minutes} 分钟后` : `${minutes} 分钟前`
  }
  if (absolute < 86_400_000) {
    const hours = Math.round(absolute / 3_600_000)
    return difference >= 0 ? `${hours} 小时后` : `${hours} 小时前`
  }
  const days = Math.round(absolute / 86_400_000)
  return difference >= 0 ? `${days} 天后` : `${days} 天前`
}

const pad = (value: number) => String(value).padStart(2, '0')

export const toInputDate = (value?: string) => {
  const date = value ? new Date(value) : new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const toInputDateTime = (value?: string) => {
  const date = value ? new Date(value) : new Date(Date.now() + 86_400_000)
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
