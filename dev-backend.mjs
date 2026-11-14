// 本地开发后端适配器：把 server.js 的 worker 风格 fetch handler 挂到一个本地 HTTP 端口，
// 配合 vite proxy 让浏览器里也能完整跑 AI 复盘（无需 acdert 真机）。
// 用法：node dev-backend.mjs （默认 8787）

import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 本地开发：加载项目根目录的 .env（QWEN_API_KEY 等），.env 不进版本库
const envPath = fileURLToPath(new URL('.env', import.meta.url))
if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath)
}

const app = (await import('./server.js')).default
const PORT = process.env.DEV_BACKEND_PORT || 8787

const SKIP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'upgrade', 'http2-settings', 'proxy-connection', 'host'])

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const headers = new Headers()
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i]
      if (SKIP.has(name.toLowerCase())) continue
      headers.append(name, req.rawHeaders[i + 1])
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(url.href, {
      method: req.method,
      headers,
      ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    })
    const response = await app.fetch(request)

    const head = []
    for (const [k, v] of response.headers) head.push(k, v)
    res.writeHead(response.status, head)
    if (!response.body || req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(String(e?.message || e))
  }
})

server.listen(PORT, () => console.log(`[dev-backend] http://localhost:${PORT}  (代理 server.js 的 /api/*)`))
