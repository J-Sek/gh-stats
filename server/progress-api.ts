import type * as http from 'node:http'
import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Octokit } from 'octokit'

const DATA_DIR = path.join('data', 'vuetify')
const ISSUES_FILE = path.join(DATA_DIR, 'open-issues.json')
const LOGS_FILE = path.join(DATA_DIR, 'logs.txt')
const START_DATE = '2016-12-14'

interface DayEntry {
  date: string
  count: number
  added: number
  closed: number
  closedCompleted?: number
  closedNotPlanned?: number
}

let running = false
let rateLimitReset = 0

function getToken (): string {
  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN
  }
  return execSync('gh auth token', { encoding: 'utf8' }).trim()
}

const octokit = new Octokit({ auth: getToken() })

function ensureDataDir () {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readEntries (): DayEntry[] {
  ensureDataDir()
  if (!fs.existsSync(ISSUES_FILE)) {
    return []
  }
  return JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf8'))
}

function writeEntries (entries: DayEntry[]) {
  ensureDataDir()
  fs.writeFileSync(ISSUES_FILE, JSON.stringify(entries, null, 2))
}

function appendLog (level: 'INFO' | 'ERROR', message: string) {
  ensureDataDir()
  const ts = new Date().toISOString()
  fs.appendFileSync(LOGS_FILE, `${ts} [${level}] ${message}\n`)
}

function readLastLogs (n: number): string[] {
  if (!fs.existsSync(LOGS_FILE)) {
    return []
  }
  const content = fs.readFileSync(LOGS_FILE, 'utf8').trim()
  if (!content) {
    return []
  }
  return content.split('\n').slice(-n)
}

function isRateLimited (): boolean {
  return Date.now() < rateLimitReset
}

function addDays (iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function nextDate (entries: DayEntry[]): string | null {
  const today = new Date().toISOString().split('T')[0]
  const dates = new Set(entries.map(e => e.date))
  let cursor = today
  while (cursor >= START_DATE) {
    if (!dates.has(cursor)) {
      return cursor
    }
    cursor = addDays(cursor, -1)
  }
  return null
}

function getProgress (entries: DayEntry[]): number {
  if (entries.length === 0) {
    return 0
  }
  const first = entries[0].date
  if (first <= START_DATE) {
    return 100
  }
  const start = new Date(START_DATE + 'T00:00:00Z').getTime()
  const today = new Date().toISOString().split('T')[0]
  const end = new Date(today + 'T00:00:00Z').getTime()
  const current = new Date(first + 'T00:00:00Z').getTime()
  const total = end - start
  if (total === 0) {
    return 100
  }
  return Math.min(Math.round(((end - current) / total) * 100), 99)
}

function checkRateLimit (headers: Record<string, string | undefined>) {
  const remaining = Number(headers['x-ratelimit-remaining'] ?? 1)
  if (remaining === 0) {
    rateLimitReset = Number(headers['x-ratelimit-reset'] ?? 0) * 1000
  }
}

async function searchCount (query: string): Promise<number> {
  const res = await octokit.rest.search.issuesAndPullRequests({
    q: query,
    per_page: 1,
  })
  checkRateLimit(res.headers as Record<string, string | undefined>)
  return res.data.total_count
}

async function searchClosedByReason (date: string): Promise<{ closed: number, closedCompleted: number, closedNotPlanned: number }> {
  const res = await octokit.rest.search.issuesAndPullRequests({
    q: `repo:vuetifyjs/vuetify is:issue closed:${date}`,
    per_page: 100,
  })
  checkRateLimit(res.headers as Record<string, string | undefined>)
  let closedCompleted = 0
  let closedNotPlanned = 0
  for (const item of res.data.items) {
    if (item.state_reason === 'completed') {
      closedCompleted++
    } else if (item.state_reason === 'not_planned') {
      closedNotPlanned++
    }
  }
  return { closed: res.data.total_count, closedCompleted, closedNotPlanned }
}

function nextBackfillEntry (entries: DayEntry[]): DayEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].closedCompleted == null) {
      return entries[i]
    }
  }
  return null
}

function handleError (error: unknown, context: string) {
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes('rate limit') || msg.includes('secondary rate limit')) {
    const secs = Math.ceil((rateLimitReset - Date.now()) / 1000)
    appendLog('INFO', `Cooldown ${secs}s for rate limit`)
  } else {
    appendLog('ERROR', `${context}: ${msg}`)
  }
}

async function processBackfill (entries: DayEntry[]) {
  const entry = nextBackfillEntry(entries)

  if (!entry) {
    appendLog('INFO', 'Close-reason backfill complete')
    return
  }

  try {
    const { closedCompleted, closedNotPlanned } = await searchClosedByReason(entry.date)
    entry.closedCompleted = closedCompleted
    entry.closedNotPlanned = closedNotPlanned
    appendLog('INFO', `${entry.date}: (backfill) ${closedCompleted} completed, ${closedNotPlanned} not planned`)
    writeEntries(entries)
  } catch (error: unknown) {
    handleError(error, `Backfill failed ${entry.date}`)
  }
}

async function processNext () {
  const entries = readEntries()

  if (nextBackfillEntry(entries)) {
    return processBackfill(entries)
  }

  const date = nextDate(entries)

  if (!date) {
    appendLog('INFO', 'All days fetched')
    return
  }

  try {
    const added = await searchCount(`repo:vuetifyjs/vuetify is:issue created:${date}`)
    const { closed, closedCompleted, closedNotPlanned } = await searchClosedByReason(date)

    let count: number
    if (entries.length === 0) {
      count = await searchCount('repo:vuetifyjs/vuetify is:issue is:open')
      entries.push({ date, count, added, closed, closedCompleted, closedNotPlanned })
      appendLog('INFO', `Seed ${date}: ${count} open (+${added} -${closed})`)
    } else {
      const idx = entries.findIndex(e => e.date > date)
      if (idx === -1) {
        const prev = entries.at(-1)!
        count = prev.count + added - closed
        entries.push({ date, count, added, closed, closedCompleted, closedNotPlanned })
      } else {
        const next = entries[idx]
        count = next.count - next.added + next.closed
        entries.splice(idx, 0, { date, count, added, closed, closedCompleted, closedNotPlanned })
      }
      appendLog('INFO', `${date}: +${added} -${closed} = ${count} open`)
    }

    writeEntries(entries)
  } catch (error: unknown) {
    handleError(error, `Failed to fetch ${date}`)
  }
}

function json (res: http.ServerResponse, data: unknown) {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export function progressApi (): Plugin {
  return {
    name: 'progress-api',
    configureServer (server) {
      server.middlewares.use('/check', (_req, res) => {
        const entries = readEntries()
        json(res, {
          progress: getProgress(entries),
          openIssues: entries,
        })
      })

      server.middlewares.use('/run', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        if (running) {
          res.statusCode = 409
          json(res, { error: 'Already running' })
          return
        }
        if (isRateLimited()) {
          res.statusCode = 429
          json(res, { error: 'Cooling down' })
          return
        }

        const entries = readEntries()
        const progress = getProgress(entries)

        if (progress >= 100) {
          json(res, { progress: 100 })
          return
        }

        running = true
        json(res, { started: true })
        processNext().finally(() => {
          running = false
        })
      })

      server.middlewares.use('/logs', (_req, res) => {
        json(res, { lines: readLastLogs(5) })
      })
    },
  }
}
