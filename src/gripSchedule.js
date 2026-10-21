'use strict'

// IHG 降压握力的排期规则（纯函数，无 electron 依赖，test/grip-ihg.test.js 覆盖）
//
// 剂量依据（等长握力降压的文献一致处方）：
//   4 组 × 每组持续握 2 分钟，强度 ≥30% 最大自主收缩，组间歇 1-2 分钟，
//   每周不超过 3 次（练得更频繁效果反而变差），至少坚持 8 周。

const IHG = {
  hold: 120, // 秒
  rest: 90, // 秒
  sets: 4, // 左右手各 2 组，交替进行
  weeklyCap: 3,
  intensity: 3, // 自觉用力 0-10 分里的 3 分，约等于 30% 最大握力
}

// 以周一为一周起点
function weekKey(d) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const MonOffset = (t.getDay() + 6) % 7
  t.setDate(t.getDate() - MonOffset)
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

// 每组换一只手：第 1 组左手、第 2 组右手……
function handForSet(setIndex) {
  return setIndex % 2 === 1 ? 'left' : 'right'
}

function usedThisWeek(logs, now) {
  const wk = weekKey(now)
  return (logs || []).filter((l) => l && l.mode === 'ihg' && l.week === wk).length
}

function ihgQuota(logs, now) {
  const used = usedThisWeek(logs, now)
  return {
    mode: 'ihg',
    used,
    cap: IHG.weeklyCap,
    ok: used < IHG.weeklyCap,
    reason: used >= IHG.weeklyCap
      ? `本周已经练了 ${used}/${IHG.weeklyCap} 次。降压靠的是隔天练，今天别加了`
      : ''
  }
}

module.exports = { IHG, weekKey, handForSet, usedThisWeek, ihgQuota }
