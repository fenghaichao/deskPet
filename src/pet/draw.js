/* draw.js - Canvas procedural pet drawing */

function drawPet(ctx, s, W, H) {
  const cx = W / 2
  const cy = H - 118
  const bw = 150 * s.bodyScaleX
  const bh = 140 * s.bodyScaleY

  ctx.save()
  ctx.translate(cx, cy + s.yOffset)
  ctx.rotate(s.tilt * Math.PI / 180)

  // shadow
  ctx.beginPath()
  ctx.ellipse(0, bh * 0.58, bw * 0.42, bh * 0.1, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.07)'
  ctx.fill()

  // tail
  drawTail(ctx, -bw * 0.4, bh * 0.22, s.tailAngle)

  // body
  drawBody(ctx, 0, 0, bw, bh)

  // ears
  drawEar(ctx, -bw * 0.3, -bh * 0.52, s.earL)
  drawEar(ctx, bw * 0.3, -bh * 0.52, s.earR)

  // paws
  drawPaw(ctx, -bw * 0.26, bh * 0.40, s.armL)
  drawPaw(ctx, bw * 0.26, bh * 0.40, s.armR)

  // face
  drawFace(ctx, 0, -bh * 0.06, s)

  ctx.restore()
}

function drawTail(ctx, x, y, angle) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle * Math.PI / 180)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(-28, -30, -24, -70)
  ctx.quadraticCurveTo(-20, -105, 6, -125)
  ctx.lineWidth = 15
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#FFF6EC'
  ctx.stroke()
  ctx.lineWidth = 3.5
  ctx.strokeStyle = '#3B2E28'
  ctx.stroke()
  ctx.restore()
}

function drawBody(ctx, x, y, w, h) {
  ctx.save()
  ctx.translate(x, y)

  ctx.beginPath()
  ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(0, -h * 0.22, w * 0.1, 0, 0, w * 0.55)
  g.addColorStop(0, '#FFFEF8')
  g.addColorStop(0.55, '#FFF6EC')
  g.addColorStop(1, '#FFE9D6')
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#3B2E28'
  ctx.stroke()

  // belly highlight
  ctx.beginPath()
  ctx.ellipse(0, h * 0.06, w * 0.2, h * 0.16, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fill()

  ctx.restore()
}

function drawEar(ctx, x, y, tilt) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt * Math.PI / 180)

  ctx.beginPath()
  ctx.moveTo(-26, 16)
  ctx.lineTo(0, -46)
  ctx.lineTo(26, 16)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, -46, 0, 16)
  g.addColorStop(0, '#FFFEF8')
  g.addColorStop(1, '#FFF6EC')
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#3B2E28'
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-14, 10)
  ctx.lineTo(0, -28)
  ctx.lineTo(14, 10)
  ctx.closePath()
  ctx.fillStyle = '#FFC9CE'
  ctx.fill()

  ctx.restore()
}

function drawPaw(ctx, x, y, pose) {
  ctx.save()
  ctx.translate(x, y)
  let angle = 0
  if (pose === 1) angle = -35
  if (pose === 2) angle = -15
  ctx.rotate(angle * Math.PI / 180)

  ctx.beginPath()
  ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#FFF6EC'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#3B2E28'
  ctx.stroke()

  // paw pad
  ctx.beginPath()
  ctx.ellipse(0, 2, 6, 4.5, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#FFC9CE'
  ctx.fill()

  ctx.restore()
}

function drawFace(ctx, x, y, s) {
  ctx.save()
  ctx.translate(x, y)

  const eyeSpacing = 40
  drawEye(ctx, -eyeSpacing / 2, -6, s.eyeX, s.eyeY, s.blink)
  drawEye(ctx, eyeSpacing / 2, -6, s.eyeX, s.eyeY, s.blink)

  // nose
  ctx.beginPath()
  ctx.moveTo(-5, 10)
  ctx.lineTo(5, 10)
  ctx.lineTo(0, 16)
  ctx.closePath()
  ctx.fillStyle = '#E88A8A'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#3B2E28'
  ctx.stroke()

  // mouth
  drawMouth(ctx, 0, 18, s.mouth)

  // blush
  if (s.blush > 0) {
    ctx.globalAlpha = Math.min(1, s.blush)
    ctx.beginPath()
    ctx.ellipse(-34, 4, 13, 8, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#FFB3BC'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(34, 4, 13, 8, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#FFB3BC'
    ctx.fill()
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

function drawEye(ctx, x, y, dx, dy, open) {
  ctx.save()
  ctx.translate(x + dx, y + dy)
  if (open < 0.25) {
    ctx.beginPath()
    ctx.moveTo(-12, 0)
    ctx.quadraticCurveTo(0, 4, 12, 0)
    ctx.lineWidth = 2.8
    ctx.strokeStyle = '#3B2E28'
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.ellipse(0, 0, 12, 16 * open, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.lineWidth = 2.8
    ctx.strokeStyle = '#3B2E28'
    ctx.stroke()

    ctx.beginPath()
    ctx.ellipse(0, 2, 6.5, 8.5 * open, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#2B1F1B'
    ctx.fill()

    ctx.beginPath()
    ctx.ellipse(-3, -4, 3.5, 4.2 * open, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(4, 4, 1.6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fill()
  }
  ctx.restore()
}

function drawMouth(ctx, x, y, type) {
  ctx.save()
  ctx.translate(x, y)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = '#3B2E28'
  ctx.lineCap = 'round'
  if (type === 0 || type === undefined) {
    ctx.beginPath()
    ctx.moveTo(-8, 0)
    ctx.quadraticCurveTo(0, 4.5, 8, 0)
    ctx.stroke()
  } else if (type === 1) {
    ctx.beginPath()
    ctx.ellipse(0, 3.5, 5, 6.5, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#FF9A9A'
    ctx.fill()
    ctx.stroke()
  } else if (type === 2) {
    ctx.beginPath()
    ctx.moveTo(-8, -1)
    ctx.quadraticCurveTo(-4, 4.5, 0, 0)
    ctx.quadraticCurveTo(4, 4.5, 8, -1)
    ctx.stroke()
  }
  ctx.restore()
}
