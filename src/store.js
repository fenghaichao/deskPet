'use strict'

const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  pet: {
    x: null,
    y: null,
    scale: 1,
    name: 'Mochi'
  },
  // 控制面板位置：用户拖动过就记住，没拖过则每次按宠物位置自动摆放
  panel: {
    x: null,
    y: null
  },
  ui: {
    sound: true,
    alwaysOnTop: true,
    autoLaunch: false,
    bubble: true
  },
  llm: {
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    persona: '你是一只住在电脑屏幕上的小奶猫，名字叫 Mochi。说话简短、可爱、有点黏人，每次回复不超过 40 个字，偶尔用颜文字。不要用 Markdown。'
  },
  pomodoro: {
    focus: 25,
    break: 5,
    longBreak: 15,
    rounds: 4
  },
  grip: {
    hold: 5,
    relax: 5,
    sets: 10,
    dailyGoal: 30
  },
  gripLogs: [],
  reminders: [],
  stats: {
    pokes: 0,
    focusMinutes: 0,
    gripSets: 0,
    firstDay: null
  }
}

function clone(v) {
  return JSON.parse(JSON.stringify(v))
}

class Store {
  constructor(file) {
    this.file = file
    this.data = this.load()
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      return this.mergeDefaults(clone(DEFAULTS), raw)
    } catch {
      return clone(DEFAULTS)
    }
  }

  mergeDefaults(base, raw) {
    if (!raw || typeof raw !== 'object') return base
    for (const key of Object.keys(base)) {
      const b = base[key]
      const r = raw[key]
      if (r === undefined) continue
      if (b && typeof b === 'object' && !Array.isArray(b)) {
        base[key] = this.mergeDefaults(b, r)
      } else {
        base[key] = r
      }
    }
    return base
  }

  get(key) {
    if (!key) return this.data
    return key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), this.data)
  }

  set(key, value) {
    const parts = key.split('.')
    let node = this.data
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {}
      node = node[parts[i]]
    }
    node[parts[parts.length - 1]] = value
    this.save()
    return value
  }

  patch(partial) {
    this.data = this.mergeDefaults(this.data, partial)
    this.save()
    return this.data
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
    } catch (err) {
      console.error('[store] save failed', err)
    }
  }
}

module.exports = { Store, DEFAULTS }
