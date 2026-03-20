import type { Plugin } from 'vite'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join('data', 'vuetify')
const ISSUES_FILE = path.join(DATA_DIR, 'open-issues.json')
const LOGS_FILE = path.join(DATA_DIR, 'logs.txt')
const COOLDOWN_FILE = path.join(DATA_DIR, 'cooldown-state.json')
const START_DATE = '2016-12-14'
const COOLDOWN_MS = 5000

interface DayEntry {
  date: string
  count: number
  added: number
  closed: number
}

let running = false

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

function isCoolingDown (): boolean {
  if (!fs.existsSync(COOLDOWN_FILE)) return false
  const { until } = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'))
  return Date.now() < until
}

function setCooldown () {
  ensureDataDir()
  fs.writeFileSync(COOLDOWN_FILE, JSON.stringify({ until: Date.now() + COOLDOWN_MS }))
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
  if (total === 0) return 100
  return Math.min(Math.round(((end - current) / total) * 100), 99)
}

function ghSearchCount (query: string): Promise<number> {
  const cmd = `gh api "search/issues?q=${query}&per_page=1" --jq '.total_count'`
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
      } else {
        resolve(Number.parseInt(stdout.trim(), 10))
      }
    })
  })
}

async function processNext () {
  const entries = readEntries()
  const date = nextDate(entries)

  if (!date) {
    appendLog('INFO', 'All days fetched')
    return
  }

  try {
    const added = await ghSearchCount(`repo:vuetifyjs/vuetify+is:issue+created:${date}`)
    const closed = await ghSearchCount(`repo:vuetifyjs/vuetify+is:issue+closed:${date}`)

    let count: number
    if (entries.length === 0) {
      count = await ghSearchCount(`repo:vuetifyjs/vuetify+is:issue+is:open`)
      entries.push({ date, count, added, closed })
      appendLog('INFO', `Seed ${date}: ${count} open (+${added} -${closed})`)
    } else {
      // Find the next day after this one in existing data to derive count
      const idx = entries.findIndex(e => e.date > date)
      if (idx === -1) {
        const prev = entries.at(-1)!
        count = prev.count + added - closed
        entries.push({ date, count, added, closed })
      } else {
        const next = entries[idx]
        count = next.count - next.added + next.closed
        entries.splice(idx, 0, { date, count, added, closed })
      }
      appendLog('INFO', `${date}: +${added} -${closed} = ${count} open`)
    }

    writeEntries(entries)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('API rate limit exceeded')) {
      appendLog('INFO', 'Cooldown 5s for rate limit')
      setCooldown()
    } else {
      appendLog('ERROR', `Failed to fetch ${date}: ${msg}`)
    }
  }
}

function json (res: import('node:http').ServerResponse, data: unknown) {
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
        if (isCoolingDown()) {
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
