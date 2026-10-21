'use strict'

// 控制面板摆放计算：给定工作区 / 宠物窗口 / 面板尺寸，算出面板左上角坐标。
// 纯函数，不依赖 electron，方便单测（test/placement.test.js）。
//
// 规则：
//   1. 结果必须完整落在工作区内（不能被任务栏或屏幕边缘切掉）；
//   2. 水平方向默认贴在宠物左侧，左边放不下就从宠物位置往右展；
//   3. 垂直方向挑空间更大的一侧（宠物贴底时上方空间大，所以摆在宠物上方），
//      再钳制回工作区——这一步就是原来缺失的兜底。

function placePanel({ wa, pet, panel, margin = 10 }) {
  const W = panel.w
  const H = panel.h

  const loX = wa.x + margin
  const loY = wa.y + margin
  const hiX = wa.x + wa.width - W - margin
  const hiY = wa.y + wa.height - H - margin

  // 工作区比面板还窄/矮时 hi < lo，钳制会反转区间——此时退化为贴起点
  const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi))

  // ---- 水平 ----
  let x = pet.x + pet.w + 30 - W // 面板右边缘略微越过宠物窗口
  if (x < loX) x = pet.x - 30 // 左侧放不下，就从宠物左边一点往右展开
  x = clamp(x, loX, hiX)

  // ---- 垂直 ----
  const aboveRoom = pet.y - (wa.y + margin)
  const belowRoom = wa.y + wa.height - margin - (pet.y + pet.h)
  let y = aboveRoom >= belowRoom ? pet.y - H - margin : pet.y + pet.h + margin
  y = clamp(y, loY, hiY)

  return { x: Math.round(x), y: Math.round(y) }
}

module.exports = { placePanel }
