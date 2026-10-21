'use strict'

// 降压握力（IHG）的排期与节拍回归测试：node test/grip-ihg.test.js
// 覆盖 timer.js 的左右手交替节拍 + gripSchedule.js 的每周限额

const assert = require('assert')
const { TimerEngine } = require('../src/timer')
const { IHG, weekKey, handForSet, ihgQuota, usedThisWeek } = require('../src/gripSchedule')

let failed = 0
function check(name, fn) {
  try {
    fn()
    console.log('ok    ' + name)
  } catch (e) {
    failed++
    console.log('FAIL  ' + name)
    console.log('        · ' + e.message)
  }
}

// ---------- 排期规则 ----------
check('处方默认值 = 握 120 秒 / 歇 90 秒 / 4 组 / 每周 3 次 / 三分力', () => {
  assert.strictEqual(IHG.hold, 120)
  assert.strictEqual(IHG.rest, 90)
  assert.strictEqual(IHG.sets, 4)
  assert.strictEqual(IHG.weeklyCap, 3)
  assert.strictEqual(IHG.intensity, 3)
})

check('左右手交替：1左 2右 3左 4右', () => {
  assert.deepStrictEqual([1, 2, 3, 4].map(handForSet), ['left', 'right', 'left', 'right'])
})

check('weekKey 以周一为起点，周日归上一周', () => {
  assert.strictEqual(weekKey(new Date(2026, 9, 19)), '2026-10-19') // 周一
  assert.strictEqual(weekKey(new Date(2026, 9, 20)), '2026-10-19') // 周二
  assert.strictEqual(weekKey(new Date(2026, 9, 25)), '2026-10-19') // 周日
  assert.strictEqual(weekKey(new Date(2026, 9, 26)), '2026-10-26') // 下周一
})

check('每周限额：只数本周的 ihg 记录，跨周和耐力记录不算', () => {
  const now = new Date(2026, 9, 21, 10, 0) // 周三
  const wk = weekKey(now)
  const prevWk = weekKey(new Date(2026, 9, 14))
  const logs = [
    { mode: 'ihg', week: wk },
    { mode: 'ihg', week: wk },
    { mode: 'endurance', week: wk },
    { mode: 'ihg', week: prevWk }
  ]
  assert.strictEqual(usedThisWeek(logs, now), 2)
  const q = ihgQuota(logs, now)
  assert.strictEqual(q.ok, true)
  assert.strictEqual(q.used, 2)
  assert.strictEqual(q.cap, 3)

  logs.push({ mode: 'ihg', week: wk })
  const full = ihgQuota(logs, now)
  assert.strictEqual(full.ok, false)
  assert.ok(full.reason.includes('3'), '拒绝理由要说清一周 3 次')
  assert.ok(/隔天/.test(full.reason), '拒绝理由要引导隔天练而不是硬凑')
})

check('空记录 / 脏记录不炸', () => {
  assert.strictEqual(usedThisWeek(undefined, new Date()), 0)
  assert.strictEqual(ihgQuota([null, {}, { mode: 'ihg' }], new Date()).used, 0)
})

// ---------- 计时节拍 ----------
function makeTimer() {
  const events = { phase: [], done: [], tick: [] }
  const t = new TimerEngine({
    onTick: (d) => { if (d.type === 'grip') events.tick.push(d) },
    onGripPhase: (d) => events.phase.push(d),
    onGripDone: (d) => events.done.push(d)
  })
  return { t, events }
}

check('降压节拍：4 组左右手交替，握 120 歇 90，结束时数据不丢', () => {
  const { t, events } = makeTimer()
  try {
    t.startGrip({ mode: 'ihg' })
    assert.strictEqual(t.grip.hold, 120)
    assert.strictEqual(t.grip.relax, 90)
    assert.strictEqual(t.grip.sets, 4)
    assert.strictEqual(t.grip.mode, 'ihg')
    assert.strictEqual(t.grip.hand, 'left')
    assert.strictEqual(t.grip.remain, 120)

    // 一组 = hold 结束 + relax 结束
    for (let i = 0; i < 3; i++) {
      t.gripPhaseDone() // -> relax
      assert.strictEqual(t.grip.phase, 'relax')
      assert.strictEqual(t.grip.remain, 90)
      t.gripPhaseDone() // -> 下一组 hold
      assert.strictEqual(t.grip.phase, 'hold')
      assert.strictEqual(t.grip.setCurrent, i + 2)
    }
    assert.deepStrictEqual(events.phase.map((p) => p.hand), ['left', 'left', 'right', 'right', 'left', 'left', 'right'])

    t.gripPhaseDone() // 第 4 组 hold 结束 -> relax
    t.gripPhaseDone() // 第 4 组 relax 结束 -> 完成
    assert.strictEqual(t.grip.active, false)
    assert.strictEqual(events.done.length, 1)
    const d = events.done[0]
    // 回归点：以前 stopGrip 先清空状态，导致这里记成 sets=0/hold=5
    assert.strictEqual(d.sets, 4)
    assert.strictEqual(d.hold, 120)
    assert.strictEqual(d.relax, 90)
    assert.strictEqual(d.mode, 'ihg')
    assert.strictEqual(d.completed, true)
  } finally {
    clearInterval(t._tickTimer)
  }
})

check('耐力模式保持原样：5 秒/5 秒 10 组、不分左右手', () => {
  const { t } = makeTimer()
  try {
    t.startGrip({ mode: 'endurance' })
    assert.strictEqual(t.grip.hold, 5)
    assert.strictEqual(t.grip.relax, 5)
    assert.strictEqual(t.grip.sets, 10)
    assert.strictEqual(t.grip.hand, null)
    assert.strictEqual(t.grip.mode, 'endurance')

    let n = 0
    while (t.grip.active && n < 100) { t.gripPhaseDone(); n++ }
    assert.strictEqual(t.grip.active, false)
    assert.strictEqual(n, 20) // 10 组 ×（握结束 + 松结束）
  } finally {
    clearInterval(t._tickTimer)
  }
})

console.log(`\n${failed === 0 ? '全部通过' : failed + ' 项失败'}`)
if (failed) process.exit(1)
