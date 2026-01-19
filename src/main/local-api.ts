import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import log from 'electron-log/main'

import { downloadEngine } from './lib/download-engine'
import { historyManager } from './lib/history-manager'
import { subscriptionManager } from './lib/subscription-manager'
import { subscriptionScheduler } from './lib/subscription-scheduler'
import { settingsManager } from './settings'

const PORT_RANGE_START = 27100
const PORT_RANGE_END = 27120
const WEB_PORT_RANGE_START = 27200
const WEB_PORT_RANGE_END = 27220
const TOKEN_TTL_MS = 60_000

type TokenRecord = {
  expiresAt: number
}

let server: http.Server | null = null
let serverPort: number | null = null
let webServer: http.Server | null = null
let webServerPort: number | null = null
const tokens = new Map<string, TokenRecord>()

const isLoopbackAddress = (address?: string | null): boolean => {
  if (!address) return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

const writeJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(body))
}

const writeEmpty = (res: http.ServerResponse, status: number): void => {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end()
}

const issueToken = (): string => {
  const token = crypto.randomBytes(16).toString('hex')
  tokens.set(token, { expiresAt: Date.now() + TOKEN_TTL_MS })
  return token
}

const consumeToken = (token?: string | null): boolean => {
  if (!token) return false
  const record = tokens.get(token)
  if (!record) return false
  if (Date.now() > record.expiresAt) {
    tokens.delete(token)
    return false
  }
  tokens.delete(token)
  return true
}

const handleRequest = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  try {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      writeJson(res, 403, { error: 'Forbidden' })
      return
    }

    if (req.method === 'OPTIONS') {
      writeEmpty(res, 204)
      return
    }

    if (!req.url) {
      writeJson(res, 400, { error: 'Missing URL' })
      return
    }

    const requestUrl = new URL(req.url, 'http://127.0.0.1')
    const pathname = requestUrl.pathname

    if (
      req.method !== 'GET' &&
      req.method !== 'POST' &&
      req.method !== 'DELETE' &&
      req.method !== 'PUT'
    ) {
      writeJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (pathname === '/token') {
      const token = issueToken()
      writeJson(res, 200, { token, expiresInMs: TOKEN_TTL_MS })
      return
    }

    if (pathname === '/video-info') {
      const token = requestUrl.searchParams.get('token')
      if (!consumeToken(token)) {
        writeJson(res, 401, { error: 'Invalid token' })
        return
      }

      const targetUrl = requestUrl.searchParams.get('url')
      if (!targetUrl || !targetUrl.trim()) {
        writeJson(res, 400, { error: 'Missing url' })
        return
      }

      try {
        const info = await downloadEngine.getVideoInfo(targetUrl.trim())
        writeJson(res, 200, {
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
          formats: info.formats ?? []
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch video info'
        const details =
          error instanceof Error
            ? error.stack
            : typeof error === 'object' && error && 'stderr' in error
              ? String((error as { stderr?: unknown }).stderr ?? '')
              : undefined
        writeJson(res, 500, { error: message, details })
      }
      return
    }

    if (pathname === '/status') {
      writeJson(res, 200, { ok: true })
      return
    }

    writeJson(res, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unhandled request error'
    writeJson(res, 500, { error: message })
  }
}

const getRequestBody = async (req: http.IncomingMessage): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve(body)
      }
    })
    req.on('error', reject)
  })
}

const handleApiRequest = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  try {
    if (req.method === 'OPTIONS') {
      writeEmpty(res, 204)
      return
    }

    if (!req.url) {
      writeJson(res, 400, { error: 'Missing URL' })
      return
    }

    const requestUrl = new URL(req.url, 'http://127.0.0.1')
    const pathname = requestUrl.pathname
    const method = req.method

    log.info(`API Request: ${method} ${pathname}`)

    // Debug: check if pathname matches expected
    if (pathname.includes('video-info')) {
      log.info(
        `[DEBUG] pathname="${pathname}" === "/api/download/video-info-with-command"? ${pathname === '/api/download/video-info-with-command'}`
      )
    }

    // App Service
    if (pathname === '/api/app/version' && method === 'GET') {
      writeJson(res, 200, { version: process.env.npm_package_version || '1.2.0' })
      return
    }

    if (pathname === '/api/app/status' && method === 'GET') {
      writeJson(res, 200, { ok: true })
      return
    }

    // Settings Service
    if (pathname === '/api/settings' && method === 'GET') {
      writeJson(res, 200, settingsManager.getAll())
      return
    }

    if (pathname.startsWith('/api/settings/') && method === 'GET') {
      const key = pathname.split('/')[3]
      writeJson(res, 200, { value: settingsManager.get(key as never) })
      return
    }

    if (pathname.startsWith('/api/settings/') && method === 'PUT') {
      const key = pathname.split('/')[3]
      const body = (await getRequestBody(req)) as { value: unknown }
      settingsManager.set(key as never, body.value as never)
      writeJson(res, 200, { success: true })
      return
    }

    // Download Service
    if (pathname === '/api/download/video-info' && method === 'GET') {
      const url = requestUrl.searchParams.get('url')
      if (!url || !url.trim()) {
        writeJson(res, 400, { error: 'Missing url' })
        return
      }
      try {
        const info = await downloadEngine.getVideoInfo(url.trim())
        writeJson(res, 200, info)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch video info'
        writeJson(res, 500, { error: message })
      }
      return
    }

    if (pathname === '/api/download/video-info-with-command' && method === 'GET') {
      const url = requestUrl.searchParams.get('url')
      if (!url || !url.trim()) {
        writeJson(res, 400, { error: 'Missing url' })
        return
      }
      try {
        const result = await downloadEngine.getVideoInfoWithCommand(url.trim())
        writeJson(res, 200, result)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch video info'
        writeJson(res, 500, { error: message })
      }
      return
    }

    if (pathname === '/api/download/playlist-info' && method === 'GET') {
      const url = requestUrl.searchParams.get('url')
      if (!url || !url.trim()) {
        writeJson(res, 400, { error: 'Missing url' })
        return
      }
      try {
        const info = await downloadEngine.getPlaylistInfo(url.trim())
        writeJson(res, 200, info)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch playlist info'
        writeJson(res, 500, { error: message })
      }
      return
    }

    if (pathname === '/api/download/queue' && method === 'GET') {
      writeJson(res, 200, {
        active: downloadEngine.getActiveDownloads(),
        status: downloadEngine.getQueueStatus()
      })
      return
    }

    if (pathname.startsWith('/api/download/') && method === 'POST') {
      const id = pathname.split('/')[3]
      const options = (await getRequestBody(req)) as unknown
      downloadEngine.startDownload(id, options as never)
      writeJson(res, 200, { success: true, id })
      return
    }

    if (pathname.startsWith('/api/download/') && method === 'DELETE') {
      const id = pathname.split('/')[3]
      const cancelled = downloadEngine.cancelDownload(id)
      writeJson(res, 200, { success: cancelled })
      return
    }

    if (pathname.match(/^\/api\/download\/[^/]+\/info$/) && method === 'PUT') {
      const match = pathname.match(/^\/api\/download\/([^/]+)\/info$/)
      if (match) {
        const id = match[1]
        const updates = (await getRequestBody(req)) as unknown
        downloadEngine.updateDownloadInfo(id, updates as never)
        writeJson(res, 200, { success: true })
        return
      }
    }

    // History Service
    if (pathname === '/api/history' && method === 'GET') {
      writeJson(res, 200, historyManager.getHistory())
      return
    }

    if (pathname === '/api/history/cleanup' && method === 'POST') {
      const removed = historyManager.removeInvalidRecords()
      writeJson(res, 200, { success: true, removed })
      return
    }

    if (pathname === '/api/history/count' && method === 'GET') {
      writeJson(res, 200, historyManager.getHistoryCount())
      return
    }

    if (pathname.startsWith('/api/history/') && method === 'DELETE') {
      const id = pathname.split('/')[3]
      const removed = historyManager.removeHistoryItem(id)
      writeJson(res, 200, { success: removed })
      return
    }

    if (pathname === '/api/history/clear' && method === 'DELETE') {
      historyManager.clearHistory()
      writeJson(res, 200, { success: true })
      return
    }

    // Subscription Service
    if (pathname === '/api/subscriptions' && method === 'GET') {
      writeJson(res, 200, subscriptionManager.getAll())
      return
    }

    if (pathname === '/api/subscriptions' && method === 'POST') {
      const options = (await getRequestBody(req)) as unknown
      try {
        const created = await subscriptionManager.add(options as never)
        await subscriptionScheduler.runNow(created.id)
        writeJson(res, 201, created)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create subscription'
        writeJson(res, 500, { error: message })
      }
      return
    }

    if (pathname.startsWith('/api/subscriptions/') && method === 'PUT') {
      const id = pathname.split('/')[3]
      const updates = (await getRequestBody(req)) as unknown
      const updated = subscriptionManager.update(id, updates as never)
      if (updated) {
        writeJson(res, 200, updated)
      } else {
        writeJson(res, 404, { error: 'Subscription not found' })
      }
      return
    }

    if (pathname.startsWith('/api/subscriptions/') && method === 'DELETE') {
      const id = pathname.split('/')[3]
      const removed = subscriptionManager.remove(id)
      writeJson(res, 200, { success: removed })
      return
    }

    if (pathname === '/api/subscriptions/refresh' && method === 'POST') {
      await subscriptionScheduler.runNow()
      writeJson(res, 200, { success: true })
      return
    }

    if (
      pathname.startsWith('/api/subscriptions/') &&
      pathname.endsWith('/refresh') &&
      method === 'POST'
    ) {
      const id = pathname.split('/')[3]
      await subscriptionScheduler.runNow(id)
      writeJson(res, 200, { success: true })
      return
    }

    writeJson(res, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unhandled request error'
    log.error('API Error:', message, error)
    writeJson(res, 500, { error: message })
  }
}

const startServerOnPort = (port: number): Promise<http.Server> =>
  new Promise((resolve, reject) => {
    const httpServer = http.createServer((req, res) => {
      void handleRequest(req, res)
    })

    httpServer.once('error', (error) => {
      httpServer.close()
      reject(error)
    })

    httpServer.listen(port, '127.0.0.1', () => resolve(httpServer))
  })

export async function startExtensionApiServer(): Promise<number | null> {
  if (server && serverPort) {
    return serverPort
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port += 1) {
    try {
      server = await startServerOnPort(port)
      const address = server.address() as AddressInfo | null
      serverPort = address?.port ?? port
      log.info(`Extension API listening on 127.0.0.1:${serverPort}`)
      return serverPort
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code !== 'EADDRINUSE') {
        log.warn('Extension API failed to start on port:', port, err)
      }
    }
  }

  log.error(`Extension API failed to bind any port in range ${PORT_RANGE_START}-${PORT_RANGE_END}`)
  return null
}

export async function stopExtensionApiServer(): Promise<void> {
  if (!server) return

  await new Promise<void>((resolve) => {
    server?.close(() => resolve())
  })

  server = null
  serverPort = null
  tokens.clear()
}

const serveStaticFile = (reqPath: string, res: http.ServerResponse, basePath: string): boolean => {
  let filePath = path.join(basePath, reqPath)
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath)
    const contentType =
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject'
      }[ext] || 'application/octet-stream'

    const content = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
    return true
  }
  return false
}

const handleWebRequest = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  rendererDistPath: string
): void => {
  try {
    if (!req.url) {
      writeJson(res, 400, { error: 'Missing URL' })
      return
    }

    const requestUrl = new URL(req.url, 'http://127.0.0.1')
    let pathname = requestUrl.pathname

    if (pathname === '/') {
      pathname = '/index.html'
    }

    if (pathname.startsWith('/api/')) {
      void handleApiRequest(req, res)
      return
    }

    if (serveStaticFile(pathname, res, rendererDistPath)) {
      return
    }

    writeJson(res, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unhandled request error'
    log.error('Web Server Error:', message, error)
    writeJson(res, 500, { error: message })
  }
}

export async function startWebServer(rendererDistPath: string): Promise<number | null> {
  if (webServer && webServerPort) {
    return webServerPort
  }

  for (let port = WEB_PORT_RANGE_START; port <= WEB_PORT_RANGE_END; port += 1) {
    try {
      webServer = http.createServer((req, res) => {
        handleWebRequest(req, res, rendererDistPath)
      })

      await new Promise<void>((resolve, reject) => {
        webServer?.once('error', (error) => {
          webServer?.close()
          reject(error)
        })
        webServer?.listen(port, '0.0.0.0', () => resolve())
      })

      const address = webServer.address() as AddressInfo | null
      webServerPort = address?.port ?? port
      log.info(`Web Server listening on 0.0.0.0:${webServerPort}`)
      return webServerPort
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code !== 'EADDRINUSE') {
        log.warn('Web Server failed to start on port:', port, err)
      }
    }
  }

  log.error(
    `Web Server failed to bind any port in range ${WEB_PORT_RANGE_START}-${WEB_PORT_RANGE_END}`
  )
  return null
}

export async function stopWebServer(): Promise<void> {
  if (!webServer) return

  await new Promise<void>((resolve) => {
    webServer?.close(() => resolve())
  })

  webServer = null
  webServerPort = null
}
