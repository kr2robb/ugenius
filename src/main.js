import { load } from '@dopame/acde-api'
import './style.css'

// 是否加载示例数据（正式上线设为 false；测试时设为 true 可复现示例内容）
const USE_MOCK = false

// ===== 内联 SVG 图标（acdert 字体不支持 emoji，图标统一用 SVG）=====
const ICON_PATHS = {
  video: '<rect x="2" y="4" width="14" height="16" rx="2"/><path d="M22 8l-6 4 6 4z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  flame: '<path d="M12 22a6 6 0 0 0 6-6c0-3-2-5-6-12-4 7-6 9-6 12a6 6 0 0 0 6 6z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  gamepad: '<path d="M6 11h4M8 9v4"/><circle cx="15.5" cy="12.5" r="1"/><circle cx="18" cy="10" r="1"/><rect x="2" y="6" width="20" height="12" rx="5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 5H4v3a3 3 0 0 0 3 3M17 5h3v3a3 3 0 0 1-3 3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  pin: '<path d="M12 17v5M5 9h14l-1 6H6zM9 9V4h6v5"/>',
  window: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>',
}
const ICON_ATTRS = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
function icon(name, size = 16) {
  const body = ICON_PATHS[name] || ''
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${ICON_ATTRS} aria-hidden="true">${body}</svg>`
}

// —— 接入 acde 窗口能力（开发环境为 stub，运行在 Dopame OS 时生效）——
const acdeWindow = await load('window')
if (acdeWindow) {
  acdeWindow.setTitle('优竞 Ugenius')
}
const fs = await load('fs')
const acdeLaunch = await load('launch')
const acdeOpen = await load('open')
const acdeOpenPath = await load('openPath')

// ===== 系统能力：open / launch（真机生效，开发环境 stub 降级）=====

// 打开外部链接（真机用 acde:open；开发环境降级浏览器新标签页）
async function openLink(url) {
  if (!url) return
  if (acdeOpen) {
    try {
      await acdeOpen({ kind: 'open-link', url })
      return
    } catch (e) {
      console.error('acde:open 打开链接失败', e)
    }
  }
  window.open(url, '_blank')
}

// 启动无畏契约（真机用 acde:launch；命令按真机实际可执行文件填）
const GAME_CMD = 'valorant'
async function launchGame() {
  if (acdeLaunch) {
    try {
      await acdeLaunch.start([GAME_CMD])
      return
    } catch (e) {
      alert('启动游戏失败：' + (e?.message || e))
      return
    }
  }
  alert('启动游戏需在 Dopame OS 真机环境使用')
}

// 用系统默认程序打开本地文件（真机用 acde:openPath）
async function openFileByPath(path) {
  if (!path) return
  if (acdeOpenPath) {
    try {
      await acdeOpenPath(path)
      return
    } catch (e) {
      console.error('openPath 失败', e)
    }
  }
  console.warn('openPath 需真机环境', path)
}

// 打开同应用的新窗口（多窗口：真机用 acde:open 自开窗口；开发环境降级提示）
async function openNewWindow(request = null, options = {}) {
  if (acdeOpen) {
    try {
      const { window } = await acdeOpen('game-assistant', request, options)
      return window
    } catch (e) {
      console.error('打开新窗口失败', e)
    }
  }
  console.warn('多窗口需 Dopame OS 真机环境')
  return null
}

// —— 数据持久化（acde:fs 应用私有空间，root='private'）——
async function saveStore(key, data) {
  if (!fs) return
  try {
    await fs.writeFile('private', `store/${key}.json`, JSON.stringify(data), { mkdirs: true })
  } catch (e) {
    console.error('saveStore 失败:', key, e)
  }
}

async function loadStore(key, fallback) {
  if (!fs) return fallback
  try {
    const r = await fs.readText('private', `store/${key}.json`)
    return JSON.parse(r.text)
  } catch {
    return fallback
  }
}

// ===== 复盘分析：读视频 → binary 直传后端（server.js 走 DashScope 上传 + Qwen 视频分析）=====
async function analyzeReplay(file) {
  if (!file) return { error: '未选择视频' }
  try {
    const bytes = await file.arrayBuffer()
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Video-Name': encodeURIComponent(file.name),
        'X-Video-Type': file.type || 'video/mp4',
        'X-Rank': encodeURIComponent(profile?.rank || ''),
      },
      body: bytes,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) return { error: data.error || `HTTP ${res.status}` }
    const { reply } = data
    if (!reply) return { error: 'AI 未返回内容' }
    const cleaned = reply.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const nodes = Array.isArray(parsed) ? parsed : parsed.nodes
    return { nodes, profile: parsed?.profile || null }
  } catch (e) {
    console.error('复盘分析异常:', e)
    return { error: e?.message || String(e) }
  }
}

// ===== 顶栏：游戏名下拉菜单 =====
const gameBtn = document.getElementById('gameBtn')
const gameMenu = document.getElementById('gameMenu')

gameBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  gameMenu.hidden = !gameMenu.hidden
})

// 点击页面其他地方关闭菜单
document.addEventListener('click', () => {
  gameMenu.hidden = true
})

// 切换面板（顶栏菜单 / 应用菜单 / agent 调用 共用）
function switchPanel(panelId) {
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== panelId))
}

// —— 页面导航 + 返回 ——
let currentPanel = 'home'
const panelHistory = []

function navigateTo(panelId, push = true) {
  if (push && panelId !== currentPanel) panelHistory.push(currentPanel)
  currentPanel = panelId
  switchPanel(panelId)
  updateBackButton()
}

function goBack() {
  if (!panelHistory.length) return
  currentPanel = panelHistory.pop()
  switchPanel(currentPanel)
  updateBackButton()
}

function updateBackButton() {
  const btn = document.getElementById('backBtn')
  if (btn) btn.hidden = panelHistory.length === 0
}

document.getElementById('backBtn')?.addEventListener('click', goBack)

// 首页入口 → 切到对应板块（平级导航）
document.querySelectorAll('.home-entry').forEach((el) => {
  el.addEventListener('click', () => navigateTo(el.dataset.panel, false))
})

// 顶栏 logo → 回到初始首页（并清空返回栈）
document.getElementById('brandHome')?.addEventListener('click', () => {
  panelHistory.length = 0
  navigateTo('home', false)
})

// 首页 logo 金色流光：多层金色字标 + 柔光跟随光标
const homeLogoWrap = document.getElementById('homeLogoWrap')
const homeLogoGolds = homeLogoWrap ? [...homeLogoWrap.querySelectorAll('.home-logo-gold')] : []
const homeLogoGlow = homeLogoWrap?.querySelector('.home-logo-glow')
if (homeLogoWrap) {
  homeLogoWrap.addEventListener('mousemove', (e) => {
    const rect = homeLogoWrap.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    homeLogoGolds.forEach((img) => {
      img.style.clipPath = `circle(${img.dataset.goldRadius}px at ${x}px ${y}px)`
    })
    if (homeLogoGlow) {
      const gr = homeLogoGlow.getBoundingClientRect()
      homeLogoWrap.style.setProperty('--gx', `${((e.clientX - gr.left) / gr.width) * 100}%`)
      homeLogoWrap.style.setProperty('--gy', `${((e.clientY - gr.top) / gr.height) * 100}%`)
    }
  })
  homeLogoWrap.addEventListener('mouseleave', () => {
    homeLogoGolds.forEach((img) => {
      img.style.clipPath = 'circle(0px at 50% 50%)'
    })
  })
}

// 顶栏菜单项 → 切换面板（平级导航，不压返回栈）
document.querySelectorAll('.menu-item').forEach((item) => {
  item.addEventListener('click', () => {
    navigateTo(item.dataset.panel, false)
    gameMenu.hidden = true
  })
})

// 应用菜单（setMenus，真机生效；开发环境 stub 无副作用）
function setupAppMenu() {
  if (!acdeWindow?.setMenus) return
  try {
    acdeWindow.setMenus([
      {
        id: 'view',
        label: '视图',
        items: [
          { id: 'review', label: '赛后复盘', onSelect: () => navigateTo('review', false) },
          { id: 'community', label: '社区交流', onSelect: () => navigateTo('community', false) },
          { id: 'team', label: '组队大厅', onSelect: () => navigateTo('team', false) },
        ],
      },
      {
        id: 'help',
        label: '帮助',
        items: [{ id: 'guide', label: '打开无畏契约官网', onSelect: () => openLink('https://val.qq.com') }],
      },
    ])
  } catch (e) {
    console.warn('setMenus 失败', e)
  }
}
setupAppMenu()

// 头像 → 个人中心
document.getElementById('avatarBtn').addEventListener('click', () => {
  navigateTo('profile', true)
  renderProfile()
})

// ===== 视频选择与预览 =====
const videoArea = document.getElementById('videoArea')
const videoEmpty = document.getElementById('videoEmpty')
const video = document.getElementById('video')
const fileInput = document.getElementById('fileInput')
const pickBtn = document.getElementById('pickBtn')
const analyzeBtn = document.getElementById('analyzeBtn')

let objectUrl = null
let currentVideoName = ''
let currentVideoFile = null

async function showVideo(file) {
  if (!file) return
  // acdert 里 file.type 可能为空，用扩展名兜底判断
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(file.name || '')
  if (!isVideo) {
    console.warn('非视频文件:', file.name, file.type)
    return
  }
  // acdert 里 File 是按需读取的（NotReadableError），需先 arrayBuffer() 读出再包成真正的 Blob
  const bytes = await file.arrayBuffer()
  const blob = new Blob([bytes], { type: file.type || 'video/mp4' })
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(blob)
  currentVideoName = file.name
  currentVideoFile = file
  video.src = objectUrl
  video.hidden = false
  videoEmpty.hidden = true
  analyzeBtn.hidden = false
  renderNodes()
}

// 应用 AI 返回的节点建议
function applyAiNodes(aiNodes) {
  nodes = aiNodes.map((n, i) => ({
    time: n.time || `节点 ${i + 1}`,
    title: n.title || '复盘建议',
    advice: n.advice || '',
    preview: n.preview || null,
    route: n.route || null,
    agents: normalizeAgents(n.agents),
    smokes: normalizeSmokes(n.smokes),
    utilities: normalizeUtilities(n.utilities),
  }))
  activeNode = 0
  renderNodes()
}

// 开始 AI 复盘（按钮点击 与 agent 调用 共用）
async function startAnalyze() {
  analyzeBtn.textContent = '⏳ 分析中...'
  analyzeBtn.disabled = true
  const { nodes: result, profile, error } = await analyzeReplay(currentVideoFile)
  analyzeBtn.textContent = '✨ 开始 AI 复盘'
  analyzeBtn.disabled = false
  if (result && result.length) {
    applyAiNodes(result)
    saveReplay(result)
    if (profile) updateUserProfile(profile)
  } else {
    alert(error ? `AI 复盘失败：${error}` : '分析失败，请重试')
  }
}
analyzeBtn.addEventListener('click', startAnalyze)

// 聚合每次复盘的「能力+习惯」评估 → 用户画像（能力滑动窗口，习惯长期计数）
async function updateUserProfile(profile) {
  if (!profile) return
  const up = await loadStore('user_profile', { gameCount: 0, abilities: {}, habits: {} })
  up.gameCount = (up.gameCount || 0) + 1
  for (const [k, v] of Object.entries(profile.abilities || {})) {
    if (typeof v !== 'number') continue
    if (!up.abilities[k]) up.abilities[k] = []
    up.abilities[k].push(v)
    if (up.abilities[k].length > 10) up.abilities[k].shift() // 滑动窗口：最近 10 场
  }
  for (const h of profile.habits || []) {
    if (!h) continue
    up.habits[h] = (up.habits[h] || 0) + 1
  }
  await saveStore('user_profile', up)
}

// ===== 被智能体调用入口（agent → 应用）=====
// Dopame OS 里，系统 agent / 其他应用用 open('game-assistant', { kind, ... }) 调用本应用，
// 本应用用 window.on('request', handler) 接住。request 是单向通知（无同步返回值），
// 处理结果展示在窗口内，agent 可通过系统 inspect 查看。
let appReady = false
let pendingRequest = null

async function handleIncomingRequest(request) {
  if (!request || typeof request !== 'object') return
  console.log('[agent 调用]', request.kind, request)
  // 启动早期 request 可能在数据（posts）加载完之前到达，先暂存，初始化完成后再处理
  if (!appReady) {
    pendingRequest = request
    return
  }
  await processRequest(request)
}

async function processRequest(request) {
  const kind = request.kind

  // 系统级 open-file / 自定义 analyze-replay：agent 把 POV 视频交给本应用复盘
  if (kind === 'open-file' || kind === 'analyze-replay') {
    const file = (await resolveRequestFile(request)) || currentVideoFile
    if (!file) return
    switchPanel('review')
    if (file !== currentVideoFile) await showVideo(file)
    startAnalyze()
    return
  }

  // 系统级 open-link：agent 交来一个链接 → 用 acde:open 打开
  if (kind === 'open-link' && request.url) {
    await openLink(request.url)
    return
  }

  // 自定义 open-post：多窗口场景 —— 切到社区并打开帖子详情
  if (kind === 'open-post' && request.postId) {
    switchPanel('community')
    openDetail(request.postId)
  }
}

// 从 request 里解析出一个 File（agent 经 open-file 交来的文件句柄）
async function resolveRequestFile(request) {
  if (request?.handle && typeof request.handle.getFile === 'function') {
    try {
      return await request.handle.getFile()
    } catch (e) {
      console.error('[agent 调用] 读文件句柄失败', e)
    }
  }
  if (request?.file && typeof request.file.arrayBuffer === 'function') return request.file
  if (request?.path) console.warn('[agent 调用] 暂不支持按 path 读文件:', request.path)
  return null
}

// 注册被调用监听（真机生效；开发环境 stub 的 on() 返回 noop，不报错）
if (acdeWindow?.on) {
  acdeWindow.on('request', handleIncomingRequest)
}

// 开发/调试：浏览器控制台里手动模拟 agent 调用，例如：
//   window.__agentCall({ kind: 'analyze-replay' })  —— 需先选好视频
window.__agentCall = handleIncomingRequest

// 选择视频（acdert 用 File System Access API；浏览器降级 input file）
async function pickVideoFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: '视频文件', accept: { 'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.mkv'] } }],
      })
      const file = await handle.getFile()
      await showVideo(file)
    } catch (e) {
      if (e.name !== 'AbortError') console.error('选择视频失败:', e)
    }
  } else {
    fileInput.click()
  }
}

pickBtn.addEventListener('click', pickVideoFile)
fileInput.addEventListener('change', () => showVideo(fileInput.files[0]))

videoArea.addEventListener('dragover', (e) => {
  e.preventDefault()
  videoArea.style.borderColor = 'var(--accent)'
})
videoArea.addEventListener('dragleave', () => {
  videoArea.style.borderColor = 'var(--border)'
})
videoArea.addEventListener('drop', (e) => {
  e.preventDefault()
  videoArea.style.borderColor = 'var(--border)'
  showVideo(e.dataTransfer.files[0])
})

// ===== 复盘建议：按节点渲染（当前为 mock 数据，待接真实分析）=====
// TODO 真实链路：视频 → 系统 AI 分析 → 按节点输出建议；图示区未来画 SVG 战术图。

// 特工图标映射（国服中文名 → 图标文件）
const AGENT_ICONS = {
  捷风: './maps/agents/jett.png',
  芮娜: './maps/agents/reyna.png',
  不死鸟: './maps/agents/phoenix.png',
  贤者: './maps/agents/sage.png',
  猎枭: './maps/agents/sova.png',
  蝰蛇: './maps/agents/viper.png',
  炼狱: './maps/agents/brimstone.png',
  零: './maps/agents/cypher.png',
  幽影: './maps/agents/omen.png',
  雷兹: './maps/agents/raze.png',
  奇乐: './maps/agents/killjoy.png',
  铁臂: './maps/agents/breach.png',
  斯凯: './maps/agents/skye.png',
  夜露: './maps/agents/yoru.png',
  星礈: './maps/agents/astra.png',
  'K/O': './maps/agents/kayo.png',
  尚勃勒: './maps/agents/chamber.png',
  霓虹: './maps/agents/neon.png',
  黑梦: './maps/agents/fade.png',
  哈渤: './maps/agents/harbor.png',
  盖可: './maps/agents/gekko.png',
  钢索: './maps/agents/deadlock.png',
  钛狐: './maps/agents/tejo.png',
  壹决: './maps/agents/iso.png',
  暮蝶: './maps/agents/clove.png',
  幻棱: './maps/agents/waylay.png',
  维斯: './maps/agents/vyse.png',
  迷核: './maps/agents/miks.png',
  赫什: './maps/agents/hush.png',
  禁灭: './maps/agents/veto.png',
}

// 报点 → 坐标映射（亚海悬城 ascent，400x400 坐标系，粗略位置，供 AI 报点转坐标用）
const CALLOUT_MAP = {
  'a点': { x: 95, y: 155 },
  'a大': { x: 88, y: 118 },
  'a小': { x: 70, y: 90 },
  'a后': { x: 60, y: 70 },
  'a厅': { x: 125, y: 100 },
  'a塔': { x: 70, y: 150 },
  'b点': { x: 310, y: 150 },
  'b大': { x: 300, y: 100 },
  'b窗': { x: 335, y: 95 },
  'b厅': { x: 290, y: 130 },
  'b塔': { x: 330, y: 160 },
  '中路': { x: 200, y: 230 },
  '中厅': { x: 200, y: 195 },
  '花园': { x: 185, y: 155 },
  '市场': { x: 250, y: 165 },
}

// 道具类型 → 颜色 + 标签（烟雾/摄像头/炮台/绊线/侦察箭/陷阱）
const UTILITY_STYLES = {
  camera: { color: '#4da3ff', label: '眼' },
  turret: { color: '#ff9f45', label: '炮' },
  wire: { color: '#e8c56b', label: '绊' },
  dart: { color: '#4dd9c9', label: '箭' },
  trap: { color: '#b28dff', label: '雷' },
  smoke: { color: 'rgba(160,160,175,0.5)', label: '烟' },
}

// 把 AI 返回的「报点」或坐标解析成 {x,y}
function resolvePos(pos) {
  if (!pos) return null
  if (typeof pos === 'object' && pos.x != null && pos.y != null) return { x: pos.x, y: pos.y }
  const key = String(pos).trim().toLowerCase()
  return CALLOUT_MAP[key] || null
}

function normalizeAgents(agents) {
  if (!Array.isArray(agents)) return []
  return agents.map((a) => {
    const p = resolvePos(a.pos) || resolvePos(a.callout) || { x: 200, y: 200 }
    return {
      name: a.name || '未知',
      x: a.x != null ? a.x : p.x,
      y: a.y != null ? a.y : p.y,
      team: a.team === 'ally' ? 'ally' : 'enemy',
      skill: a.skill || a.ability || null,
    }
  })
}

function normalizeSmokes(smokes) {
  if (!Array.isArray(smokes)) return []
  return smokes.map((s) => {
    const p = resolvePos(s.pos) || resolvePos(s.callout) || { x: 200, y: 200 }
    return { x: s.x != null ? s.x : p.x, y: s.y != null ? s.y : p.y, radius: s.radius || 26 }
  })
}

function normalizeUtilities(utilities) {
  if (!Array.isArray(utilities)) return []
  return utilities.map((u) => {
    const p = resolvePos(u.pos) || resolvePos(u.callout) || { x: 200, y: 200 }
    return {
      type: u.type || 'trap',
      x: u.x != null ? u.x : p.x,
      y: u.y != null ? u.y : p.y,
      team: u.team === 'ally' ? 'ally' : 'enemy',
    }
  })
}

const mockNodes = [
  {
    time: '00:32',
    title: '残局 1v2 · 守 B 包点',
    advice:
      '敌方已下包，剩余 2 名敌人位置未知。\n\n建议：退回 B 大架枪，等队友回防形成 2 打 2 再进点，不要独自进点清人。\n\n预瞄点：优先架 B 大门口，其次注意 B 窗。',
    preview: { x1: 310, y1: 150, x2: 335, y2: 100 },
    route: { x1: 310, y1: 150, x2: 240, y2: 205 },
    agents: [
      { name: '捷风', x: 310, y: 150, team: 'ally', skill: '冲刺 E' },
      { name: '芮娜', x: 95, y: 150, team: 'enemy', skill: null },
      { name: '猎枭', x: 200, y: 230, team: 'enemy', skill: '侦察箭 C' },
    ],
    smokes: [
      { x: 300, y: 100, radius: 28 },
      { x: 90, y: 120, radius: 24 },
    ],
    utilities: [
      { type: 'camera', x: 335, y: 95, team: 'enemy' },
      { type: 'wire', x: 280, y: 140, team: 'enemy' },
    ],
  },
  {
    time: '01:08',
    title: '经济局 · 起枪选择',
    advice:
      '本回合团队经济约 2300，半起。\n\n建议：起全甲 + 幻影/正义，保留下回合全起的能力；避免裸起大狙导致下回合经济崩盘。',
    preview: null,
    route: null,
    agents: [
      { name: '捷风', x: 200, y: 320, team: 'ally', skill: null },
      { name: '蝰蛇', x: 200, y: 200, team: 'ally', skill: '毒幕 Q' },
      { name: '雷兹', x: 300, y: 100, team: 'enemy', skill: null },
    ],
  },
  {
    time: '02:15',
    title: '进攻 A 点 · 技能配合',
    advice:
      '队友烟已封 A 大，你有两颗闪光。\n\n建议：第一颗闪扔 A 大逼守点，第二颗闪配合进点；进点后优先清 A 后和 heaven。',
    preview: { x1: 90, y1: 120, x2: 95, y2: 150 },
    route: { x1: 90, y1: 120, x2: 95, y2: 150 },
    agents: [
      { name: '不死鸟', x: 90, y: 120, team: 'ally', skill: '闪光 E' },
      { name: '蝰蛇', x: 125, y: 175, team: 'ally', skill: '毒幕 Q' },
      { name: '零', x: 95, y: 155, team: 'enemy', skill: null },
    ],
  },
  {
    time: '03:40',
    title: '残局 1v1 · 保枪决策',
    advice:
      '对方已起长枪，你只剩手枪且血线低。\n\n建议：选择保枪为下回合留经济，比强行对枪更划算；除非对方已下包才考虑冒险。',
    preview: null,
    route: { x1: 200, y1: 230, x2: 200, y2: 320 },
    agents: [
      { name: '幽影', x: 200, y: 230, team: 'ally', skill: null },
      { name: '芮娜', x: 310, y: 150, team: 'enemy', skill: null },
    ],
  },
]

// 实际使用的复盘节点（USE_MOCK 关闭时为空，展示空状态）
let nodes = USE_MOCK ? mockNodes : []

const nodeBar = document.getElementById('nodeBar')
const adviceBox = document.getElementById('adviceBox')
const diagramBox = document.getElementById('diagramBox')

let activeNode = 0

function renderNodes() {
  nodeBar.innerHTML = ''
  if (!nodes.length) {
    adviceBox.innerHTML = '<div class="empty-hint">暂无复盘记录，上传视频开始分析～</div>'
    diagramBox.innerHTML = '<div class="empty-hint">示意图将在这里显示</div>'
    return
  }
  nodes.forEach((node, i) => {
    const btn = document.createElement('button')
    btn.className = 'node-btn' + (i === activeNode ? ' active' : '')
    btn.innerHTML = `<span class="node-time">${node.time}</span>${node.title}`
    btn.addEventListener('click', () => {
      activeNode = i
      renderNodes()
      renderAdvice()
    })
    nodeBar.appendChild(btn)
  })
  renderAdvice()
}

function renderAdvice() {
  const node = nodes[activeNode]
  adviceBox.innerHTML = `
    <div class="advice-node-title">${node.title}<span class="advice-node-time">${node.time}</span></div>
    <div class="advice-text">${node.advice}</div>
  `
  renderDiagram()
}

// 战术图：真实 Ascent 俯视图 + 特工图标 + 技能标注
// 底图来自「瞬投」shuntou.top（国服中文报点）；特工图标来自 valorant-api.com
// 注：acdert 不支持 SVG <image> 加载外部图片，图片改用 HTML <img>，线条用 SVG
function renderDiagram() {
  const node = nodes[activeNode]
  const agents = node.agents || []
  const smokes = node.smokes || []
  const utilities = node.utilities || []

  // 烟雾：半透明圆（SVG，覆盖地图区域，像局内小地图）
  const smokeCircles = smokes
    .map(
      (s) =>
        `<circle cx="${s.x}" cy="${s.y}" r="${s.radius || 26}" fill="rgba(150,150,165,0.45)" stroke="rgba(210,210,220,0.55)" stroke-width="1.5"/>`,
    )
    .join('')

  // 侦察技能：视野范围（摄像头/侦察箭，像局内小地图的侦察圈）
  const reconShapes = utilities
    .filter((u) => u.type === 'camera' || u.type === 'dart')
    .map((u) => {
      const rgb = u.type === 'dart' ? '77,217,201' : '77,163,255'
      return `<circle cx="${u.x}" cy="${u.y}" r="38" fill="rgba(${rgb},0.14)" stroke="rgba(${rgb},0.55)" stroke-width="1.5" stroke-dasharray="4,3"/>`
    })
    .join('')

  // 道具：HTML 绝对定位（彩色圆点 + 中文标签，区分摄像头/炮台/绊线/侦察箭）
  const utilityMarkers = utilities
    .map((u) => {
      const st = UTILITY_STYLES[u.type] || UTILITY_STYLES.trap
      const left = (u.x / 400) * 100 + '%'
      const top = (u.y / 400) * 100 + '%'
      return `
        <div class="utility-marker" style="left:${left}; top:${top};">
          <span class="utility-dot" style="background:${st.color};"></span>
          <span class="utility-label">${st.label}</span>
        </div>`
    })
    .join('')

  // 特工图标：HTML img 绝对定位；用了技能的头像加红框高亮，点击看技能
  const agentMarkers = agents
    .map((a, idx) => {
      const color = a.team === 'ally' ? '#4da3ff' : '#ff4655'
      const icon = AGENT_ICONS[a.name] || ''
      const left = (a.x / 400) * 100 + '%'
      const top = (a.y / 400) * 100 + '%'
      const usedSkill = a.skill ? 'used-skill' : ''
      return `
        <div class="agent-marker" data-i="${idx}" style="left:${left}; top:${top};">
          <img class="agent-icon ${usedSkill}" src="${icon}" alt="${a.name}" style="border-color:${color};">
          <span class="agent-name" style="color:${color};">${a.name}</span>
        </div>`
    })
    .join('')

  const previewLine = node.preview
    ? `<line x1="${node.preview.x1}" y1="${node.preview.y1}" x2="${node.preview.x2}" y2="${node.preview.y2}" stroke="#4da3ff" stroke-width="3" stroke-dasharray="8,6" vector-effect="non-scaling-stroke"/>`
    : ''

  const routePath = node.route
    ? `<path d="M${node.route.x1} ${node.route.y1} L ${node.route.x2} ${node.route.y2}" stroke="#e8c56b" stroke-width="3" fill="none" marker-end="url(#arrow)" vector-effect="non-scaling-stroke"/>`
    : ''

  diagramBox.innerHTML = `
    <div class="diagram-viewport" id="diagramViewport">
      <div class="diagram-canvas" id="diagramCanvas">
        <img class="diagram-map" src="./maps/ascent-cn.png" alt="亚海悬城">
        <svg class="diagram-overlay" viewBox="0 0 400 400" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#e8c56b"/>
            </marker>
          </defs>
          ${smokeCircles}
          ${reconShapes}
          ${previewLine}
          ${routePath}
        </svg>
        ${utilityMarkers}
        ${agentMarkers}
      </div>
    </div>
  `

  // 点击特工头像 → 显示技能 tooltip
  diagramBox.querySelectorAll('.agent-marker').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      const a = agents[Number(el.dataset.i)]
      if (!a) return
      document.querySelectorAll('.agent-tooltip').forEach((t) => t.remove())
      const tip = document.createElement('div')
      tip.className = 'agent-tooltip'
      tip.textContent = a.skill ? `${a.name} 使用技能：${a.skill}` : `${a.name} 未使用技能`
      el.appendChild(tip)
      setTimeout(() => {
        document.addEventListener('click', () => document.querySelectorAll('.agent-tooltip').forEach((t) => t.remove()), { once: true })
      }, 0)
    })
  })

  initDiagramZoom()
}

// —— 地图缩放 + 拖拽平移 ——
let dScale = 1
let dTx = 0
let dTy = 0
let dDragging = false
let dStartX = 0
let dStartY = 0
let dViewport = null
let dCanvas = null

function applyTransform() {
  if (dCanvas) dCanvas.style.transform = `translate(${dTx}px, ${dTy}px) scale(${dScale})`
}

function initDiagramZoom() {
  dViewport = document.getElementById('diagramViewport')
  dCanvas = document.getElementById('diagramCanvas')
  if (!dViewport || !dCanvas) return
  applyTransform()

  // window 级拖拽监听只绑定一次
  if (!initDiagramZoom.bound) {
    initDiagramZoom.bound = true
    window.addEventListener('mousemove', (e) => {
      if (!dDragging) return
      dTx = e.clientX - dStartX
      dTy = e.clientY - dStartY
      applyTransform()
    })
    window.addEventListener('mouseup', () => {
      dDragging = false
      if (dViewport) dViewport.classList.remove('dragging')
    })
  }

  // 滚轮缩放（围绕鼠标位置）
  dViewport.addEventListener('wheel', (e) => {
    e.preventDefault()
    const rect = dViewport.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const newScale = Math.min(Math.max(dScale * factor, 1), 8)
    dTx = mx - (mx - dTx) * (newScale / dScale)
    dTy = my - (my - dTy) * (newScale / dScale)
    dScale = newScale
    applyTransform()
  }, { passive: false })

  // 拖拽平移
  dViewport.addEventListener('mousedown', (e) => {
    dDragging = true
    dStartX = e.clientX - dTx
    dStartY = e.clientY - dTy
    dViewport.classList.add('dragging')
  })

  // 双击重置
  dViewport.addEventListener('dblclick', () => {
    dScale = 1
    dTx = 0
    dTy = 0
    applyTransform()
  })
}

// 页面初始化：直接渲染 mock 节点和示例图（无需先选视频）
renderNodes()

// ===== 社区交流 =====
const POST_TAGS = ['残局', '攻略', '讨论', 'POV', '高光', '求教', '组队']
const MY_AVATAR = './maps/agents/jett.png'

const mockPosts = [
  {
    id: 1,
    ts: 1000,
    isPinned: false,
    author: '夜露本命',
    avatar: './maps/agents/yoru.png',
    time: '2 小时前',
    title: '亚海悬城 B 点残局 1v2 到底该怎么打？',
    content: '每次守 B 点遇到残局就慌，对面下包后我该退 B 大架枪还是进点清人？感觉两种打法都试过但经常输，求大佬指点。',
    tags: ['残局', '求教'],
    likes: 24,
    comments: [
      { author: '猎枭专精', avatar: './maps/agents/sova.png', text: '1v2 别急，先卡时间，等队友回防形成 2v2 再打，千万别一个人进点清人。' },
      { author: '芮娜人柱力', avatar: './maps/agents/reyna.png', text: '有闪就先闪再拉，没闪就架 B 大门口等，包点里有枪线就别硬进。' },
    ],
    liked: false,
  },
  {
    id: 2,
    ts: 2000,
    isPinned: true,
    author: '捷风一绝',
    avatar: './maps/agents/jett.png',
    time: '5 小时前',
    title: '分享几个猎枭 B 点的侦察箭点位',
    content: '整理了三个 B 点的侦察箭点位，开局就能拿到 B 大信息，配合队友反清特别稳。点位图放在下面了。',
    tags: ['攻略', '猎枭'],
    likes: 86,
    comments: [
      { author: '零距离', avatar: './maps/agents/cypher.png', text: '实用，收藏了！第三个点位打排位特别阴。' },
    ],
    liked: true,
  },
  {
    id: 3,
    ts: 3000,
    isPinned: false,
    author: '不死鸟',
    avatar: './maps/agents/phoenix.png',
    time: '8 小时前',
    title: '这版本霓虹是不是被砍废了？',
    content: '更新后感觉霓虹的冲刺后摇变长了，追不上人了，是不是要练别的特工了？',
    tags: ['讨论'],
    likes: 15,
    comments: [],
    liked: false,
  },
  {
    id: 4,
    ts: 4000,
    isPinned: false,
    author: '蝰蛇控',
    avatar: './maps/agents/viper.png',
    time: '昨天',
    title: 'POV：亚海悬城 A 点单人守点五杀',
    content: '这波 A 点 1v5 守点，全靠烟墙分割战场一个个打，分享给大家看看。',
    tags: ['POV', '高光'],
    likes: 132,
    comments: [
      { author: '尚勃勒', avatar: './maps/agents/chamber.png', text: '这烟墙放得太艺术了，直接切开三条枪线。' },
      { author: '星礈', avatar: './maps/agents/astra.png', text: '学废了学废了，我 A 点永远守不住。' },
    ],
    liked: false,
  },
]

let posts = await loadStore('posts', USE_MOCK ? [...mockPosts] : [])
let currentFilter = ''
let currentPostId = null
let selectedTag = ''
let sortMode = 'hot'
const IS_ADMIN = true // 当前用户是否管理员（mock；后续接真实用户/权限系统）

function openModal(id) {
  document.getElementById(id).hidden = false
}
function closeModal(id) {
  document.getElementById(id).hidden = true
}

function renderPosts() {
  const list = document.getElementById('postList')
  const filtered = currentFilter ? posts.filter((p) => p.tags.includes(currentFilter)) : [...posts]
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-hint">暂无帖子，来发第一帖吧～</div>'
    return
  }
  // 置顶帖永远在最前，其余按排序方式排
  const pinned = filtered.filter((p) => p.isPinned)
  const normal = filtered
    .filter((p) => !p.isPinned)
    .sort((a, b) => (sortMode === 'hot' ? b.likes + b.comments.length - (a.likes + a.comments.length) : b.ts - a.ts))
  const ordered = [...pinned, ...normal]
  list.innerHTML = ordered
    .map(
      (post) => `
    <div class="post-card" data-id="${post.id}">
      ${post.isPinned ? `<span class="post-pinned">${icon('pin', 13)} 置顶</span>` : ''}
      <img class="post-avatar" src="${post.avatar}" alt="${post.author}">
      <div class="post-main">
        <div class="post-author">${post.author}<span class="post-time">${post.time}</span></div>
        <div class="post-title">${post.title}</div>
        <div class="post-excerpt">${post.content}</div>
        ${post.images?.length ? `<div class="post-thumbs">${post.images.slice(0, 3).map((u) => `<img class="post-thumb" src="${u}" alt="">`).join('')}${post.images.length > 3 ? `<span class="post-thumb-more">+${post.images.length - 3}</span>` : ''}</div>` : ''}
        ${post.video ? `<div class="post-video-tag">${icon('video', 13)} 视频附件</div>` : ''}
        <div class="post-footer">
          <div class="post-tags">${post.tags.map((t) => `<span class="post-tag">${t}</span>`).join('')}</div>
          <div class="post-actions">
            <button class="action ${post.liked ? 'liked' : ''}" data-action="like" data-id="${post.id}">${icon('heart', 14)} ${post.likes}</button>
            <button class="action" data-action="comment" data-id="${post.id}">${icon('chat', 14)} ${post.comments.length}</button>
          </div>
        </div>
      </div>
    </div>`,
    )
    .join('')

  list.querySelectorAll('.post-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.action')) return
      openDetail(Number(card.dataset.id))
    })
  })
  list.querySelectorAll('[data-action="like"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleLike(Number(btn.dataset.id))
    })
  })
  list.querySelectorAll('[data-action="comment"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      openDetail(Number(btn.dataset.id))
    })
  })
}

function toggleLike(id) {
  const post = posts.find((p) => p.id === id)
  post.liked = !post.liked
  post.likes += post.liked ? 1 : -1
  saveStore('posts', posts)
  renderPosts()
}

function renderTagSelect() {
  const sel = document.getElementById('tagSelect')
  sel.innerHTML = POST_TAGS.map((t) => `<button class="tag-option" data-tag="${t}">${t}</button>`).join('')
  sel.querySelectorAll('.tag-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTag = btn.dataset.tag
      sel.querySelectorAll('.tag-option').forEach((b) => b.classList.toggle('active', b === btn))
    })
  })
}

function renderComments(post) {
  const list = document.getElementById('commentList')
  list.innerHTML = post.comments.length
    ? post.comments
        .map(
          (c) => `
    <div class="comment-item">
      <img class="comment-avatar" src="${c.avatar}" alt="${c.author}">
      <div class="comment-body">
        <div class="comment-author">${c.author}</div>
        <div class="comment-text">${c.text}</div>
      </div>
    </div>`,
        )
        .join('')
    : '<div class="comment-text" style="color:var(--text-dim)">还没有评论，来抢沙发～</div>'
}

function openDetail(id) {
  currentPostId = id
  const post = posts.find((p) => p.id === id)
  if (!post) return
  const pinBtn = IS_ADMIN
    ? `<button class="pin-btn" id="pinBtn">${post.isPinned ? '取消置顶' : `${icon('pin', 13)} 置顶`}</button>`
    : ''
  document.getElementById('detailContent').innerHTML = `
    <div class="detail-title">${post.title}</div>
    <div class="detail-meta">${post.author} · ${post.time} · ${post.tags.map((t) => `#${t}`).join(' ')}</div>
    <div class="detail-actions">${pinBtn}<button class="pin-btn" id="newWindowBtn">${icon('window', 14)} 新窗口打开</button></div>
    ${post.images?.length ? `<div class="detail-images">${post.images.map((u) => `<img class="detail-image" src="${u}" alt="">`).join('')}</div>` : ''}
    ${post.video ? `<div class="detail-video">${icon('video', 14)} 视频附件：${post.video.name}</div>` : ''}
    <div class="detail-content">${post.content}</div>
  `
  document.getElementById('newWindowBtn')?.addEventListener('click', () => {
    openNewWindow({ kind: 'open-post', postId: id }, { parent: acdeWindow?.id, modal: false })
  })
  if (IS_ADMIN) {
    document.getElementById('pinBtn').addEventListener('click', () => {
      post.isPinned = !post.isPinned
      saveStore('posts', posts)
      renderPosts()
      openDetail(id)
    })
  }
  renderComments(post)
  openModal('detailModal')
}

// 标签筛选
document.querySelectorAll('#tagFilter .tag-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.tag
    document.querySelectorAll('#tagFilter .tag-btn').forEach((b) => b.classList.toggle('active', b === btn))
    renderPosts()
  })
})

// 排序切换
document.querySelectorAll('#sortSwitch .sort-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    sortMode = btn.dataset.sort
    document.querySelectorAll('#sortSwitch .sort-btn').forEach((b) => b.classList.toggle('active', b === btn))
    renderPosts()
  })
})

// 发帖媒体：图片/视频草稿
let draftImages = []
let draftVideo = null

function renderDraftMedia() {
  const imgBox = document.getElementById('imagePreviews')
  imgBox.innerHTML = draftImages
    .map((u, i) => `<div class="draft-thumb"><img src="${u}" alt=""><button type="button" class="draft-remove" data-i="${i}" aria-label="移除"></button></div>`)
    .join('')
  imgBox.querySelectorAll('.draft-remove').forEach((b) =>
    b.addEventListener('click', () => {
      draftImages.splice(Number(b.dataset.i), 1)
      renderDraftMedia()
    }),
  )

  const vidBox = document.getElementById('videoPreview')
  if (draftVideo) {
    vidBox.hidden = false
    vidBox.innerHTML = `<span>${icon('video', 14)} ${draftVideo.name}</span><button type="button" class="draft-remove" id="draftRemoveVideo" aria-label="移除"></button>`
    document.getElementById('draftRemoveVideo').addEventListener('click', () => {
      draftVideo = null
      renderDraftMedia()
    })
  } else {
    vidBox.hidden = true
    vidBox.innerHTML = ''
  }
}

document.getElementById('addImageBtn').addEventListener('click', () => document.getElementById('imageInput').click())
document.getElementById('addVideoBtn').addEventListener('click', () => document.getElementById('videoInput').click())

document.getElementById('imageInput').addEventListener('change', async () => {
  const files = [...document.getElementById('imageInput').files]
  for (const f of files) {
    const dataUrl = await new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.readAsDataURL(f)
    })
    draftImages.push(dataUrl)
  }
  document.getElementById('imageInput').value = ''
  renderDraftMedia()
})

document.getElementById('videoInput').addEventListener('change', () => {
  const f = document.getElementById('videoInput').files[0]
  if (!f) return
  draftVideo = { name: f.name, type: f.type || 'video/mp4', url: URL.createObjectURL(f) }
  document.getElementById('videoInput').value = ''
  renderDraftMedia()
})

// 发帖
document.getElementById('newPostBtn').addEventListener('click', () => {
  selectedTag = ''
  draftImages = []
  draftVideo = null
  renderDraftMedia()
  renderTagSelect()
  openModal('postModal')
})

document.getElementById('publishBtn').addEventListener('click', () => {
  const title = document.getElementById('postTitle').value.trim()
  const content = document.getElementById('postContent').value.trim()
  if (!title) {
    alert('请填写标题')
    return
  }
  if (!selectedTag) {
    alert('请选择一个标签')
    return
  }
  posts.unshift({
    id: Date.now(),
    author: profile?.nickname || '我',
    avatar: MY_AVATAR,
    time: '刚刚',
    title,
    content,
    tags: [selectedTag],
    images: [...draftImages],
    video: draftVideo,
    likes: 0,
    comments: [],
    liked: false,
  })
  document.getElementById('postTitle').value = ''
  document.getElementById('postContent').value = ''
  selectedTag = ''
  draftImages = []
  draftVideo = null
  renderDraftMedia()
  renderTagSelect()
  closeModal('postModal')
  saveStore('posts', posts)
  renderPosts()
})

// 评论
document.getElementById('commentBtn').addEventListener('click', () => {
  const text = document.getElementById('commentInput').value.trim()
  if (!text) return
  const post = posts.find((p) => p.id === currentPostId)
  post.comments.push({ author: profile?.nickname || '我', avatar: MY_AVATAR, text })
  document.getElementById('commentInput').value = ''
  saveStore('posts', posts)
  renderComments(post)
  renderPosts()
})

// 弹窗关闭（关闭按钮 + 点击遮罩）
document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close))
})
document.querySelectorAll('.modal-backdrop').forEach((bd) => {
  bd.addEventListener('click', (e) => {
    if (e.target === bd) closeModal(bd.id)
  })
})

// 初始化社区
renderTagSelect()
renderPosts()

// ===== 组队大厅 =====
const FUN_MODES = ['匹配', '死斗', '军备竞赛', '团队死斗', '速战']
const RANK_MODES = ['排位赛', '自定义训练赛']
const RANKS = ['黑铁', '青铜', '白银', '黄金', '铂金', '钻石', '超凡', '神话', '赋能']

const mockLobby = [
  { id: 1, author: '夜露本命', avatar: './maps/agents/yoru.png', time: '3 分钟前', ts: 1000, category: '娱乐', mode: '死斗', rank: null, need: 2, voice: true, roomCode: '8K2FTA', note: '来练枪，会打残局的，晚上开黑' },
  { id: 2, author: '捷风一绝', avatar: './maps/agents/jett.png', time: '15 分钟前', ts: 2000, category: '娱乐', mode: '匹配', rank: null, need: 1, voice: false, roomCode: 'P3Q9XM', note: '娱乐上分，心态好，别压力' },
  { id: 3, author: '不死鸟', avatar: './maps/agents/phoenix.png', time: '40 分钟前', ts: 3000, category: '竞技', mode: '排位赛', rank: '钻石', need: 2, voice: true, roomCode: 'R7WD2C', note: '来大狙和烟位，语音，冲神话' },
  { id: 4, author: '蝰蛇控', avatar: './maps/agents/viper.png', time: '1 小时前', ts: 4000, category: '竞技', mode: '排位赛', rank: '铂金', need: 1, voice: true, roomCode: 'M5H8NV', note: '缺个先锋位，会侦察的来' },
  { id: 5, author: '猎枭专精', avatar: './maps/agents/sova.png', time: '2 小时前', ts: 5000, category: '竞技', mode: '自定义训练赛', rank: null, need: 5, voice: true, roomCode: 'Q2X6LK', note: '约训练赛，练默认战术，来会配合的队伍' },
]

let lobbies = await loadStore('lobbies', USE_MOCK ? [...mockLobby] : [])
let lobbyCat = '娱乐'
let lobbyMode = ''
let lobbyRank = ''
let lobbyNeed = 1

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function copyCode(code, btn) {
  const done = () => {
    btn.textContent = '已复制'
    setTimeout(() => (btn.textContent = '复制'), 1500)
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(done).catch(() => {
      btn.textContent = '手动复制'
    })
  } else {
    btn.textContent = '手动复制'
  }
}

function renderLobby() {
  const list = document.getElementById('lobbyList')
  const filtered = lobbies.filter((l) => l.category === lobbyCat).sort((a, b) => b.ts - a.ts)
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-hint">暂无组队信息，快来发一条吧～</div>'
    return
  }
  list.innerHTML = filtered
    .map(
      (l, i) => `
    <div class="lobby-card">
      <img class="lobby-avatar" src="${l.avatar}" alt="${l.author}">
      <div class="lobby-bubble" style="animation-delay: ${i * 0.06}s">
        <div class="lobby-author">${l.author}<span class="lobby-time">${l.time}</span></div>
        <div class="lobby-badges">
          <span class="badge fun">${icon(l.category === '娱乐' ? 'gamepad' : 'trophy', 13)} ${l.mode}</span>
          ${l.rank ? `<span class="badge rank">${l.rank}</span>` : ''}
          <span class="badge need">缺 ${l.need} 人</span>
          ${l.voice ? `<span class="badge voice">${icon('mic', 13)} 语音</span>` : ''}
        </div>
        <div class="lobby-note">${l.note}</div>
        <div class="lobby-code">
          <span class="code-text">房间码 ${l.roomCode}</span>
          <button class="btn small ghost code-copy" data-code="${l.roomCode}">复制</button>
        </div>
      </div>
    </div>`,
    )
    .join('')

  list.querySelectorAll('.code-copy').forEach((btn) => {
    btn.addEventListener('click', () => copyCode(btn.dataset.code, btn))
  })
}

function renderLobbyMode() {
  const modes = lobbyCat === '娱乐' ? FUN_MODES : RANK_MODES
  const sel = document.getElementById('lobbyModeSelect')
  sel.innerHTML = modes.map((m) => `<button class="mode-option ${m === lobbyMode ? 'active' : ''}" data-mode="${m}">${m}</button>`).join('')
  sel.querySelectorAll('.mode-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      lobbyMode = btn.dataset.mode
      sel.querySelectorAll('.mode-option').forEach((b) => b.classList.toggle('active', b === btn))
      renderLobbyRank()
    })
  })
}

function renderLobbyRank() {
  const show = lobbyCat === '竞技' && lobbyMode === '排位赛'
  document.getElementById('lobbyRankLabel').hidden = !show
  const sel = document.getElementById('lobbyRankSelect')
  sel.hidden = !show
  if (show) {
    sel.innerHTML = RANKS.map((r) => `<button class="rank-option ${r === lobbyRank ? 'active' : ''}" data-rank="${r}">${r}</button>`).join('')
    sel.querySelectorAll('.rank-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        lobbyRank = btn.dataset.rank
        sel.querySelectorAll('.rank-option').forEach((b) => b.classList.toggle('active', b === btn))
      })
    })
  }
}

function renderLobbyNeed() {
  const sel = document.getElementById('lobbyNeed')
  sel.innerHTML = [1, 2, 3, 4].map((n) => `<button class="need-option ${n === lobbyNeed ? 'active' : ''}" data-need="${n}">${n} 人</button>`).join('')
  sel.querySelectorAll('.need-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      lobbyNeed = Number(btn.dataset.need)
      sel.querySelectorAll('.need-option').forEach((b) => b.classList.toggle('active', b === btn))
    })
  })
}

// 分类 tab 切换
document.querySelectorAll('#lobbyTabs .lobby-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    lobbyCat = btn.dataset.cat
    document.querySelectorAll('#lobbyTabs .lobby-tab').forEach((b) => b.classList.toggle('active', b === btn))
    renderLobby()
  })
})

// 弹窗内分类切换
document.querySelectorAll('#lobbyCatSelect .cat-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    lobbyCat = btn.dataset.cat
    lobbyMode = ''
    lobbyRank = ''
    document.querySelectorAll('#lobbyCatSelect .cat-option').forEach((b) => b.classList.toggle('active', b === btn))
    renderLobbyMode()
    renderLobbyRank()
  })
})

// 发组队
document.getElementById('newLobbyBtn').addEventListener('click', () => {
  lobbyCat = '娱乐'
  lobbyMode = ''
  lobbyRank = ''
  lobbyNeed = 1
  document.querySelectorAll('#lobbyCatSelect .cat-option').forEach((b) => b.classList.toggle('active', b.dataset.cat === lobbyCat))
  renderLobbyMode()
  renderLobbyRank()
  renderLobbyNeed()
  openModal('lobbyModal')
})

document.getElementById('lobbyPublishBtn').addEventListener('click', () => {
  if (!lobbyMode) {
    alert('请选择模式')
    return
  }
  if (lobbyCat === '竞技' && lobbyMode === '排位赛' && !lobbyRank) {
    alert('请选择段位要求')
    return
  }
  const note = document.getElementById('lobbyNote').value.trim()
  lobbies.unshift({
    id: Date.now(),
    author: profile?.nickname || '我',
    avatar: MY_AVATAR,
    time: '刚刚',
    ts: Date.now(),
    category: lobbyCat,
    mode: lobbyMode,
    rank: lobbyRank || null,
    need: lobbyNeed,
    voice: true,
    roomCode: genRoomCode(),
    note: note || '一起开黑，心态好',
  })
  document.getElementById('lobbyNote').value = ''
  closeModal('lobbyModal')
  document.querySelectorAll('#lobbyTabs .lobby-tab').forEach((b) => b.classList.toggle('active', b.dataset.cat === lobbyCat))
  saveStore('lobbies', lobbies)
  renderLobby()
})

// 启动游戏按钮（acde:launch）
document.getElementById('launchGameBtn')?.addEventListener('click', launchGame)

// 初始化组队大厅
renderLobby()

// ===== 个人中心 =====
let profile = await loadStore('profile', null) // null = 未登录
let replays = await loadStore('replays', [])
let userProfile = await loadStore('user_profile', null) // 能力+习惯画像

function renderProfile() {
  const auth = document.getElementById('profileAuth')
  const main = document.getElementById('profileMain')
  if (!profile) {
    auth.hidden = false
    main.hidden = true
    return
  }
  auth.hidden = true
  main.hidden = false
  document.getElementById('profileAvatar').src = profile.avatar || MY_AVATAR
  document.getElementById('profileName').textContent = profile.nickname
  document.getElementById('profileRank').textContent = profile.rank ? `${profile.rank}段位` : '未设置段位'
  document.getElementById('profileAgents').innerHTML = (profile.agents || [])
    .map((a) => `<span class="profile-agent-tag">${a}</span>`)
    .join('')
  document.getElementById('profileBio').textContent = profile.bio || '这个人很懒，什么都没写～'

  renderProfileCards()

  document.querySelectorAll('[data-action="open-card"]').forEach((btn) => {
    btn.addEventListener('click', () => openCard(btn.dataset.card))
  })
}

// 六边形雷达图（能力画像）
function radarChart(values) {
  const keys = ['枪法', '反应', '道具使用', '残局处理', '经济管理', '地图理解']
  const n = keys.length
  const cx = 75
  const cy = 72
  const r = 54
  const pt = (i, rad) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]
  }
  const ring = (rad) => keys.map((_, i) => pt(i, rad).map((v) => v.toFixed(1)).join(',')).join(' ')
  const data = keys.map((k, i) => pt(i, ((values[k] || 0) / 5) * r).map((v) => v.toFixed(1)).join(',')).join(' ')
  const spokes = keys
    .map((_, i) => {
      const [x, y] = pt(i, r)
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`
    })
    .join('')
  const labels = keys
    .map((k, i) => {
      const [x, y] = pt(i, r + 18)
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--text-dim)">${k}</text>`
    })
    .join('')
  return `<svg viewBox="0 0 150 150" width="150" height="150">
    <polygon points="${ring(r)}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    <polygon points="${ring(r * 0.66)}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <polygon points="${ring(r * 0.33)}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    ${spokes}
    <polygon points="${data}" fill="rgba(255,70,85,0.28)" stroke="#ff4655" stroke-width="1.5"/>
    ${labels}
  </svg>`
}

// 渲染四个卡片（透明 + 翻转）
function renderProfileCards() {
  const gameBox = document.getElementById('cardGame')
  if (userProfile?.gameCount) {
    const abs = {}
    for (const [k, arr] of Object.entries(userProfile.abilities || {})) {
      if (arr.length) abs[k] = arr.reduce((s, v) => s + v, 0) / arr.length
    }
    gameBox.innerHTML = radarChart(abs)
  } else {
    gameBox.innerHTML = '<div class="card-empty">还没生成画像</div>'
  }

  const replayBox = document.getElementById('cardReplay')
  if (replays.length) {
    const r = replays[replays.length - 1]
    replayBox.innerHTML = `<div class="card-cover"><div class="cover-badge">POV</div><div class="cover-title">${r.title}</div><div class="cover-meta">${r.time}</div></div>`
  } else {
    replayBox.innerHTML = '<div class="card-empty">还没有复盘记录</div>'
  }

  const postBox = document.getElementById('cardPost')
  const myPosts = posts.filter((p) => p.author === profile.nickname)
  if (myPosts.length) {
    const p = myPosts[0]
    postBox.innerHTML = `<div class="card-item-title">${p.title}</div><div class="card-item-meta">${p.time} · ${p.likes} 赞 · ${p.comments.length} 评论</div>`
  } else {
    postBox.innerHTML = '<div class="card-empty">还没有发过帖子</div>'
  }

  const lobbyBox = document.getElementById('cardLobby')
  const myLobbies = lobbies.filter((l) => l.author === profile.nickname)
  if (myLobbies.length) {
    const l = myLobbies[0]
    lobbyBox.innerHTML = `<div class="card-item-title">${l.mode}${l.rank ? ' · ' + l.rank : ''}</div><div class="card-item-meta">${l.time} · 缺 ${l.need} 人</div>`
  } else {
    lobbyBox.innerHTML = '<div class="card-empty">还没有发布组队</div>'
  }
}

function openCard(card) {
  if (card === 'game') {
    openGameDetail()
  } else if (card === 'replay') {
    if (replays.length) viewReplay(replays[replays.length - 1].id)
  } else if (card === 'post') {
    const myPosts = posts.filter((p) => p.author === profile.nickname)
    if (myPosts.length) openDetail(myPosts[0].id)
  } else if (card === 'lobby') {
    navigateTo('team', true)
  }
}

// 画像详情弹窗：雷达图 + 能力条形 + 习惯
function openGameDetail() {
  if (!userProfile?.gameCount) {
    alert('还没有画像数据，去复盘几局吧')
    return
  }
  const abs = userProfile.abilities || {}
  const abilityRows = Object.keys(abs)
    .map((k) => {
      const arr = abs[k] || []
      const avg = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
      return `<div class="ability-row"><span class="ability-name">${k}</span><div class="ability-bar"><div class="ability-fill" style="width:${(avg / 5) * 100}%"></div></div><span class="ability-val">${avg.toFixed(1)}</span></div>`
    })
    .join('')
  const avgObj = {}
  for (const [k, arr] of Object.entries(abs)) if (arr.length) avgObj[k] = arr.reduce((s, v) => s + v, 0) / arr.length
  const habits = Object.entries(userProfile.habits || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  document.getElementById('gameDetail').innerHTML = `
    <div class="game-detail-head">
      <div class="game-detail-radar">${radarChart(avgObj)}</div>
      <div class="game-detail-info">
        <div class="game-detail-title">我的游戏画像</div>
        <div class="game-detail-sub">已复盘 ${userProfile.gameCount} 局 · 同段位基准（3 = 段位平均）</div>
      </div>
    </div>
    <div class="comments-title">能力评估</div>
    ${abilityRows}
    <div class="comments-title">习惯标签</div>
    <div class="profile-game-habits">${habits.length ? habits.map(([h, n]) => `<span class="habit-tag">${h} · ${n} 次</span>`).join('') : '<span class="card-empty">暂无习惯标签</span>'}</div>
  `
  openModal('gameProfileModal')
}

function viewReplay(id) {
  const r = replays.find((x) => x.id === id)
  if (!r) return
  navigateTo('review', true)
  applyAiNodes(r.nodes)
}

function saveReplay(nodes) {
  replays.push({
    id: Date.now(),
    time: new Date().toLocaleString(),
    title: currentVideoName || '未命名复盘',
    nodes,
  })
  saveStore('replays', replays)
}

// 登录：本地昵称（微信/QQ OAuth 占位）
document.getElementById('localLoginBtn').addEventListener('click', () => {
  const nickname = document.getElementById('localNickname').value.trim()
  if (!nickname) {
    alert('请输入昵称')
    return
  }
  profile = { nickname, avatar: MY_AVATAR, rank: null, agents: [], bio: '' }
  saveStore('profile', profile)
  renderProfile()
})
document.getElementById('wxLoginBtn').addEventListener('click', () => alert('微信登录暂未接入（待配置 AppID）'))
document.getElementById('qqLoginBtn').addEventListener('click', () => alert('QQ 登录暂未接入（待配置 AppID）'))

// 编辑资料
let editAvatar = null
let editRank = null
let editAgents = []

document.getElementById('editProfileBtn').addEventListener('click', () => {
  editAvatar = profile.avatar
  editRank = profile.rank
  editAgents = [...(profile.agents || [])]
  document.getElementById('editNickname').value = profile.nickname
  document.getElementById('editBio').value = profile.bio || ''
  renderAvatarPicker()
  renderEditRank()
  renderAgentPicker()
  openModal('editProfileModal')
})

function renderAvatarPicker() {
  const box = document.getElementById('avatarPicker')
  box.innerHTML = Object.entries(AGENT_ICONS)
    .map(([name, icon]) => `<img class="avatar-option ${icon === editAvatar ? 'active' : ''}" src="${icon}" alt="${name}" data-icon="${icon}">`)
    .join('')
  box.querySelectorAll('.avatar-option').forEach((img) =>
    img.addEventListener('click', () => {
      editAvatar = img.dataset.icon
      box.querySelectorAll('.avatar-option').forEach((i) => i.classList.toggle('active', i.dataset.icon === editAvatar))
    }),
  )
}

function renderEditRank() {
  const box = document.getElementById('editRankSelect')
  box.innerHTML = RANKS.map((r) => `<button class="rank-option ${r === editRank ? 'active' : ''}" data-rank="${r}">${r}</button>`).join('')
  box.querySelectorAll('.rank-option').forEach((b) =>
    b.addEventListener('click', () => {
      editRank = b.dataset.rank
      box.querySelectorAll('.rank-option').forEach((x) => x.classList.toggle('active', x === b))
    }),
  )
}

function renderAgentPicker() {
  const box = document.getElementById('agentPicker')
  box.innerHTML = Object.keys(AGENT_ICONS)
    .map((name) => `<img class="avatar-option agent-option ${editAgents.includes(name) ? 'active' : ''}" src="${AGENT_ICONS[name]}" alt="${name}" data-agent="${name}">`)
    .join('')
  box.querySelectorAll('.agent-option').forEach((img) =>
    img.addEventListener('click', () => {
      const name = img.dataset.agent
      if (editAgents.includes(name)) {
        editAgents = editAgents.filter((a) => a !== name)
      } else {
        if (editAgents.length >= 3) {
          alert('最多选 3 个常玩特工')
          return
        }
        editAgents.push(name)
      }
      box.querySelectorAll('.agent-option').forEach((i) => i.classList.toggle('active', editAgents.includes(i.dataset.agent)))
    }),
  )
}

document.getElementById('saveProfileBtn').addEventListener('click', () => {
  const nickname = document.getElementById('editNickname').value.trim()
  if (!nickname) {
    alert('请输入昵称')
    return
  }
  profile.nickname = nickname
  profile.avatar = editAvatar
  profile.rank = editRank
  profile.agents = editAgents
  profile.bio = document.getElementById('editBio').value.trim()
  saveStore('profile', profile)
  closeModal('editProfileModal')
  renderProfile()
})

renderProfile()

// ===== 无畏赛事 =====
const mockMatches = [
  {
    id: 1,
    title: 'VCT 大师赛 · EDG vs FPX',
    date: '2026-11-10',
    score: '2 : 1',
    nodes: [
      { time: '00:12', title: '手枪局 A 点速攻', advice: 'EDG 手枪局选择 A 点速攻，ZmjjKK 捷风抢点拿下首杀，奠定开局优势。' },
      { time: '04:35', title: 'ZmjjKK 残局 1v2', advice: '残局 1v2 靠枪线拉扯，先处理 B 窗再回架 B 大，完成翻盘。' },
      { time: '09:20', title: '经济局翻盘', advice: 'FPX 半起局靠 Berlin 烟墙分割战场，逐个击破，打出经济差。' },
    ],
    participants: [
      { id: 101, name: 'ZmjjKK', team: 'EDG', role: '选手', position: '决斗位', agent: '捷风' },
      { id: 102, name: 'CHICHOO', team: 'EDG', role: '选手', position: '先锋位', agent: '猎枭' },
      { id: 103, name: 'Smoggy', team: 'EDG', role: '选手', position: '控场位', agent: '蝰蛇' },
      { id: 104, name: 'nobody', team: 'EDG', role: '选手', position: '哨卫位', agent: '零' },
      { id: 105, name: 'EDG 教练', team: 'EDG', role: '教练', position: null, agent: null },
      { id: 106, name: 'Autumn', team: 'FPX', role: '选手', position: '决斗位', agent: '捷风' },
      { id: 107, name: 'Berlin', team: 'FPX', role: '选手', position: '控场位', agent: '蝰蛇' },
      { id: 108, name: 'FPX 教练', team: 'FPX', role: '教练', position: null, agent: null },
    ],
  },
  {
    id: 2,
    title: 'VCT 冠军赛 · TE vs BLG',
    date: '2026-11-08',
    score: '2 : 0',
    nodes: [
      { time: '03:10', title: '防守站位失误', advice: 'TE 在 A 点防守站位重叠，被 BLG 一颗闪打穿，丢关键分。' },
      { time: '07:45', title: 'C 点快攻战术', advice: 'BLG C 点快攻配合双烟，节奏极快，TE 回防不及。' },
    ],
    participants: [
      { id: 201, name: 'FengF', team: 'TE', role: '选手', position: '决斗位', agent: '捷风' },
      { id: 202, name: 'LuoK1ng', team: 'TE', role: '选手', position: '先锋位', agent: '猎枭' },
      { id: 203, name: 'Biank', team: 'TE', role: '选手', position: '控场位', agent: '蝰蛇' },
      { id: 204, name: 'TE 教练', team: 'TE', role: '教练', position: null, agent: null },
      { id: 205, name: 'whz', team: 'BLG', role: '选手', position: '决斗位', agent: '芮娜' },
      { id: 206, name: 'BLG 教练', team: 'BLG', role: '教练', position: null, agent: null },
    ],
  },
]

const mockMatchRatings = [
  { matchId: 1, personId: 101, author: '夜露本命', score: 5, comment: '这场捷风枪法离谱，残局真神' },
  { matchId: 1, personId: 101, author: '芮娜人柱力', score: 4, comment: '这场决斗打得挺好' },
  { matchId: 1, personId: 105, author: '猎枭专精', score: 4, comment: '教练战术布置到位' },
]

let matchRatings = await loadStore('match_ratings', USE_MOCK ? [...mockMatchRatings] : [])
let currentMatchId = null
let myScore = 0

function starSvg(filled) {
  return `<svg viewBox="0 0 24 24" width="16" height="16" ${filled ? 'fill="var(--gold)"' : 'fill="none" stroke="var(--gold)" stroke-width="2"'} stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
}

function scoreStars(score) {
  if (score == null) return '<span class="no-score">暂无评分</span>'
  const full = Math.round(score)
  return `${score.toFixed(1)} ${[1, 2, 3, 4, 5].map((n) => starSvg(n <= full)).join('')}`
}

function personAvg(matchId, personId) {
  const rs = matchRatings.filter((r) => r.matchId === matchId && r.personId === personId)
  if (!rs.length) return null
  return rs.reduce((s, r) => s + r.score, 0) / rs.length
}

function renderMatches() {
  const list = document.getElementById('matchList')
  list.innerHTML = mockMatches
    .map((m) => {
      const rated = matchRatings.filter((r) => r.matchId === m.id).length
      return `
    <div class="match-card">
      <div class="match-main">
        <div class="match-title">${m.title}</div>
        <div class="match-meta">${m.date} · 比分 ${m.score} · ${m.participants.length} 人可评 · ${rated} 条评分</div>
      </div>
      <button class="btn ghost small" data-action="open-match" data-id="${m.id}">赛后评分</button>
      <button class="btn ghost small" data-action="view-match" data-id="${m.id}">复盘</button>
    </div>`
    })
    .join('')
  list.querySelectorAll('[data-action="open-match"]').forEach((b) =>
    b.addEventListener('click', () => openMatch(Number(b.dataset.id))),
  )
  list.querySelectorAll('[data-action="view-match"]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = mockMatches.find((x) => x.id === Number(b.dataset.id))
      if (!m) return
      navigateTo('review', true)
      applyAiNodes(m.nodes)
    }),
  )
}

function openMatch(id) {
  currentMatchId = id
  const m = mockMatches.find((x) => x.id === id)
  if (!m) return
  document.getElementById('matchDetail').innerHTML = `
    <div class="match-detail-head">
      <div class="match-detail-title">${m.title}</div>
      <div class="match-detail-meta">${m.date} · 比分 ${m.score}</div>
    </div>
    <div class="match-participants">
      ${m.participants
        .map((p) => {
          const icon = p.agent ? AGENT_ICONS[p.agent] : './maps/agents/brimstone.png'
          const avg = personAvg(id, p.id)
          const roleTag = p.role === '教练' ? '<span class="role-tag coach">教练</span>' : `<span class="role-tag">${p.position || p.role}</span>`
          return `
        <div class="participant-row" data-action="rate-person" data-id="${p.id}">
          <img class="participant-avatar" src="${icon}" alt="${p.name}">
          <div class="participant-main">
            <div class="participant-name">${p.name}<span class="participant-team">${p.team}</span>${roleTag}</div>
            <div class="participant-score">${scoreStars(avg)}</div>
          </div>
          <button class="btn ghost small">评分</button>
        </div>`
        })
        .join('')}
    </div>
  `
  document.getElementById('matchDetail').querySelectorAll('[data-action="rate-person"]').forEach((el) =>
    el.addEventListener('click', () => openPerson(id, Number(el.dataset.id))),
  )
  openModal('matchModal')
}

function renderPersonComments(matchId, personId) {
  const list = document.getElementById('playerCommentList')
  const rs = matchRatings.filter((r) => r.matchId === matchId && r.personId === personId)
  list.innerHTML = rs.length
    ? rs
        .map(
          (r) => `
    <div class="comment-item">
      <img class="comment-avatar" src="${r.avatar || MY_AVATAR}" alt="${r.author}">
      <div class="comment-body">
        <div class="comment-author">${r.author} <span class="comment-score">${scoreStars(r.score)}</span></div>
        <div class="comment-text">${r.comment}</div>
      </div>
    </div>`,
        )
        .join('')
    : '<div class="comment-empty">等待你的评价</div>'
}

function openPerson(matchId, personId) {
  currentMatchId = matchId
  const m = mockMatches.find((x) => x.id === matchId)
  const p = m?.participants.find((x) => x.id === personId)
  if (!p) return
  const myRating = matchRatings.find(
    (r) => r.matchId === matchId && r.personId === personId && r.author === (profile?.nickname || '我'),
  )
  myScore = myRating?.score || 0
  const icon = p.agent ? AGENT_ICONS[p.agent] : './maps/agents/brimstone.png'
  document.getElementById('playerDetail').innerHTML = `
    <div class="player-detail-head">
      <img class="player-detail-avatar" src="${icon}" alt="${p.name}">
      <div>
        <div class="player-detail-name">${p.name}</div>
        <div class="player-detail-meta">${p.team} · ${p.role === '教练' ? '教练' : p.position} · ${m.title}</div>
        <div class="player-detail-score"><span class="score-label">平均分</span>${scoreStars(personAvg(matchId, personId))}<span class="score-count">（${matchRatings.filter((r) => r.matchId === matchId && r.personId === personId).length} 人评分）</span></div>
      </div>
    </div>
    <div class="player-rate-row">
      <span class="player-rate-label">这局表现：</span>
      <span class="star-input" id="starInput">${[1, 2, 3, 4, 5].map((n) => `<span class="star" data-n="${n}">${starSvg(n <= myScore)}</span>`).join('')}</span>
    </div>
    <div class="player-comments">
      <div class="comments-title">大家的评价</div>
      <div class="comment-list" id="playerCommentList"></div>
      <div class="comment-input-row">
        <input class="comment-input" id="playerCommentInput" placeholder="评价这局表现..." />
        <button class="btn primary" id="playerCommentBtn">评价</button>
      </div>
    </div>
  `

  document.querySelectorAll('#starInput .star').forEach((s) =>
    s.addEventListener('click', () => {
      myScore = Number(s.dataset.n)
      document.querySelectorAll('#starInput .star').forEach((el, i) => {
        el.innerHTML = starSvg(i + 1 <= myScore)
      })
    }),
  )

  renderPersonComments(matchId, personId)

  document.getElementById('playerCommentBtn').addEventListener('click', () => {
    const text = document.getElementById('playerCommentInput').value.trim()
    if (!myScore) {
      alert('请先点星星打分')
      return
    }
    if (!text) {
      alert('请输入评价内容')
      return
    }
    const author = profile?.nickname || '我'
    const idx = matchRatings.findIndex((r) => r.matchId === matchId && r.personId === personId && r.author === author)
    const entry = { matchId, personId, author, avatar: profile?.avatar || MY_AVATAR, score: myScore, comment: text }
    if (idx >= 0) matchRatings[idx] = entry
    else matchRatings.push(entry)
    saveStore('match_ratings', matchRatings)
    openPerson(matchId, personId)
  })

  openModal('playerModal')
}

renderMatches()

// ===== 教学板块 =====
const mockTutorials = [
  { id: 1, level: '基础', category: '射击', title: '急停与基础射击', duration: '08:30', desc: '学会急停，枪法稳定的第一步' },
  { id: 2, level: '基础', category: '预瞄', title: '基础预瞄点与准星摆放', duration: '06:15', desc: '把准星放在该放的位置' },
  { id: 3, level: '基础', category: '走路', title: '基础身法与静步', duration: '05:40', desc: '何时该跑、何时该静步' },
  { id: 4, level: '基础', category: '思路', title: '新手开局思路', duration: '09:00', desc: '开局该做什么、怎么站位' },
  { id: 5, level: '进阶', category: '射击', title: '扫射转移与爆头线', duration: '11:20', desc: '提升对枪胜率的关键' },
  { id: 6, level: '进阶', category: '预瞄', title: '进阶预瞄细节', duration: '08:50', desc: '预瞄角度与出手时机' },
  { id: 7, level: '进阶', category: '战术', title: '默认战术配合', duration: '14:30', desc: '进攻默认展开与分工' },
  { id: 8, level: '进阶', category: '思路', title: '转点与信息处理', duration: '12:00', desc: '根据信息做正确决策' },
  { id: 9, level: '顶分', category: '预瞄', title: '顶级预瞄细节', duration: '10:10', desc: '顶分选手的预瞄习惯' },
  { id: 10, level: '顶分', category: '战术', title: '顶级战术套路', duration: '18:00', desc: '职业级战术拆解' },
  { id: 11, level: '顶分', category: '思路', title: '残局决策思路', duration: '13:40', desc: '顶分残局怎么想' },
  { id: 12, level: '顶分', category: '走路', title: '顶级身法技巧', duration: '09:30', desc: '跳跃与 peek 技巧' },
  { id: 13, level: '基础', category: '特工', title: '捷风入门：怎么玩好捷风', duration: '10:20', desc: '冲刺、烟、大招的用法' },
  { id: 14, level: '基础', category: '特工', title: '贤者入门：奶妈位怎么打', duration: '09:10', desc: '墙、球、复活时机' },
  { id: 15, level: '进阶', category: '特工', title: '蝰蛇烟位进阶', duration: '13:00', desc: '毒幕与毒球的地图理解' },
  { id: 16, level: '进阶', category: '特工', title: '猎枭信息位', duration: '11:40', desc: '侦察箭点位与节奏' },
  { id: 17, level: '顶分', category: '特工', title: '捷风顶分细节', duration: '15:20', desc: '顶分捷风的进场与撤退' },
  { id: 18, level: '顶分', category: '特工', title: '蝰蛇顶分思路', duration: '16:10', desc: '顶分蝰蛇的控图思路' },
]

let currentTutorialLevel = '基础'

function renderTutorials() {
  const list = document.getElementById('tutorialList')
  const items = mockTutorials.filter((t) => t.level === currentTutorialLevel)
  list.innerHTML = items.length
    ? items
        .map(
          (t) => `
    <div class="tutorial-card">
      <div class="tutorial-main">
        <div class="tutorial-title">${t.title}</div>
        <div class="tutorial-meta">${t.duration} · ${t.desc}</div>
      </div>
      <span class="tutorial-category">${t.category}</span>
    </div>`,
        )
        .join('')
    : '<div class="empty-hint">该层级暂无教学视频</div>'
}

document.querySelectorAll('.tutorial-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentTutorialLevel = btn.dataset.level
    document.querySelectorAll('.tutorial-tab').forEach((b) => b.classList.toggle('active', b === btn))
    renderTutorials()
  })
})

renderTutorials()

// 应用初始化完成：处理启动时暂存的 agent 请求（多窗口 open 时请求会早于数据加载到达）
appReady = true
if (pendingRequest) {
  processRequest(pendingRequest)
  pendingRequest = null
}
