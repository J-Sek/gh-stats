import fs from 'node:fs'
import type { Plugin } from 'vite'

const PROGRESS_FILE = 'fake-progress.json'

function readProgress () {
  if (!fs.existsSync(PROGRESS_FILE)) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ v: 0 }))
  }
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
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
        json(res, readProgress())
      })

      server.middlewares.use('/run', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const data = readProgress()
        data.v = Math.min(data.v + 5, 100)
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data))
        json(res, data)
      })
    },
  }
}
