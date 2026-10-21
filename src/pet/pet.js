/* pet.js - Pet state machine, interactions and render loop */

class PetState {
  constructor() {
    this.s = {
      state: 'idle',
      t: 0,
      breath: 0,
      blink: 1,
      bodyScaleY: 1, bodyScaleX: 1,
      eyeX: 0, eyeY: 0,
      earL: 0, earR: 0,
      mouth: 0, blush: 0.5,
      tailAngle: 0,
      armL: 0, armR: 0,
      gripL: 0, gripR: 0,
      tilt: 0, yOffset: 0,
    }
    this.idleTimer = Math.random() * 4
    this.blinkTimer = 0
    this.nextBlink = 2 + Math.random() * 4
    this.anims = []
    this.actionTimer = 0
    this.actionQueue = []
    this.timeouts = []
  }

  clearTimeouts() {
    for (const t of this.timeouts) clearTimeout(t)
    this.timeouts = []
  }

  addAnim(key, duration, to, from) {
    const f = {}
    for (const k of Object.keys(to)) {
      f[k] = (from && from[k] !== undefined) ? from[k] : this.s[k]
    }
    this.anims = this.anims.filter(a => a.key !== key)
    this.anims.push({ key, start: this.s.t, duration, from: f, to, done: false })
  }

  updateAnims() {
    for (const a of this.anims) {
      let p = Math.min(1, (this.s.t - a.start) / a.duration)
      let ep
      if (a.key.startsWith('blink')) ep = this.easeBlink(p)
      else if (a.key.startsWith('land')) ep = this.easeOutElastic(p)
      else ep = this.easeOutBack(p)
      for (const k of Object.keys(a.to)) {
        const fr = a.from[k]
        const to = a.to[k]
        this.s[k] = fr + (to - fr) * ep
      }
      if (p >= 1) a.done = true
    }
    this.anims = this.anims.filter(a => !a.done)
  }

  easeBlink(p) {
    if (p < 0.35) return 1 - p / 0.35 * 0.82
    return 0.18 + (p - 0.35) / 0.65 * 0.82
  }

  easeOutBack(x) {
    const c1 = 1.70158, c3 = c1 + 1
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
  }

  easeOutElastic(x) {
    const c4 = (2 * Math.PI) / 3
    return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1
  }

  update(dt, mouse, rect) {
    this.s.t += dt

    // breath
    this.s.breath = Math.sin(this.s.t * 2.5) * 0.5 + 0.5
    if (this.s.state !== 'drag' && this.s.state !== 'land' && this.s.state !== 'training' && this.s.state !== 'grip') {
      this.s.bodyScaleY = 1 + Math.sin(this.s.t * 2.5) * 0.03
      this.s.bodyScaleX = 1 + Math.cos(this.s.t * 2.5) * 0.015
    }
    this.s.tailAngle = Math.sin(this.s.t * 1.8) * 12

    // blink
    this.blinkTimer += dt
    if (this.blinkTimer > this.nextBlink && this.s.blink > 0.8) {
      this.triggerBlink()
    }
    const blinkAnim = this.anims.find(a => a.key.startsWith('blink'))
    if (!blinkAnim && this.s.state !== 'sleep') {
      this.s.blink = 1
    }

    // gaze follow
    if (this.s.state !== 'drag' && this.s.state !== 'sleep') {
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height * (rect.eyeFrac || 0.72)
      const dx = (mouse.x - cx) / (rect.width / 2)
      const dy = (mouse.y - cy) / (rect.height / 2)
      const maxOff = 7
      const tx = Math.max(-maxOff, Math.min(maxOff, dx * 10))
      const ty = Math.max(-maxOff, Math.min(maxOff, dy * 8))
      this.s.eyeX += (tx - this.s.eyeX) * 0.1
      this.s.eyeY += (ty - this.s.eyeY) * 0.1
    } else {
      this.s.eyeX *= 0.92
      this.s.eyeY *= 0.92
    }

    // ear idle
    this.s.earL = Math.sin(this.s.t * 3.2) * 3
    this.s.earR = Math.sin(this.s.t * 2.7 + 1) * 3

    // action queue
    if (this.actionQueue.length > 0) {
      this.actionTimer -= dt
      if (this.actionTimer <= 0) {
        const next = this.actionQueue.shift()
        if (next) {
          this.addAnim(next.key, next.duration, next.to, next.from)
          this.actionTimer = next.delay || 0
        }
      }
    }

    // idle random actions
    if (this.s.state === 'idle' && this.actionQueue.length === 0) {
      this.idleTimer += dt
      if (this.idleTimer > 5 + Math.random() * 8) {
        this.idleTimer = 0
        this.queueIdleAction()
      }
    }

    // drag pose
    if (this.s.state === 'drag') {
      this.s.yOffset = -30 + Math.sin(this.s.t * 8) * 4
      this.s.tilt = Math.sin(this.s.t * 5) * 5
      this.s.armL = 1
      this.s.armR = 1
      this.s.earL = -8
      this.s.earR = 8
    }

    // training pose
    if (this.s.state === 'training') {
      this.s.armL = 2
      this.s.armR = 2
      this.s.mouth = 2
      this.s.yOffset = Math.sin(this.s.t * 3) * 3
    }

    // 降压（ihg）姿势：抬爪持续轻握 + 放慢呼吸，示范"别憋气"
    if (this.s.state === 'grip') {
      this.s.bodyScaleY = 1 + Math.sin(this.s.t * 1.0) * 0.05
      this.s.bodyScaleX = 1 + Math.cos(this.s.t * 1.0) * 0.022
      this.s.yOffset = Math.sin(this.s.t * 1.0) * 1.5
      this.s.mouth = 1
      this.s.tailAngle = Math.sin(this.s.t * 0.8) * 6
    }

    this.updateAnims()
    return this.s
  }

  triggerBlink() {
    this.blinkTimer = 0
    this.nextBlink = 2 + Math.random() * 5
    this.addAnim('blink', 0.18, { blink: 0.15 }, { blink: 1 })
  }

  queueIdleAction() {
    const r = Math.random()
    if (r < 0.3) {
      this.actionQueue = [
        { key: 'tilt', duration: 0.5, to: { tilt: 6 } },
        { key: 'tilt2', duration: 0.5, to: { tilt: 0 }, delay: 1.2 }
      ]
      this.actionTimer = 0
    } else if (r < 0.5) {
      this.actionQueue = [
        { key: 'jump', duration: 0.3, to: { yOffset: -16 } },
        { key: 'jump2', duration: 0.3, to: { yOffset: 0 }, delay: 0.35 }
      ]
      this.actionTimer = 0
    } else if (r < 0.7) {
      this.actionQueue = [
        { key: 'ear1', duration: 0.25, to: { earL: 10, earR: -10 } },
        { key: 'ear2', duration: 0.25, to: { earL: -8, earR: 8 }, delay: 0.35 },
        { key: 'ear3', duration: 0.25, to: { earL: 0, earR: 0 }, delay: 0.35 }
      ]
      this.actionTimer = 0
    }
  }

  setState(st) {
    if (this.s.state === st) return
    this.clearTimeouts()
    this.s.state = st
    this.actionQueue = []

    if (st === 'happy') {
      this.s.mouth = 1
      this.s.blush = 1
      this.addAnim('happy', 0.5, { bodyScaleY: 1.08, bodyScaleX: 0.95 })
      this.timeouts.push(setTimeout(() => {
        if (this.s.state === 'happy') {
          this.addAnim('happy_back', 0.5, { bodyScaleY: 1, bodyScaleX: 1 })
          this.s.mouth = 0
          this.s.blush = 0.5
        }
      }, 1500))
      this.timeouts.push(setTimeout(() => {
        if (this.s.state === 'happy') this.setState('idle')
      }, 2200))
    } else if (st === 'sleep') {
      this.s.blink = 0
      this.s.mouth = 0
      this.s.blush = 0.3
    } else if (st === 'training') {
      this.s.armL = 2
      this.s.armR = 2
      this.s.mouth = 2
    } else if (st === 'grip') {
      this.s.mouth = 1
      this.s.blush = 0.5
    } else if (st === 'talk') {
      this.s.mouth = 1
    } else if (st === 'idle') {
      this.s.mouth = 0
      this.s.blush = 0.5
      this.s.armL = 0
      this.s.armR = 0
      this.s.gripL = 0
      this.s.gripR = 0
      this.s.yOffset = 0
      this.s.tilt = 0
    } else if (st === 'land') {
      this.addAnim('land', 0.4, { bodyScaleY: 1.12, bodyScaleX: 0.88, yOffset: 4 })
      this.actionQueue = [
        { key: 'land2', duration: 0.5, to: { bodyScaleY: 1, bodyScaleX: 1, yOffset: 0 }, delay: 0.4 }
      ]
      this.actionTimer = 0
      this.timeouts.push(setTimeout(() => {
        if (this.s.state === 'land') this.setState('idle')
      }, 1200))
    }
  }
}

// ---------- setup ----------
const canvas = document.getElementById('pet-canvas')
const ctx = canvas.getContext('2d')
const W = 360, H = 440
const GROUND_Y = 400 // 着地线（与主进程 PET_GROUND_Y 一致），缩放的锚点
const dpr = window.devicePixelRatio || 1
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = W + 'px'
canvas.style.height = H + 'px'
ctx.scale(dpr, dpr)

let state = new PetState()
let mouse = { x: 0, y: 0 }
let lastT = performance.now()
let bubbleEl = document.getElementById('bubble')
let bubbleText = document.getElementById('bubble-text')
let bubbleTimer = null
let typeTimer = null
let petScale = 1

// 缩放只作用于猫本身；字号不动，气泡锚点跟着猫头走
function applyPetScale(v) {
  const k = Number(v)
  petScale = Number.isFinite(k) ? Math.max(0.2, Math.min(1.6, k)) : 1
  document.documentElement.style.setProperty('--pet-scale', String(petScale))
}

window.api.onConfigInit((e, cfg) => {
  applyPetScale(cfg && cfg.pet ? cfg.pet.scale : 1)
})

// ---------- hit tests ----------
function hitTest(mx, my) {
  const cx = W / 2
  // 与 drawPet 同一个锚点：身体中心 (W/2, H-118) 缩放后落在 400 - 78k
  const cy = GROUND_Y + ((H - 118) - GROUND_Y) * petScale
  const dx = mx - cx, dy = my - cy
  return Math.sqrt(dx * dx + dy * dy) < 95 * petScale
}

function isBubbleHit(ex, ey) {
  if (!bubbleEl.classList.contains('visible')) return false
  const r = bubbleEl.getBoundingClientRect()
  return ex >= r.left && ex <= r.right && ey >= r.top && ey <= r.bottom
}

// ---------- events ----------
let clickStart = null

function onMouseDown(e) {
  if (e.button !== 0) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  if (!hitTest(mx, my) && !isBubbleHit(e.clientX, e.clientY)) return
  clickStart = { x: e.clientX, y: e.clientY, t: performance.now() }
  window.api.petDragStart()
}

function onMouseUp(e) {
  if (!clickStart) return
  const dt = performance.now() - clickStart.t
  const dist = Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y)
  const wasBubble = isBubbleHit(e.clientX, e.clientY)
  clickStart = null
  if (dist < 6 && dt < 250 && !wasBubble) {
    onPetClick(e.clientX, e.clientY)
  }
  window.api.petDragEnd()
}

function onMouseMove(e) {
  mouse.x = e.screenX
  mouse.y = e.screenY
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const hit = hitTest(mx, my) || isBubbleHit(e.clientX, e.clientY)
  window.api.petHover(hit)
  canvas.style.cursor = hit ? 'grab' : 'default'
}

canvas.addEventListener('mousedown', onMouseDown)
window.addEventListener('mouseup', onMouseUp)
window.addEventListener('mousemove', onMouseMove)

canvas.addEventListener('contextmenu', e => {
  e.preventDefault()
  window.api.petOpenPanel()
})

// ---------- IPC ----------
window.api.onPetDrag((e, active) => {
  if (active) state.setState('drag')
})
window.api.onPetDropped((e, data) => {
  state.setState(data.snapped ? 'idle' : 'land')
})
window.api.onPetSnap(() => {
  state.setState('land')
})
window.api.onPetBubble((e, text) => {
  showBubble(text)
})
window.api.onPetPomoDone((e, data) => {
  showBubble(data.completed ? '番茄钟完成啦！休息一下吧～' : '专注时间到！')
  state.setState('happy')
})
window.api.onPetGripPhase((e, data) => {
  if (data.mode === 'ihg') {
    if (data.phase === 'hold') {
      const hand = data.hand === 'right' ? '右手' : '左手'
      showBubble(`第 ${data.setCurrent}/${data.sets} 组：${hand}握紧 ${(data.hold / 60).toFixed(1)} 分钟，三分力就好`)
      state.setState('grip')
      state.s.armL = data.hand === 'left' ? 3 : 0
      state.s.armR = data.hand === 'right' ? 3 : 0
    } else {
      showBubble('松开歇一下，甩甩手～')
      state.setState('idle')
    }
    return
  }
  showBubble(data.phase === 'hold' ? `第${data.setCurrent}组，握紧！` : '放松～')
  state.setState('training')
})

window.api.onPetGripTick((e, data) => {
  if (!data || !data.active || data.mode !== 'ihg' || data.phase !== 'hold') {
    state.s.gripL = 0
    state.s.gripR = 0
    return
  }
  const total = data.total || 1
  const elapsed = total - data.remain
  const ramp = Math.min(1, elapsed / Math.max(1, total * 0.12)) // 开头十几秒慢慢加力
  const level = Math.min(1, 0.55 * (((data.intensity ?? 3) / 3))) // 三分力 ≈ 0.55
  state.s.gripL = data.hand === 'right' ? 0 : level * ramp
  state.s.gripR = data.hand === 'left' ? 0 : level * ramp
})

window.api.onPetGripDone((e, data) => {
  state.s.gripL = 0
  state.s.gripR = 0
  state.s.armL = 0
  state.s.armR = 0
  showBubble(
    data && data.mode === 'ihg'
      ? `这轮完成！本周 ${data.weekUsed}/${data.weekCap} 次，去测个血压吧`
      : '训练完成！你好棒～'
  )
  state.setState('happy')
})
window.api.onPetReminder((e, r) => {
  showBubble(r.text)
  state.setState('talk')
  state.timeouts.push(setTimeout(() => state.setState('idle'), 4000))
})

// ---------- click reaction ----------
const LINES = [
  '喵～♡', '摸摸头～', '好舒服呀', '再点一下嘛', '今天也要加油哦',
  'Mochi 喜欢你～', '工作累了要休息', '想吃点小鱼干...',
  '有我在陪你哦', '抱抱～', '喵呜！', '蹭蹭～'
]

function onPetClick(x, y) {
  state.setState('happy')
  showBubble(LINES[Math.floor(Math.random() * LINES.length)])
  spawnParticles(x, y)
  window.api.statsBump('pokes')
}

// ---------- bubble ----------
function showBubble(text) {
  clearInterval(typeTimer)
  bubbleText.textContent = ''
  bubbleEl.classList.add('visible')
  let i = 0
  typeTimer = setInterval(() => {
    if (i < text.length) {
      bubbleText.textContent += text[i]
      i++
    } else {
      clearInterval(typeTimer)
    }
  }, 32)
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    bubbleEl.classList.remove('visible')
  }, Math.max(3000, text.length * 32 + 2200))
}

// ---------- particles ----------
function spawnParticles(x, y) {
  const container = document.getElementById('particles')
  const emojis = ['♡', '✨', '♪']
  for (let i = 0; i < 5; i++) {
    const el = document.createElement('div')
    el.className = 'particle'
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)]
    const ox = (Math.random() - 0.5) * 60
    const oy = (Math.random() - 0.5) * 30
    el.style.left = (x + ox) + 'px'
    el.style.top = (y + oy - 40) + 'px'
    container.appendChild(el)
    setTimeout(() => el.remove(), 1300)
  }
}

// ---------- render loop ----------
function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  const rect = canvas.getBoundingClientRect()
  // 视线跟踪的锚点（原设计在窗口高度 72% 处）按同一个锚点换算
  const eyeY = GROUND_Y + ((H * 0.72) - GROUND_Y) * petScale
  const eyeFrac = eyeY / H
  const s = state.update(dt, mouse, { left: rect.left, top: rect.top, width: rect.width, height: rect.height, eyeFrac })

  ctx.clearRect(0, 0, W, H)
  drawPet(ctx, s, W, H, petScale, GROUND_Y)

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
