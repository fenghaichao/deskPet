'use strict'

// 一次性回归测试：node test/placement.test.js
// 断言「面板必须完整落在工作区内」，这是本次 bug 的核心验收标准。

const assert = require('assert')
const { placePanel } = require('../src/placement')

const cases = []

// 你的真实环境：1920x1080，任务栏占 48，宠物贴底 -> pet.y = 1032 - 400 = 632
cases.push({
  name: '贴底的宠物（必现场景：pet.y=632, 1920x1032）',
  input: {
    wa: { x: 0, y: 0, width: 1920, height: 1032 },
    pet: { x: 1091, y: 632, w: 360, h: 440 },
    panel: { w: 780, h: 620 }
  },
  // 除了「不出界」，还要求摆在宠物上方（别压住宠物、也别掉到屏幕底下）
  extra: (r, c) => assert.ok(r.y + c.input.panel.h <= c.input.pet.y, '应当摆在宠物上方')
})

// 宠物在屏幕顶部：上方放不下，应翻到宠物下方
cases.push({
  name: '靠顶的宠物（pet.y=50）',
  input: {
    wa: { x: 0, y: 0, width: 1920, height: 1032 },
    pet: { x: 900, y: 50, w: 360, h: 440 },
    panel: { w: 780, h: 620 }
  },
  // 下方空间 532 仍小于面板 620，只能钳到工作区底部，但不能跳回屏幕顶部
  extra: (r, c) => assert.ok(r.y > c.input.pet.y + c.input.pet.h - 100, '应当摆在宠物那一侧而不是屏幕顶部')
})

cases.push({
  name: '靠顶的宠物 + 矮面板（上下都放得下时取下方）',
  input: {
    wa: { x: 0, y: 0, width: 1920, height: 1032 },
    pet: { x: 900, y: 50, w: 360, h: 440 },
    panel: { w: 780, h: 400 }
  },
  extra: (r, c) => assert.strictEqual(r.y, c.input.pet.y + c.input.pet.h + 10, '应当紧贴宠物下方')
})

// 副屏在工作区左侧（x 为负）
cases.push({
  name: '左侧副屏（workArea.x = -1920）',
  input: {
    wa: { x: -1920, y: 0, width: 1920, height: 1040 },
    pet: { x: -900, y: 640, w: 360, h: 440 },
    panel: { w: 780, h: 620 }
  }
})

// 宠物贴屏幕最右
cases.push({
  name: '贴右缘的宠物（pet.x=1560）',
  input: {
    wa: { x: 0, y: 0, width: 1920, height: 1032 },
    pet: { x: 1560, y: 632, w: 360, h: 440 },
    panel: { w: 780, h: 620 }
  }
})

// 小屏：工作区比面板还矮，必须退化为贴顶而不是出界
cases.push({
  name: '小屏 1366x768（工作区高度不足以容纳面板）',
  input: {
    wa: { x: 0, y: 0, width: 1366, height: 728 },
    pet: { x: 700, y: 328, w: 360, h: 440 },
    panel: { w: 780, h: 620 }
  }
})

const failures = []
for (const c of cases) {
  const { wa, panel } = c.input
  const r = placePanel(c.input)
  const problems = []
  if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) problems.push('坐标不是有效数字')
  if (r.x < wa.x) problems.push(`左边界出界 x=${r.x} < wa.x=${wa.x}`)
  if (r.y < wa.y) problems.push(`顶部出界 y=${r.y} < wa.y=${wa.y}`)
  if (r.x + panel.w > wa.x + wa.width) problems.push(`右边界出界 x=${r.x}+${panel.w} > ${wa.x + wa.width}`)
  if (r.y + panel.h > wa.y + wa.height) problems.push(`底部出界 y=${r.y}+${panel.h} > ${wa.y + wa.height}`)
  if (problems.length === 0 && c.extra) {
    try { c.extra(r, c) } catch (e) { problems.push(e.message) }
  }
  const pos = `(x=${r.x}, y=${r.y})`
  if (problems.length) {
    failures.push(c.name)
    console.log(`FAIL  ${c.name}  -> ${pos}`)
    problems.forEach((p) => console.log(`        · ${p}`))
  } else {
    console.log(`ok    ${c.name}  -> ${pos}`)
  }
}

console.log(`\n${cases.length - failures.length}/${cases.length} passed`)
if (failures.length) process.exit(1)
