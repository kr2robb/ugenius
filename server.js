// server.js —— 后端 AI 代理（acde backend，Cloudflare Workers 风格）
// 视频走 DashScope 内置文件上传（无需自建 OSS）拿 oss:// URL，再调 Qwen 视频分析

const QWEN = {
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  uploadUrl: 'https://dashscope.aliyuncs.com/api/v1/uploads',
  model: 'qwen3.8-flash',
}

// API Key 只从环境变量读取，不写进源码 / 仓库。
// 本地开发：.env 里的 QWEN_API_KEY（dev-backend.mjs 会加载）
// acdert 真机：启动前把 QWEN_API_KEY 设置到宿主环境
function getApiKey() {
  const key =
    (typeof process !== 'undefined' && process.env && process.env.QWEN_API_KEY) || ''
  if (!key) throw new Error('未配置 QWEN_API_KEY 环境变量（参考 .env.example）')
  return key
}

// 把 undici 的 "fetch failed" 之类的错误展开出 cause，方便定位（TLS / DNS / 网络）
function errDetail(e) {
  const cause = e?.cause
  const causeMsg = cause?.message || cause?.code || (cause ? String(cause) : '')
  return causeMsg ? `${e?.message || e} (cause: ${causeMsg})` : String(e?.message || e)
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/api/health' && request.method === 'GET') {
      try {
        const diag = await healthCheck()
        return Response.json({ ok: true, runtime: process.version, platform: process.platform, ...diag })
      } catch (e) {
        return Response.json({ ok: false, runtime: process.version, platform: process.platform, error: errDetail(e) }, { status: 500 })
      }
    }

    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      try {
        const videoBytes = await request.arrayBuffer()
        const videoName = decodeURIComponent(request.headers.get('X-Video-Name') || 'video.mp4')
        const mimeType = request.headers.get('X-Video-Type') || 'video/mp4'
        const rank = decodeURIComponent(request.headers.get('X-Rank') || '')
        const reply = await analyzeVideo(videoBytes, videoName, mimeType, rank)
        return Response.json({ reply })
      } catch (e) {
        return Response.json({ error: errDetail(e) }, { status: 500 })
      }
    }

    return new Response('not found', { status: 404 })
  },
}

// 轻量连通性自检：只调 getPolicy（无副作用），返回错误详情
async function healthCheck() {
  let apiKey
  try {
    apiKey = getApiKey()
  } catch (e) {
    return { dashscope: false, reason: e.message }
  }
  const credRes = await fetch(`${QWEN.uploadUrl}?action=getPolicy&model=${QWEN.model}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!credRes.ok) return { dashscope: false, status: credRes.status }
  const cred = await credRes.json()
  return { dashscope: true, status: credRes.status, uploadHost: cred?.data?.upload_host }
}

// 1) 上传视频到 DashScope 内置存储，拿 oss:// URL
async function uploadToDashScope(videoBytes, videoName, mimeType) {
  const apiKey = getApiKey()
  const credRes = await fetch(`${QWEN.uploadUrl}?action=getPolicy&model=${QWEN.model}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!credRes.ok) throw new Error(`获取上传凭证失败 ${credRes.status}: ${await credRes.text()}`)
  const cred = await credRes.json()
  const d = cred.data

  // 用时间戳做文件名，避免中文/特殊字符问题。
  // 注意：upload_dir 是「目录前缀」，后面必须加 "/" 再接文件名，
  // 否则 OSS 对象会粘在 uuid 上，Qwen 解析时 ownership check 失败（access_denied）。
  const ext = (videoName.match(/\.(\w+)$/) || [null, 'mp4'])[1]
  const key = `${d.upload_dir}/${Date.now()}.${ext}`

  const form = new FormData()
  form.append('OSSAccessKeyId', d.oss_access_key_id)
  form.append('Signature', d.signature)
  form.append('policy', d.policy)
  form.append('x-oss-object-acl', d.x_oss_object_acl || 'private')
  form.append('x-oss-forbid-overwrite', d.x_oss_forbid_overwrite || 'true')
  form.append('key', key)
  form.append('success_action_status', '200')
  form.append('file', new Blob([videoBytes], { type: mimeType }), `video.${ext}`)

  const upRes = await fetch(d.upload_host, { method: 'POST', body: form })
  if (upRes.status !== 200) throw new Error(`上传视频到 DashScope 失败 ${upRes.status}: ${await upRes.text()}`)

  return `oss://${key}`
}

// 2) 用 oss:// URL 调 Qwen 视频分析
async function analyzeVideo(videoBytes, videoName, mimeType, rank = '') {
  const ossUrl = await uploadToDashScope(videoBytes, videoName, mimeType)

  const prompt = `你是无畏契约（VALORANT）复盘教练。这是玩家上传的一段 POV 对局视频（文件名：${videoName}）。${rank ? `该玩家当前段位是「${rank}」，评估能力时请以这个段位的平均水平作为基准。` : ''}
请仔细观看视频，返回一个 JSON 对象（不要多余文字），包含两个字段：

1. nodes：3-5 个关键决策节点数组，每项：
- time：时间点（mm:ss）
- title：场景标题
- advice：更好的打法建议
- agents：该时刻场上特工数组，每项 {name(中文特工名), team("ally"或"enemy"), pos(报点), skill(技能名，没有则省略)}
- smokes：烟雾数组，每项 {pos(报点)}
- utilities：哨位道具数组，每项 {type("camera"/"turret"/"wire"/"dart"), team, pos(报点)}

2. profile：针对视频里「这位玩家」的表现评估（不是通用建议，是基于该玩家的实际发挥）：
- abilities：能力评分对象，每项 1-5 分（0.5 粒度），以「同段位平均水平」为 3 分基准（3=该段位平均，4=中上，2=中下）：枪法、反应、道具使用、残局处理、经济管理、地图理解
- habits：本局观察到的行为习惯，简短中文标签数组（如"不爱搜点"、"残局偏紧张"、"喜欢激进"），只列确凿的

示例：
{"nodes":[{"time":"00:32","title":"残局 1v2 守 B 点","advice":"...","agents":[{"name":"捷风","team":"ally","pos":"B点","skill":"冲刺"}],"smokes":[{"pos":"B大"}],"utilities":[{"type":"camera","team":"enemy","pos":"B窗"}]}],"profile":{"abilities":{"枪法":4,"反应":3.5,"道具使用":3,"残局处理":3.5,"经济管理":3,"地图理解":3.5},"habits":["不爱搜点"]}}`

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'video_url', video_url: { url: ossUrl } },
        { type: 'text', text: prompt },
      ],
    },
  ]

  const res = await fetch(`${QWEN.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
      'X-DashScope-OssResourceResolve': 'enable',
    },
    body: JSON.stringify({ model: QWEN.model, messages, max_tokens: 4000 }),
  })
  if (!res.ok) throw new Error(`Qwen API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || null
}
