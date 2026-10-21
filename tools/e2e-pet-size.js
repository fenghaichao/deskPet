'use strict'
// 一次性量尺寸：真起 Electron，用 CDP 反复采样宠物画布的实心像素包围盒，
// 对比 scale=0.5 与 scale=1：整体应缩一半、面积应变成 1/4、脚底踩线不动、
// 气泡锚点跟着下降、命中区同步缩小。
// npm run test:size

const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-size-'))
const PORT = 9334
const SAMPLES = 40 // 覆盖一个完整的尾巴摆动周期（约 3.5 秒）
const INTERVAL = 90

// 猫身体中心（缩放后）与头顶命中点：着地线 400，未缩放时身体中心 322
const MEASURE = `(() => {
  const c = document.getElementById('pet-canvas')
  const g = c.getContext('2d')
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, sum = 0, n = 0
  return new Promise((resolve) => {
    const step = () => {
      const d = g.getImageData(0, 0, c.width, c.height).data
      let hits = 0
      for (let y = 0; y < c.height; y += 2) {
        for (let x = 0; x < c.width; x += 2) {
          if (d[(y * c.width + x) * 4 + 3] > 8) {
            hits++
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      sum += hits
      n++
      if (n < ${SAMPLES}) return setTimeout(step, ${INTERVAL})
      const dpr = window.devicePixelRatio || 1
      const bodyY = 400 - 78 * petScale
      resolve(JSON.stringify({
        scale: petScale,
        box: [Math.round(minX / dpr), Math.round(minY / dpr), Math.round(maxX / dpr), Math.round(maxY / dpr)],
        size: [Math.round((maxX - minX) / dpr), Math.round((maxY - minY) / dpr)],
        area: Math.round(sum / n * 4),
        bubbleBottom: getComputedStyle(document.getElementById('bubble')).bottom,
        hitBody: hitTest(180, bodyY),
        hitAboveHead: hitTest(180, bodyY - 110 * petScale)
      }))
    }
    // 先等一帧：刚调用 applyPetScale 时画布上还挂着上一尺寸的旧帧
    setTimeout(step, 200)
  })
})()`

function evalPage(ws, expression) {
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
      params: { expression, awaitPromise: true, returnByValue: true }
    }))
    setTimeout(() => reject(new Error('evaluate 超时')), 30000)
  })
}

async function waitPetPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const pet = list.find((p) => /pet[\\/]index\.html/.test(p.url))
      if (pet) {
        const ws = new WebSocket(pet.webSocketDebuggerUrl)
        await new Promise((res, rej) => {
          ws.addEventListener('open', res)
          ws.addEventListener('error', rej)
        })
        return ws
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('找不到宠物页面')
}

const results = []
function rec(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? '  -> ' + detail : ''}`)
}

;(async () => {
  fs.writeFileSync(path.join(udd, 'config.json'), JSON.stringify({ pet: { scale: 0.5 }, ui: { sound: false } }), 'utf8')
  const env = Object.assign({}, process.env)
  delete env.ELECTRON_RUN_AS_NODE
  const proc = spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['.', '--disable-gpu', '--no-sandbox', '--in-process-gpu', `--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`],
    { cwd: ROOT, stdio: 'ignore', env })

  try {
    const ws = await waitPetPage()
    await new Promise((r) => setTimeout(r, 1200))
    const half = JSON.parse(await evalPage(ws, MEASURE))
    await evalPage(ws, 'applyPetScale(1)')
    const full = JSON.parse(await evalPage(ws, MEASURE))
    await evalPage(ws, 'applyPetScale(0.5)')
    const back = JSON.parse(await evalPage(ws, MEASURE))

    console.log('scale=0.5 :', JSON.stringify(half))
    console.log('scale=1   :', JSON.stringify(full))
    console.log('回到 0.5  :', JSON.stringify(back))

    const rw = full.size[0] / half.size[0]
    const rh = full.size[1] / half.size[1]
    rec('包围盒横向缩到一半', Math.abs(rw - 2) <= 0.2, `全/半 = ${rw.toFixed(2)}`)
    rec('包围盒纵向缩到一半', Math.abs(rh - 2) <= 0.2, `全/半 = ${rh.toFixed(2)}`)
    rec('实心面积变成约 1/4', Math.abs(full.area / half.area - 4) <= 0.8, `全/半 = ${(full.area / half.area).toFixed(2)}`)
    rec('以着地线为锚点：贴线不沉，线以下按比例收进来',
      half.box[3] <= 400 + (full.box[3] - 400) * 0.5 + 2 && half.box[3] >= 400,
      `底边 全=${full.box[3]}（离线 ${full.box[3] - 400}px）半=${half.box[3]}（离线 ${half.box[3] - 400}px）`)
    rec('气泡锚点跟着猫头下降', half.bubbleBottom === '157.5px' && full.bubbleBottom === '255px', `半=${half.bubbleBottom} 全=${full.bubbleBottom}`)
    rec('命中区同步缩小', half.hitBody === true && half.hitAboveHead === false, JSON.stringify({ 身体: half.hitBody, 头顶上方: half.hitAboveHead }))
    rec('来回切换结果可复现',
      back.scale === 0.5 && Math.abs(back.size[0] - half.size[0]) <= 6 && back.bubbleBottom === half.bubbleBottom,
      `第二次半尺寸=${JSON.stringify(back.size)} scale=${back.scale}`)
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
