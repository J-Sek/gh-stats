import type { Plugin } from 'vite'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join('data', 'vuetify')
const ISSUES_FILE = path.join(DATA_DIR, 'open-issues-count.json')
const LOGS_FILE = path.join(DATA_DIR, 'logs.txt')
const COOLDOWN_FILE = path.join(DATA_DIR, 'cooldown-state.json')
const START_DATE = '2020-01-01'
const COOLDOWN_MS = 30_000

interface DayEntry {
  date: string
  count: number
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

function nextDate (entries: DayEntry[]): string {
  if (entries.length === 0) {
    return START_DATE
  }
  const last = entries.at(-1).date
  const d = new Date(last + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('T')[0]
}

function getProgress (entries: DayEntry[]): number {
  if (entries.length === 0) {
    return 0
  }
  const last = entries.at(-1).date
  const today = new Date().toISOString().split('T')[0]
  if (last >= today) {
    return 100
  }
  const start = new Date(START_DATE + 'T00:00:00Z').getTime()
  const end = new Date(today + 'T00:00:00Z').getTime()
  const current = new Date(last + 'T00:00:00Z').getTime()
  if (end === start) {
    return 100
  }
  return Math.min(Math.round(((current - start) / (end - start)) * 100), 99)
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

async function processNextDay () {
  const entries = readEntries()
  const date = nextDate(entries)
  const today = new Date().toISOString().split('T')[0]

  if (date > today) {
    appendLog('INFO', 'Caught up to today, nothing to fetch')
    return
  }

  try {
    let count: number

    if (entries.length === 0) {
      const created = await ghSearchCount(`repo:vuetifyjs/vuetify+is:issue+created:<=${date}`)
      const closed = await ghSearchCount(`repo:vuetifyjs/vuetify+is:issue+closed:<=${date}`)
      count = created - closed
      appendLog('INFO', `Baseline ${date}: ${created} created - ${closed} closed = ${count} open`)
    } else {
      const prevCount = entries.at(-1).count
      const opened = await ghSearchCount(`repo:vuetifyjs/vuetify+is:issue+created:${date}`)
      const closed = await ghSearchCount(`repo:vuetifyjs/vuetify+is:issue+closed:${date}`)
      count = prevCount + opened - closed
      appendLog('INFO', `${date}: +${opened} -${closed} = ${count} open`)
    }

    entries.push({ date, count })
    writeEntries(entries)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('API rate limit exceeded')) {
      appendLog('INFO', 'Cooldown 30s for rate limit')
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
        const date = nextDate(entries)
        const today = new Date().toISOString().split('T')[0]

        if (date > today) {
          json(res, { progress: 100 })
          return
        }

        running = true
        json(res, { started: true })
        processNextDay().finally(() => {
          running = false
        })
      })

      server.middlewares.use('/logs', (_req, res) => {
        json(res, { lines: readLastLogs(5) })
      })
    },
  }
}
