/* panel.js - Control panel logic */

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

// ---------- tabs ----------
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'))
    $$('.section').forEach(s => s.classList.remove('active'))
    tab.classList.add('active')
    $(`#${tab.dataset.target}`).classList.add('active')
  })
})

$('#close-btn').addEventListener('click', () => window.close())

// ---------- toast ----------
function showToast(msg) {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#3B2E28;color:#FFF;padding:8px 16px;border-radius:8px;font-size:13px;z-index:100;animation:fadeIn 0.2s ease;'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300) }, 1800)
}

// ---------- config init ----------
let reminders = []
let chatHistory = []
let pomoState = { active: false, paused: false, phase: 'focus', remain: 0, total: 0, round: 1, rounds: 4 }
let gripState = { active: false, paused: false, phase: 'hold', remain: 0, total: 0, setCurrent: 0, sets: 0 }

async function init() {
  const cfg = await window.api.configAll()
  $('#pet-name').value = cfg.pet?.name || 'Mochi'
  $('#llm-url').value = cfg.llm?.baseURL || ''
  $('#llm-key').value = cfg.llm?.apiKey || ''
  $('#llm-model').value = cfg.llm?.model || ''
  $('#llm-persona').value = cfg.llm?.persona || ''
  $('#sound-on').checked = cfg.ui?.sound !== false
  $('#auto-launch').checked = cfg.ui?.autoLaunch || false
  $('#pomo-focus').value = cfg.pomodoro?.focus ?? 25
  $('#pomo-break').value = cfg.pomodoro?.break ?? 5
  $('#pomo-long').value = cfg.pomodoro?.longBreak ?? 15
  $('#pomo-rounds').value = cfg.pomodoro?.rounds ?? 4
  $('#grip-hold').value = cfg.grip?.hold ?? 5
  $('#grip-relax').value = cfg.grip?.relax ?? 5
  $('#grip-sets').value = cfg.grip?.sets ?? 10
  $('#grip-goal').value = cfg.grip?.dailyGoal ?? 30

  reminders = cfg.reminders || []
  renderReminders()

  const stats = await window.api.statsGet()
  updateStats(stats)

  const logs = await window.api.gripLogs()
  renderGripLogs(logs)
}
init()

// ---------- pomo ----------
function updatePomoDisplay() {
  const m = Math.floor(pomoState.remain / 60)
  const s = pomoState.remain % 60
  $('#pomo-time').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  $('#pomo-label').textContent = pomoState.active
    ? (pomoState.phase === 'focus' ? `专注中 · 第 ${pomoState.round}/${pomoState.rounds} 轮` : (pomoState.phase === 'longBreak' ? '长休息' : '短休息'))
    : '准备开始'
}

function updatePomoButtons() {
  if (!pomoState.active) {
    $('#pomo-start').style.display = ''
    $('#pomo-pause').style.display = 'none'
    $('#pomo-stop').style.display = 'none'
  } else {
    $('#pomo-start').style.display = 'none'
    $('#pomo-pause').style.display = ''
    $('#pomo-pause').textContent = pomoState.paused ? '继续' : '暂停'
    $('#pomo-stop').style.display = ''
  }
}

$('#pomo-start').addEventListener('click', () => {
  const opts = {
    focus: parseInt($('#pomo-focus').value) || 25,
    break: parseInt($('#pomo-break').value) || 5,
    longBreak: parseInt($('#pomo-long').value) || 15,
    rounds: parseInt($('#pomo-rounds').value) || 4
  }
  window.api.timerStartPomo(opts)
  updatePomoButtons()
})

$('#pomo-pause').addEventListener('click', () => {
  if (pomoState.paused) window.api.timerResumePomo()
  else window.api.timerPausePomo()
})

$('#pomo-stop').addEventListener('click', () => {
  window.api.timerStopPomo()
})

window.api.onTimerTick((e, data) => {
  if (data.type === 'pomo') {
    pomoState = data
    updatePomoDisplay()
    updatePomoButtons()
  }
})

window.api.onTimerPomoDone((e, data) => {
  pomoState = { active: false, paused: false, phase: 'focus', remain: 0, total: 0, round: 1, rounds: 4 }
  updatePomoDisplay()
  updatePomoButtons()
})

// ---------- grip ----------
function updateGripDisplay() {
  $('#grip-time').textContent = gripState.remain + 's'
  $('#grip-label').textContent = gripState.active
    ? (gripState.phase === 'hold' ? `握紧！第 ${gripState.setCurrent}/${gripState.sets} 组` : '放松...')
    : '准备开始'
}

function updateGripButtons() {
  if (!gripState.active) {
    $('#grip-start').style.display = ''
    $('#grip-pause').style.display = 'none'
    $('#grip-stop').style.display = 'none'
  } else {
    $('#grip-start').style.display = 'none'
    $('#grip-pause').style.display = ''
    $('#grip-pause').textContent = gripState.paused ? '继续' : '暂停'
    $('#grip-stop').style.display = ''
  }
}

$('#grip-start').addEventListener('click', () => {
  const opts = {
    hold: parseInt($('#grip-hold').value) || 5,
    relax: parseInt($('#grip-relax').value) || 5,
    sets: parseInt($('#grip-sets').value) || 10
  }
  window.api.timerStartGrip(opts)
  updateGripButtons()
})

$('#grip-pause').addEventListener('click', () => {
  if (gripState.paused) window.api.timerResumeGrip()
  else window.api.timerPauseGrip()
})

$('#grip-stop').addEventListener('click', () => {
  window.api.timerStopGrip()
})

window.api.onTimerTick((e, data) => {
  if (data.type === 'grip') {
    gripState = data
    updateGripDisplay()
    updateGripButtons()
  }
})

window.api.onTimerGripPhase((e, data) => {
  gripState = data
  updateGripDisplay()
  updateGripButtons()
})

window.api.onTimerGripDone(async (e, data) => {
  gripState = { active: false, paused: false }
  updateGripDisplay()
  updateGripButtons()
  const logs = await window.api.gripLogs()
  renderGripLogs(logs)
  const stats = await window.api.statsGet()
  updateStats(stats)
})

// ---------- reminders ----------
function renderReminders() {
  const list = $('#reminder-list')
  list.innerHTML = ''
  if (reminders.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#bbb;font-size:13px;padding:20px">还没有提醒</div>'
    return
  }
  reminders.forEach((r, idx) => {
    const el = document.createElement('div')
    el.className = 'reminder-item'
    el.innerHTML = `
      <span class="time">${r.time || '--:--'}</span>
      <span class="text">${r.text}</span>
      <input type="checkbox" class="toggle" ${r.enabled ? 'checked' : ''}>
      <span class="del">🗑</span>
    `
    el.querySelector('.toggle').addEventListener('change', (e) => {
      r.enabled = e.target.checked
      window.api.timerSetReminders(reminders)
    })
    el.querySelector('.del').addEventListener('click', () => {
      reminders.splice(idx, 1)
      window.api.timerSetReminders(reminders)
      renderReminders()
    })
    list.appendChild(el)
  })
}

$('#add-reminder').addEventListener('click', () => {
  const time = $('#reminder-time').value
  const text = $('#reminder-text').value.trim()
  if (!time || !text) { showToast('请填写时间和内容'); return }
  reminders.push({ id: Date.now().toString(), type: 'daily', time, text, enabled: true })
  window.api.timerSetReminders(reminders)
  $('#reminder-text').value = ''
  renderReminders()
  showToast('提醒已添加')
})

// ---------- chat ----------
function addMsg(role, text) {
  const div = document.createElement('div')
  div.className = `chat-msg ${role}`
  div.textContent = text
  $('#chat-messages').appendChild(div)
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight
}

$('#chat-send').addEventListener('click', async () => {
  const input = $('#chat-input')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  addMsg('user', text)
  chatHistory.push({ role: 'user', content: text })

  const thinking = document.createElement('div')
  thinking.className = 'chat-msg pet'
  thinking.textContent = '...'
  $('#chat-messages').appendChild(thinking)
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight

  try {
    const reply = await window.api.llmChat(chatHistory)
    thinking.textContent = reply
    chatHistory.push({ role: 'assistant', content: reply })
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20)
    // 同步到宠物气泡
    window.api.petBubble(reply)
  } catch (err) {
    if (err.message === 'NO_KEY' || err.message.includes('NO_KEY')) {
      const fallback = ['喵？我好像连接不上大脑...', 'API Key 还没设置呢', '先去设置里填一下 Key 吧', 'Mochi 暂时不知道怎么回答...']
      thinking.textContent = fallback[Math.floor(Math.random() * fallback.length)]
    } else {
      thinking.textContent = '出错了: ' + (err.message || '未知错误')
    }
  }
})

$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    $('#chat-send').click()
  }
})

// ---------- settings ----------
$('#save-settings').addEventListener('click', async () => {
  await window.api.configSet('pet.name', $('#pet-name').value)
  await window.api.configSet('llm.baseURL', $('#llm-url').value)
  await window.api.configSet('llm.apiKey', $('#llm-key').value)
  await window.api.configSet('llm.model', $('#llm-model').value)
  await window.api.configSet('llm.persona', $('#llm-persona').value)
  await window.api.configSet('ui.sound', $('#sound-on').checked)
  await window.api.configSet('ui.autoLaunch', $('#auto-launch').checked)
  await window.api.configSet('pomodoro.focus', parseInt($('#pomo-focus').value) || 25)
  await window.api.configSet('pomodoro.break', parseInt($('#pomo-break').value) || 5)
  await window.api.configSet('pomodoro.longBreak', parseInt($('#pomo-long').value) || 15)
  await window.api.configSet('pomodoro.rounds', parseInt($('#pomo-rounds').value) || 4)
  await window.api.configSet('grip.hold', parseInt($('#grip-hold').value) || 5)
  await window.api.configSet('grip.relax', parseInt($('#grip-relax').value) || 5)
  await window.api.configSet('grip.sets', parseInt($('#grip-sets').value) || 10)
  await window.api.configSet('grip.dailyGoal', parseInt($('#grip-goal').value) || 30)
  showToast('设置已保存')
})

// ---------- stats & logs ----------
function updateStats(s) {
  $('#stat-pokes').textContent = s.pokes || 0
  $('#stat-focus').textContent = s.focusMinutes || 0
  $('#stat-grip').textContent = s.gripSets || 0
}

function renderGripLogs(logs) {
  const list = $('#grip-logs')
  list.innerHTML = ''
  if (logs.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#bbb;font-size:13px;padding:12px">还没有记录</div>'
    return
  }
  logs.slice(0, 30).forEach(l => {
    const div = document.createElement('div')
    div.className = 'log-item'
    const d = new Date(l.date)
    div.textContent = `${d.toLocaleDateString()} · ${l.sets}组 · ${l.hold}s握/${l.relax}s松`
    list.appendChild(div)
  })
}
