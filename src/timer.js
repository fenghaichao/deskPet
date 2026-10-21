'use strict'

const { IHG, handForSet } = require('./gripSchedule')

class TimerEngine {
  constructor(handlers) {
    this.cb = handlers
    this.pomo = { active: false, paused: false, phase: 'focus', round: 1, rounds: 4, remain: 0, total: 0 }
    this._pomoCfg = { focus: 25 * 60, break: 5 * 60, longBreak: 15 * 60, rounds: 4 }
    this.grip = { active: false, paused: false, phase: 'hold', setCurrent: 0, sets: 0, remain: 0, total: 0, hold: 5, relax: 5, mode: 'endurance', hand: null, intensity: null }
    this.reminders = []
    this.firedToday = new Set()
    this.lastDate = this.todayKey()
    this._tickTimer = setInterval(() => this.tick(), 1000)
  }

  todayKey() {
    const d = new Date()
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  }

  formatHHMM() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  tick() {
    const nowKey = this.todayKey()
    if (nowKey !== this.lastDate) {
      this.firedToday.clear()
      this.lastDate = nowKey
    }
    const now = Date.now()

    if (this.pomo.active && !this.pomo.paused) {
      this.pomo.remain = Math.max(0, this.pomo.remain - 1)
      if (this.pomo.remain <= 0) {
        this.pomoDone()
      }
      if (this.cb.onTick) this.cb.onTick({ type: 'pomo', ...this.pomo })
    }

    if (this.grip.active && !this.grip.paused) {
      this.grip.remain = Math.max(0, this.grip.remain - 1)
      if (this.grip.remain <= 0) {
        this.gripPhaseDone()
      }
      if (this.cb.onTick) this.cb.onTick({ type: 'grip', ...this.grip })
    }

    const hhmm = this.formatHHMM()
    for (const r of this.reminders) {
      if (!r.enabled) continue
      const key = `${nowKey}:${r.id}`
      if (this.firedToday.has(key)) continue
      if (r.type === 'once' && r.at && now >= r.at && now < r.at + 60000) {
        this.firedToday.add(key)
        if (this.cb.onReminder) this.cb.onReminder(r)
      }
      if (r.type === 'daily' && r.time === hhmm) {
        this.firedToday.add(key)
        if (this.cb.onReminder) this.cb.onReminder(r)
      }
    }
  }

  startPomodoro(opts) {
    const focus = (opts?.focus ?? 25) * 60
    const shortBreak = (opts?.break ?? 5) * 60
    const longBreak = (opts?.longBreak ?? 15) * 60
    const rounds = opts?.rounds ?? 4
    this._pomoCfg = { focus, break: shortBreak, longBreak, rounds }
    this.pomo = { active: true, paused: false, phase: 'focus', round: 1, rounds, remain: focus, total: focus }
    if (this.cb.onTick) this.cb.onTick({ type: 'pomo', ...this.pomo })
  }

  pausePomodoro() {
    if (this.pomo.active) this.pomo.paused = true
  }

  resumePomodoro() {
    if (this.pomo.active) this.pomo.paused = false
  }

  stopPomodoro() {
    this.pomo = { active: false, paused: false, phase: 'focus', round: 1, rounds: 4, remain: 0, total: 0 }
  }

  getPomodoroState() {
    return { ...this.pomo }
  }

  pomoDone() {
    const c = this._pomoCfg
    const donePhase = this.pomo.phase
    if (donePhase === 'focus') {
      if (this.pomo.round >= this.pomo.rounds) {
        this.pomo.phase = 'longBreak'
        this.pomo.total = c.longBreak
        this.pomo.remain = c.longBreak
      } else {
        this.pomo.phase = 'break'
        this.pomo.total = c.break
        this.pomo.remain = c.break
      }
    } else if (donePhase === 'break') {
      this.pomo.round += 1
      this.pomo.phase = 'focus'
      this.pomo.total = c.focus
      this.pomo.remain = c.focus
    } else if (donePhase === 'longBreak') {
      this.stopPomodoro()
      if (this.cb.onPomoDone) this.cb.onPomoDone({ completed: true, phaseDone: donePhase, rounds: c.rounds })
      return
    }
    if (this.cb.onPomoDone) this.cb.onPomoDone({ ...this.pomo, completed: false, phaseDone: donePhase })
  }

  startGrip(opts) {
    const mode = opts?.mode === 'ihg' ? 'ihg' : 'endurance'
    // 降压模式用文献处方做默认值：握 120 秒 / 歇 90 秒 / 4 组左右手交替
    const hold = opts?.hold ?? (mode === 'ihg' ? IHG.hold : 5)
    const relax = opts?.relax ?? (mode === 'ihg' ? IHG.rest : 5)
    const sets = opts?.sets ?? (mode === 'ihg' ? IHG.sets : 10)
    this.grip = {
      active: true,
      paused: false,
      phase: 'hold',
      setCurrent: 1,
      sets,
      remain: hold,
      total: hold,
      hold,
      relax,
      mode,
      hand: mode === 'ihg' ? handForSet(1) : null,
      intensity: opts?.intensity ?? (mode === 'ihg' ? IHG.intensity : null)
    }
    if (this.cb.onTick) this.cb.onTick({ type: 'grip', ...this.grip })
    if (this.cb.onGripPhase) this.cb.onGripPhase({ ...this.grip, newPhase: true })
  }

  gripPhaseDone() {
    if (this.grip.phase === 'hold') {
      this.grip.phase = 'relax'
      this.grip.total = this.grip.relax
      this.grip.remain = this.grip.relax
    } else {
      if (this.grip.setCurrent >= this.grip.sets) {
        const finished = { ...this.grip } // stopGrip 会清空这些字段，先留快照
        this.stopGrip()
        if (this.cb.onGripDone) this.cb.onGripDone({ ...finished, completed: true })
        return
      }
      this.grip.setCurrent += 1
      if (this.grip.mode === 'ihg') this.grip.hand = handForSet(this.grip.setCurrent)
      this.grip.phase = 'hold'
      this.grip.total = this.grip.hold
      this.grip.remain = this.grip.hold
    }
    if (this.cb.onGripPhase) this.cb.onGripPhase({ ...this.grip, newPhase: true })
  }

  pauseGrip() {
    if (this.grip.active) this.grip.paused = true
  }

  resumeGrip() {
    if (this.grip.active) this.grip.paused = false
  }

  stopGrip() {
    this.grip = { active: false, paused: false, phase: 'hold', setCurrent: 0, sets: 0, remain: 0, total: 0, hold: 5, relax: 5, mode: 'endurance', hand: null, intensity: null }
  }

  getGripState() {
    return { ...this.grip }
  }

  setReminders(list) {
    this.reminders = [...list]
    this.firedToday.clear()
  }

  getReminders() {
    return [...this.reminders]
  }
}

module.exports = { TimerEngine }
