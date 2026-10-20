'use strict'

// 启动器：清除可能由 CI/沙箱注入的 ELECTRON_RUN_AS_NODE，
// 确保 electron 进入真正的 GUI 运行时而不是退化为 node。
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

function findElectron() {
  const candidates = [
    path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron'),
    path.join(__dirname, 'node_modules', '.bin', 'electron')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

const electronExe = findElectron()
if (!electronExe) {
  console.error('[launcher] 找不到 electron 二进制，请先运行 npm install')
  process.exit(1)
}

const args = ['.'].concat(process.argv.slice(2))
const env = Object.assign({}, process.env)
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronExe, args, {
  cwd: __dirname,
  env,
  stdio: 'inherit'
})

child.on('exit', (code) => {
  process.exit(code === null ? 0 : code)
})

child.on('error', (err) => {
  console.error('[launcher] 启动失败:', err.message)
  process.exit(1)
})
