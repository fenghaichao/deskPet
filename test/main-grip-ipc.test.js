'use strict'

// main.js 握力 IPC 粘合层的集成测试（用 electron 桩件，不启动 GUI）
// 覆盖：参数解析（以配置为准 + 取值钳制）、每周 3 次配额拦截、
//       「还剩 10 秒别憋气」提示每组只发一次、左右手交替下发到宠物窗口、
//       完成时 gripLogs/stats 的落盘内容。
// node test/main-grip-ipc.test.js

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const { weekKey } = require('../src/gripSchedule')

const WA = { x: 0, y: 0, width: 1920, height: 1032 }
const sent = []
const handlers = { handle: new Map(), on: new Map() }
const intervals = []
const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-test-'))
const cfgPath = path.join(tmpUserData, 'config.json')

class FakeWC {
  send(channel, payload) { sent.push({ channel, payload }) }
  on() {}
  once() {}
  isDestroyed() { return false }
}

class FakeWin {
  constructor(opts) {
    this.opts = opts || {}
    this._x = 1091
    this._y = 632
    this._w = this.opts.width || 780
    this._h = this.opts.height || 620
    this._visible = false
    this.webContents = new FakeWC()
  }
  loadFile() { return Promise.resolve() }
  once() { return this }
  on() { return this }
  show() { this._visible = true }
  showInactive() { this._visible = true }
  hide() { this._visible = false }
  focus() {}
  isVisible() { return this._visible }
  isDestroyed() { return false }
  setAlwaysOnTop() {}
  setIgnoreMouseEvents() {}
  getPosition() { return [this._x, this._y] }
  getSize() { return [this._w, this._h] }
  getBounds() { return { x: this._x, y: this._y, width: this._w, height: this._h } }
  setPosition(x, y) { this._x = x; this._y = y }
}

const electronStub = {
  app: {
    requestSingleInstanceLock: () => true,
    on: () => {},
    quit: () => {},
    whenReady: () => Promise.resolve(),
    setAppUserModelId: () => {},
    setLoginItemSettings: () => {},
    getPath: () => tmpUserData
  },
  BrowserWindow: FakeWin,
  ipcMain: {
    handle: (ch, fn) => handlers.handle.set(ch, fn),
    on: (ch, fn) => handlers.on.set(ch, fn),
    removeListener: () => {}
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: WA }),
    getDisplayNearestPoint: () => ({ workArea: WA }),
    getAllDisplays: () => [{ workArea: WA }],
    getCursorScreenPoint: () => ({ x: 1000, y: 1000 })
  },
  Tray: class { setToolTip() {} setContextMenu() {} on() {} isDestroyed() { return false } },
  Menu: { buildFromTemplate: () => ({}) },
  nativeImage: { createFromPath: () => ({}) },
  Notification: class { constructor(o) { this.o = o } show() {} }
}

const origLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronStub
  return origLoad.call(this, request, ...rest)
}

const origSetInterval = global.setInterval
global.setInterval = (fn, ms) => {
  intervals.push({ fn, ms })
  return { __fake: true }
}

// 预置「本周已练满 3 次」的配置，用于验证配额拦截
fs.writeFileSync(cfgPath, JSON.stringify({
  grip: { mode: 'ihg', ihgHold: 120, ihgRest: 90, ihgSets: 4, intensity: 3 },
  gripLogs: [1, 2, 3].map(() => ({ date: new Date().toISOString(), week: weekKey(new Date()), mode: 'ihg', sets: 4, hold: 120, relax: 90, intensity: 3 })),
  stats: { gripSets: 12 }
}), 'utf8')

require('../src/main')

const start = () => handlers.handle.get('timer:start-grip')
const cfgSet = () => handlers.handle.get('config:set')
const gripState = () => handlers.handle.get('timer:grip-state')()
const bubbles = () => sent.filter((s) => s.channel === 'pet:bubble').map((s) => String(s.payload))
const gripTicks = () => sent.filter((s) => s.channel === 'pet:grip-tick').map((s) => s.payload)
const gripPhases = () => sent.filter((s) => s.channel === 'pet:grip-phase').map((s) => s.payload)
const readCfg = () => JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
function pump(seconds) {
  const tickers = intervals.filter((t) => t.ms === 1000)
  for (let i = 0; i < seconds; i++) tickers.forEach((t) => t.fn())
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log('ok    ' + name)
  } catch (e) {
    failures++
    console.log('FAIL  ' + name)
    console.log('        · ' + e.message)
  }
}

// 主进程的初始化在 whenReady().then() 里，等一个宏任务再跑断言
setTimeout(() => {
  check('桩件下主进程启动，握力相关 IPC 均已注册', () => {
    assert.ok(start(), 'timer:start-grip 没注册')
    assert.ok(handlers.handle.get('grip:schedule'), 'grip:schedule 没注册')
  })

  check('本周练满 3 次时拒绝开始，理由要引导隔天练', () => {
    const res = start()(null, { mode: 'ihg' })
    assert.strictEqual(res.ok, false)
    assert.strictEqual(res.used, 3)
    assert.strictEqual(res.cap, 3)
    assert.ok(/隔天/.test(res.reason), res.reason)
    assert.strictEqual(gripState().active, false, '被拒后不该有训练在跑')
  })

  check('清空本周记录后可以开始，参数以配置为准（握120/歇90/4组/三分力）', () => {
    cfgSet()(null, 'gripLogs', [])
    cfgSet()(null, 'stats.gripSets', 0)
    const res = start()(null, {})
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.params.mode, 'ihg')
    assert.strictEqual(res.params.hold, 120)
    assert.strictEqual(res.params.relax, 90)
    assert.strictEqual(res.params.sets, 4)
    assert.strictEqual(res.params.intensity, 3)
  })

  check('还剩 10 秒时提示「别憋气」，同一组只提示一次', () => {
    sent.length = 0
    pump(110)
    assert.strictEqual(bubbles().filter((t) => /别憋气/.test(t)).length, 1)
    pump(1)
    assert.strictEqual(bubbles().filter((t) => /别憋气/.test(t)).length, 1, '第二组之前不该重复刷屏')
  })

  check('第 2 组换手（右手），相位数据带 mode/hand', () => {
    pump(10) // 第 1 组握完 -> 休息
    pump(90) // 休息完 -> 第 2 组
    const last = gripPhases()[gripPhases().length - 1]
    assert.strictEqual(last.setCurrent, 2)
    assert.strictEqual(last.hand, 'right')
    assert.strictEqual(last.mode, 'ihg')
    assert.ok(gripTicks().some((d) => d.hand === 'left') && gripTicks().some((d) => d.hand === 'right'))
  })

  check('整场做完：gripLogs 记下真实参数，stats 累加 4 组', () => {
    pump(700) // 跑完剩下 3 组
    const cfg = readCfg()
    const first = cfg.gripLogs[0]
    assert.strictEqual(first.mode, 'ihg')
    assert.strictEqual(first.sets, 4)
    assert.strictEqual(first.hold, 120)
    assert.strictEqual(first.relax, 90)
    assert.strictEqual(first.intensity, 3)
    assert.strictEqual(first.week, weekKey(new Date()))
    assert.strictEqual(cfg.stats.gripSets, 4, '旧实现在这里会记成 0（状态被提前清空）')
  })

  check('完成后下发带本周计数的结束事件', () => {
    const done = sent.filter((s) => s.channel === 'pet:grip-done').map((s) => s.payload)
    assert.ok(done.length >= 1)
    assert.strictEqual(done[done.length - 1].weekUsed, 1)
    assert.strictEqual(done[done.length - 1].weekCap, 3)
    assert.strictEqual(done[done.length - 1].mode, 'ihg')
  })

  check('耐力模式沿用旧参数且不受每周限额约束', () => {
    cfgSet()(null, 'gripLogs', [1, 2, 3].map(() => ({ mode: 'ihg', week: weekKey(new Date()) })))
    const res = start()(null, { mode: 'endurance' })
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.params.mode, 'endurance')
    assert.strictEqual(res.params.hold, 5)
    assert.strictEqual(res.params.sets, 10)
    assert.strictEqual(res.params.hand, undefined, '耐力模式不分左右手')
    handlers.on.get('timer:stop-grip')()
    assert.strictEqual(gripState().active, false)
  })

  global.setInterval = origSetInterval
  Module._load = origLoad
  try { fs.rmSync(tmpUserData, { recursive: true, force: true }) } catch {}
  console.log(`\n${failures === 0 ? '全部通过' : failures + ' 项失败'}`)
  if (failures) process.exit(1)
}, 20)
