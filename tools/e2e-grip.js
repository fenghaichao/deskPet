'use strict'
// 一次性端到端冒烟：真起 Electron，用 CDP 驱动面板和宠物，验证渲染层
// node tmp/e2e-grip.js
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-e2e-'))
const PORT = 9333

function evalPage(ws, expr) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e6)
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== id) return
      ws.removeEventListener('message', onMsg)
      if (m.error) return reject(new Error(JSON.stringify(m.error)))
      resolve(m.result && m.result.result ? m.result.result.value : undefined)
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true }
    }))
    setTimeout(() => reject(new Error('evaluate 超时')), 15000)
  })
}

async function waitPages(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`)
      const list = await res.json()
      const panel = list.find((p) => /panel/.test(p.url))
      const pet = list.find((p) => /pet/.test(p.url))
      if (panel && pet) return { panel, pet }
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('找不到面板/宠物页面')
}

async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  return ws
}

const results = []
function rec(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? '  -> ' + detail : ''}`)
}

;(async () => {
  // 独立配置目录：本周已练 2 次，验证配额显示为 2/3
  const wk = (() => {
    const t = new Date()
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7))
    const p = (n) => String(n).padStart(2, '0')
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
  })()
  fs.writeFileSync(path.join(udd, 'config.json'), JSON.stringify({
    grip: { mode: 'ihg', ihgHold: 120, ihgRest: 90, ihgSets: 4, intensity: 3 },
    gripLogs: [{ mode: 'ihg', week: wk }, { mode: 'ihg', week: wk }],
    ui: { sound: false }
  }), 'utf8')

  const env = Object.assign({}, process.env)
  delete env.ELECTRON_RUN_AS_NODE
  const proc = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['.', '--disable-gpu', '--no-sandbox', '--in-process-gpu', `--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`],
    { cwd: ROOT, stdio: 'ignore', env })

  try {
    const { panel, pet } = await waitPages()
    const pw = await attach(panel)
    const tw = await attach(pet)

    const quota = await evalPage(pw, 'window.api.gripSchedule()')
    rec('面板读到本周配额 2/3', quota && quota.used === 2 && quota.ok === true, JSON.stringify(quota))

    const idleLabel = await evalPage(pw, 'document.querySelector("#grip-label").textContent')
    rec('默认落在降压模式（标签提示左右手）', /左右手交替/.test(idleLabel), idleLabel)

    const ihgVisible = await evalPage(pw, 'document.querySelector("#grip-ihg-panel").style.display !== "none"')
    const enduranceHidden = await evalPage(pw, 'document.querySelector("#grip-endurance-panel").style.display === "none"')
    rec('两种模式的参数面板互斥显示', ihgVisible && enduranceHidden, `ihg=${ihgVisible} endurance隐藏=${enduranceHidden}`)

    const res = await evalPage(pw, 'window.api.timerStartGrip({ mode: "ihg" })')
    rec('启动成功且按处方取参', res.ok === true && res.params.hold === 120 && res.params.relax === 90 && res.params.sets === 4, JSON.stringify(res.params))

    await new Promise((r) => setTimeout(r, 2500))
    const time = await evalPage(pw, 'document.querySelector("#grip-time").textContent')
    rec('倒计时用 mm:ss 显示 2 分钟', /^1:5\d$/.test(String(time)), time)

    const label = await evalPage(pw, 'document.querySelector("#grip-label").textContent')
    rec('面板提示当前是左手 + 别憋气', /左手/.test(label) && /吐气/.test(label), label)

    const petState = await evalPage(tw, 'state.s.state')
    rec('宠物进入持续轻握姿势', petState === 'grip', String(petState))

    const arms = await evalPage(tw, 'JSON.stringify([state.s.armL, state.s.armR, +state.s.gripL.toFixed(2), +state.s.gripR.toFixed(2)])')
    rec('只有左手抬起并逐渐加力', JSON.parse(arms)[0] === 3 && JSON.parse(arms)[1] === 0 && JSON.parse(arms)[2] > 0 && JSON.parse(arms)[3] === 0, arms)

    const bubble = await evalPage(tw, 'document.querySelector("#bubble-text").textContent')
    rec('气泡念出处方（分钟数 + 三分力）', /2.0 分钟/.test(bubble) && /三分力/.test(bubble), bubble)

    // 切到耐力模式，确认参数面板互换且旧行为保留
    await evalPage(pw, 'document.querySelector(\'#grip-mode [data-mode="endurance"]\').click()')
    const after = await evalPage(pw, 'JSON.stringify([document.querySelector("#grip-ihg-panel").style.display, document.querySelector("#grip-endurance-panel").style.display])')
    rec('切到耐力模式后参数面板互换', JSON.parse(after)[0] === 'none' && JSON.parse(after)[1] === '', after)

    await evalPage(pw, 'window.api.timerStopGrip()')
    await evalPage(pw, 'document.querySelector(\'#grip-mode [data-mode="ihg"]\').click()')
  } finally {
    proc.kill()
    try { fs.rmSync(udd, { recursive: true, force: true }) } catch {}
  }

  const bad = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - bad}/${results.length} passed`)
  process.exit(bad ? 1 : 0)
})().catch((e) => {
  console.log('脚本出错: ' + e.message)
  process.exit(1)
})
