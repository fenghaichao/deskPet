'use strict'

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, Notification } = require('electron')
const path = require('path')
const { Store } = require('./store')
const { TimerEngine } = require('./timer')
const { placePanel } = require('./placement')
const { IHG, weekKey, ihgQuota } = require('./gripSchedule')

const isDev = process.argv.includes('--dev')
const PET_W = 360
const PET_H = 440
const PET_GROUND_Y = 400
const PANEL_W = 780
const PANEL_H = 620

let petWin = null
let panelWin = null
let tray = null
let store = null
let timer = null
let drag = null
let petHover = false
let lastPomoState = null
let lastGripState = null
let lastAutoPanelPos = null // 程序自动摆放的坐标，用来区分「用户拖动」
let savePanelPosTimer = null
let breathCueSet = 0 // 降压模式里「别憋气」提示，每组只提一次

// ---------- single instance ----------
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showPet()
    showPanel()
  })
}

// ---------- helpers ----------
function notify(body, title = 'Mochi') {
  if (!store || !store.get('ui.sound')) return
  try {
    const n = new Notification({ title, body })
    n.show()
  } catch (e) {
    console.error('[notify]', e)
  }
}

function buildTrayMenu() {
  const pomo = timer ? timer.getPomodoroState() : { active: false, paused: false }
  return Menu.buildFromTemplate([
    { label: `${store ? store.get('pet.name') : 'Mochi'} 菜单`, enabled: false },
    { type: 'separator' },
    {
      label: petWin && petWin.isVisible() ? '隐藏宠物' : '显示宠物',
      click: togglePet
    },
    { label: '控制面板', click: showPanel },
    { type: 'separator' },
    {
      label: pomo.active
        ? (pomo.paused ? '▶ 继续番茄钟' : '⏸ 暂停番茄钟')
        : '▶ 开始番茄钟',
      click: () => {
        if (!timer) return
        if (pomo.active) {
          if (pomo.paused) timer.resumePomodoro()
          else timer.pausePomodoro()
        } else {
          const opts = store.get('pomodoro')
          timer.startPomodoro(opts)
        }
        refreshTray()
      }
    },
    {
      label: '⏹ 停止番茄钟',
      enabled: pomo.active,
      click: () => {
        if (timer) timer.stopPomodoro()
        refreshTray()
      }
    },
    { type: 'separator' },
    { label: '📌 贴到任务栏', click: snapToBottom },
    {
      label: '⚙ 开机自启',
      type: 'checkbox',
      checked: store ? store.get('ui.autoLaunch') : false,
      click: toggleAutoLaunch
    },
    { type: 'separator' },
    { label: '❌ 退出', click: quitApp }
  ])
}

function refreshTray() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu())
}

// ---------- drag ----------
function startDrag() {
  if (!petWin || petWin.isDestroyed()) return
  const c = screen.getCursorScreenPoint()
  const [wx, wy] = petWin.getPosition()
  drag = { cx: c.x, cy: c.y, wx, wy, timer: setInterval(tickDrag, 16), moved: false, lastX: wx, lastY: wy }
  petWin.setIgnoreMouseEvents(false)
  if (petWin.webContents && !petWin.webContents.isDestroyed()) petWin.webContents.send('pet:drag', true)
}

function tickDrag() {
  if (!drag || !petWin) return
  const c = screen.getCursorScreenPoint()
  const nx = Math.round(drag.wx + (c.x - drag.cx))
  const ny = Math.round(drag.wy + (c.y - drag.cy))
  if (nx !== drag.lastX || ny !== drag.lastY) {
    drag.moved = true
    drag.lastX = nx
    drag.lastY = ny
    petWin.setPosition(nx, ny)
  }
}

function stopDrag() {
  if (!drag) return
  clearInterval(drag.timer)
  const moved = drag.moved
  drag = null
  const pos = clampAndSnap()
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:drag', false)
    petWin.webContents.send('pet:dropped', { moved, ...pos })
    petWin.setIgnoreMouseEvents(!petHover, { forward: true })
  }
  if (store) {
    store.set('pet.x', Math.round(pos.x))
    store.set('pet.y', Math.round(pos.y))
  }
}

function clampAndSnap() {
  if (!petWin || petWin.isDestroyed()) return { x: 0, y: 0, snapped: false }
  const [wx, wy] = petWin.getPosition()
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const wa = disp.workArea
  const W = petWin.getBounds().width
  let x = Math.min(Math.max(wx, wa.x - W + 80), wa.x + wa.width - 80)
  let y = Math.min(Math.max(wy, wa.y - 40), wa.y + wa.height - 40)
  let snapped = false
  const bottom = y + PET_GROUND_Y
  const waBottom = wa.y + wa.height
  if (Math.abs(bottom - waBottom) < 80) {
    y = waBottom - PET_GROUND_Y
    snapped = true
  }
  x = Math.round(x)
  y = Math.round(y)
  petWin.setPosition(x, y)
  return { x, y, snapped }
}

// ---------- windows ----------
function createPetWindow() {
  const cfg = store ? store.get('pet') : { x: null, y: null }
  const { workArea } = screen.getPrimaryDisplay()
  let x = typeof cfg.x === 'number' ? cfg.x : null
  let y = typeof cfg.y === 'number' ? cfg.y : null
  if (x == null || y == null || !isOnScreen(x, y)) {
    x = Math.round(workArea.x + workArea.width - PET_W - 80)
    y = Math.round(workArea.y + workArea.height - PET_GROUND_Y)
  }

  petWin = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  petWin.setAlwaysOnTop(true, 'floating')
  petWin.setIgnoreMouseEvents(true, { forward: true })
  petWin.loadFile(path.join(__dirname, 'pet', 'index.html'))

  petWin.once('ready-to-show', () => {
    petWin.showInactive()
    if (store) petWin.webContents.send('config:init', store.get())
    // 同步当前计时器状态
    if (timer) {
      const ps = timer.getPomodoroState()
      if (ps.active) petWin.webContents.send('timer:pomo-state', ps)
      const gs = timer.getGripState()
      if (gs.active) petWin.webContents.send('timer:grip-state', gs)
    }
  })

  petWin.webContents.on('did-finish-load', () => {
    if (store) petWin.webContents.send('config:init', store.get())
  })

  petWin.on('closed', () => { petWin = null })
}

function createPanelWindow() {
  panelWin = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    frame: false,
    transparent: false,
    show: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  panelWin.loadFile(path.join(__dirname, 'panel', 'index.html'))

  panelWin.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault()
      panelWin.hide()
    }
  })

  panelWin.on('closed', () => { panelWin = null })

  panelWin.on('moved', () => rememberPanelPos())
  panelWin.on('resized', () => rememberPanelPos())

  panelWin.webContents.on('did-finish-load', () => {
    if (store) panelWin.webContents.send('config:init', store.get())
    if (timer) {
      const ps = timer.getPomodoroState()
      if (ps.active) panelWin.webContents.send('timer:pomo-state', ps)
      const gs = timer.getGripState()
      if (gs.active) panelWin.webContents.send('timer:grip-state', gs)
    }
  })
}

function isOnScreen(x, y) {
  const displays = screen.getAllDisplays()
  for (const d of displays) {
    const wa = d.workArea
    if (x >= wa.x - 200 && x <= wa.x + wa.width + 200 && y >= wa.y - 200 && y <= wa.y + wa.height + 200) return true
  }
  return false
}

function showPet() {
  if (!petWin || petWin.isDestroyed()) {
    createPetWindow()
  }
  petWin.showInactive()
  petWin.setAlwaysOnTop(true, 'floating')
}

function togglePet() {
  if (!petWin || petWin.isDestroyed()) { showPet(); return }
  if (petWin.isVisible()) petWin.hide()
  else petWin.showInactive()
}

function isFullyOnScreen(x, y, w, h) {
  const displays = screen.getAllDisplays()
  for (const d of displays) {
    const wa = d.workArea
    if (x >= wa.x - 1 && y >= wa.y - 1 && x + w <= wa.x + wa.width + 1 && y + h <= wa.y + wa.height + 1) return true
  }
  return false
}

function showPanel() {
  if (!panelWin || panelWin.isDestroyed()) createPanelWindow()
  panelWin.show()
  panelWin.focus()
  if (!petWin || petWin.isDestroyed()) return

  const [px, py] = petWin.getPosition()
  const [petW, petH] = petWin.getSize()
  // 用窗口实际尺寸而不是常量：面板可以缩放，写死的 PANEL_H 会算错
  const [panelW, panelH] = panelWin.getSize()
  const wa = screen.getDisplayNearestPoint({ x: px, y: py }).workArea

  const sx = store ? store.get('panel.x') : null
  const sy = store ? store.get('panel.y') : null
  const savedUsable =
    Number.isFinite(sx) && Number.isFinite(sy) && isFullyOnScreen(sx, sy, panelW, panelH)

  const pos = savedUsable
    ? { x: Math.round(sx), y: Math.round(sy) }
    : placePanel({
        wa,
        pet: { x: px, y: py, w: petW, h: petH },
        panel: { w: panelW, h: panelH }
      })

  lastAutoPanelPos = pos
  panelWin.setPosition(pos.x, pos.y)
}

// 用户手动拖动/缩放过的面板位置要记住，别让下一次右键又把它弹走
function rememberPanelPos() {
  if (!store) return
  clearTimeout(savePanelPosTimer)
  savePanelPosTimer = setTimeout(() => {
    if (!panelWin || panelWin.isDestroyed()) return
    const [x, y] = panelWin.getPosition()
    if (lastAutoPanelPos && Math.abs(x - lastAutoPanelPos.x) < 2 && Math.abs(y - lastAutoPanelPos.y) < 2) return
    store.set('panel.x', Math.round(x))
    store.set('panel.y', Math.round(y))
  }, 250)
}

function snapToBottom() {
  if (!petWin || petWin.isDestroyed()) return
  const [px, py] = petWin.getPosition()
  const disp = screen.getDisplayNearestPoint({ x: px, y: py })
  const wa = disp.workArea
  const x = px
  const y = wa.y + wa.height - PET_GROUND_Y
  petWin.setPosition(Math.round(x), Math.round(y))
  if (store) {
    store.set('pet.x', Math.round(x))
    store.set('pet.y', Math.round(y))
  }
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:snap')
  }
}

function toggleAutoLaunch() {
  if (!store) return
  const v = !store.get('ui.autoLaunch')
  store.set('ui.autoLaunch', v)
  app.setLoginItemSettings({ openAtLogin: v, openAsHidden: true })
}

function quitApp() {
  app.isQuiting = true
  app.quit()
}

// ---------- grip 参数与提示 ----------
function clampNum(v, def, lo, hi) {
  const n = Number(v)
  if (!Number.isFinite(n) || v === '' || v === null || v === undefined) return def
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

// 以配置为准（面板只报模式），并给两种模式各自的取值范围
function resolveGripParams(opts) {
  const mode = opts && opts.mode === 'endurance' ? 'endurance' : 'ihg'
  if (mode === 'endurance') {
    return {
      mode,
      hold: clampNum(store.get('grip.hold'), 5, 1, 60),
      relax: clampNum(store.get('grip.relax'), 5, 1, 60),
      sets: clampNum(store.get('grip.sets'), 10, 1, 50)
    }
  }
  return {
    mode,
    hold: clampNum(store.get('grip.ihgHold'), IHG.hold, 30, 180),
    relax: clampNum(store.get('grip.ihgRest'), IHG.rest, 30, 180),
    sets: clampNum(store.get('grip.ihgSets'), IHG.sets, 2, 8),
    intensity: clampNum(store.get('grip.intensity'), IHG.intensity, 1, 10)
  }
}

function bubble(text) {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:bubble', text)
}

function gripHandName(hand) {
  return hand === 'left' ? '左手' : hand === 'right' ? '右手' : ''
}

// ---------- IPC ----------
ipcMain.handle('config:get', (e, key) => store ? store.get(key) : undefined)
ipcMain.handle('config:set', (e, key, value) => {
  if (!store) return undefined
  const v = store.set(key, value)
  // 推最新配置给宠物窗口：大小、名字这类改完立刻可见，不必重启
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('config:init', store.get())
  return v
})
ipcMain.handle('config:all', () => store ? store.get() : {})

ipcMain.on('pet:hover', (e, hit) => {
  if (!petWin || petWin.isDestroyed()) return
  petHover = hit
  if (!drag) {
    petWin.setIgnoreMouseEvents(!hit, { forward: true })
  }
})

ipcMain.on('pet:drag-start', startDrag)
ipcMain.on('pet:drag-end', stopDrag)

ipcMain.on('pet:open-panel', showPanel)
ipcMain.on('pet:snap-bottom', snapToBottom)
ipcMain.on('pet:save-pos', (e, { x, y }) => {
  if (store) {
    store.set('pet.x', Math.round(x))
    store.set('pet.y', Math.round(y))
  }
})

ipcMain.on('pet:bubble', (e, text) => {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:bubble', text)
})

ipcMain.on('pet:state', (e, state) => {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:state', state)
})

// timer IPC
ipcMain.on('timer:start-pomo', (e, opts) => {
  if (timer) timer.startPomodoro(opts)
})
ipcMain.on('timer:pause-pomo', () => { if (timer) timer.pausePomodoro() })
ipcMain.on('timer:resume-pomo', () => { if (timer) timer.resumePomodoro() })
ipcMain.on('timer:stop-pomo', () => { if (timer) timer.stopPomodoro() })
ipcMain.handle('timer:pomo-state', () => timer ? timer.getPomodoroState() : {})

ipcMain.handle('timer:start-grip', (e, opts) => {
  if (!store || !timer) return { ok: false, reason: 'Mochi 还没准备好' }
  const p = resolveGripParams(opts)
  if (p.mode === 'ihg') {
    const q = ihgQuota(store.get('gripLogs') || [], new Date())
    if (!q.ok) return { ok: false, ...q }
  }
  breathCueSet = 0
  timer.startGrip(p)
  return { ok: true, params: p, quota: ihgQuota(store.get('gripLogs') || [], new Date()) }
})

ipcMain.handle('grip:schedule', () => ihgQuota(store ? (store.get('gripLogs') || []) : [], new Date()))
ipcMain.on('timer:pause-grip', () => { if (timer) timer.pauseGrip() })
ipcMain.on('timer:resume-grip', () => { if (timer) timer.resumeGrip() })
ipcMain.on('timer:stop-grip', () => { if (timer) timer.stopGrip() })
ipcMain.handle('timer:grip-state', () => timer ? timer.getGripState() : {})

ipcMain.on('timer:set-reminders', (e, list) => {
  if (timer) timer.setReminders(list)
  if (store) store.set('reminders', list)
})
ipcMain.handle('timer:get-reminders', () => timer ? timer.getReminders() : [])

// LLM
ipcMain.handle('llm:chat', async (e, { messages }) => {
  if (!store) throw new Error('NO_STORE')
  const cfg = store.get('llm')
  if (!cfg.apiKey) throw new Error('NO_KEY')
  const url = `${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: cfg.persona }, ...messages],
      max_tokens: 120,
      temperature: 0.9
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.choices?.[0]?.message?.content ?? ''
})

// grip logs
ipcMain.on('grip:log', (e, log) => {
  if (!store) return
  const logs = store.get('gripLogs') || []
  logs.unshift(log)
  if (logs.length > 365) logs.length = 365
  store.set('gripLogs', logs)
  store.set('stats.gripSets', (store.get('stats.gripSets') || 0) + (log.sets || 0))
})
ipcMain.handle('grip:logs', () => store ? (store.get('gripLogs') || []) : [])

// stats
ipcMain.on('stats:bump', (e, key, amount = 1) => {
  if (!store) return
  const v = (store.get(`stats.${key}`) || 0) + amount
  store.set(`stats.${key}`, v)
})
ipcMain.handle('stats:get', () => store ? (store.get('stats') || {}) : {})

// ---------- app lifecycle ----------
app.whenReady().then(() => {
  app.setAppUserModelId('com.boco.deskpet')

  const storePath = path.join(app.getPath('userData'), 'config.json')
  store = new Store(storePath)

  const al = store.get('ui.autoLaunch')
  app.setLoginItemSettings({ openAtLogin: al, openAsHidden: true })

  timer = new TimerEngine({
    onTick: (data) => {
      if (panelWin && !panelWin.isDestroyed()) {
        panelWin.webContents.send('timer:tick', data)
      }
      if (petWin && !petWin.isDestroyed()) {
        if (data.type === 'grip') {
          petWin.webContents.send('pet:grip-tick', data)
          // 降压模式：每组还剩 10 秒时提醒呼吸，这是高血压人群最大的风险点
          if (data.mode === 'ihg' && data.phase === 'hold' && data.remain === 10 && breathCueSet !== data.setCurrent) {
            breathCueSet = data.setCurrent
            bubble('还剩 10 秒 · 慢慢吐气，千万别憋气')
          }
        } else if (data.type === 'pomo') {
          petWin.webContents.send('pet:pomo-tick', data)
        }
      }
    },
    onPomoDone: (data) => {
      const msg = data.completed
        ? '番茄钟全部完成！休息一下吧～'
        : (data.phaseDone === 'focus' ? '专注结束，休息一下～' : '休息结束，继续加油！')
      notify(msg, '番茄钟')
      if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:pomo-done', data)
      if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('timer:pomo-done', data)
      if (store && data.phaseDone === 'focus') {
        store.set('stats.focusMinutes', (store.get('stats.focusMinutes') || 0) + (store.get('pomodoro.focus') || 25))
      }
      refreshTray()
    },
    onGripPhase: (data) => {
      let msg
      if (data.mode === 'ihg') {
        msg = data.phase === 'hold'
          ? `第 ${data.setCurrent}/${data.sets} 组：${gripHandName(data.hand)}持续握紧 ${(data.hold / 60).toFixed(1)} 分钟，约三分力`
          : `松开休息 ${data.relax} 秒，甩甩手`
      } else {
        msg = data.phase === 'hold' ? `第 ${data.setCurrent}/${data.sets} 组：握紧！` : '放松～'
      }
      notify(msg, '握力训练')
      if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:grip-phase', data)
      if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('timer:grip-phase', data)
    },
    onGripDone: (data) => {
      if (store) {
        const logs = store.get('gripLogs') || []
        logs.unshift({
          date: new Date().toISOString(),
          week: weekKey(new Date()),
          mode: data.mode || 'endurance',
          sets: data.sets,
          hold: data.hold,
          relax: data.relax,
          intensity: data.intensity ?? null
        })
        if (logs.length > 365) logs.length = 365
        store.set('gripLogs', logs)
        store.set('stats.gripSets', (store.get('stats.gripSets') || 0) + (data.sets || 0))
      }
      const quota = ihgQuota(store ? (store.get('gripLogs') || []) : [], new Date())
      notify(
        data.mode === 'ihg' ? `降压握力完成 · 本周 ${quota.used}/${quota.cap} 次` : '握力训练完成！',
        '握力训练'
      )
      const enriched = { ...data, weekUsed: quota.used, weekCap: quota.cap }
      if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:grip-done', enriched)
      if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('timer:grip-done', enriched)
      refreshTray()
    },
    onReminder: (r) => {
      notify(r.text, '提醒')
      if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:reminder', r)
    }
  })

  timer.setReminders(store.get('reminders') || [])

  createPetWindow()
  createPanelWindow()

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../assets/tray.png')))
  tray.setToolTip('Mochi - 桌面宠物')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => showPanel())

  showPet()
})

app.on('before-quit', () => { app.isQuiting = true })

app.on('window-all-closed', () => {
  // 桌面宠物不随窗口关闭退出，由托盘/菜单控制
})

// 安全兜底：如果拖拽过程中 renderer 崩溃或没发 drag-end，10s 后自动释放
setInterval(() => {
  if (drag && Date.now() - drag.startAt > 10000) {
    stopDrag()
  }
}, 5000)
