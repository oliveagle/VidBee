#!/usr/bin/env node

const { spawn } = require('node:child_process')
const path = require('node:path')

const mode = process.argv[2] || 'web-only'
const electronArgs = ['.', '--no-sandbox', '--disable-gpu-sandbox', '--headless']

if (mode === 'web' || mode === 'web-only') {
  process.env.VIDBEE_MODE = 'web-only'
} else if (mode === 'both') {
  process.env.VIDBEE_MODE = 'both'
  electronArgs.push('--web-server')
} else if (mode === 'app-only') {
  process.env.VIDBEE_MODE = 'app-only'
} else {
  process.env.VIDBEE_MODE = 'web-only'
}

console.log(`Starting VidBee in ${mode} mode...`)
console.log(`Mode: ${process.env.VIDBEE_MODE}`)

const electronPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron'
)

// Check if we're on Linux without a display
const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY

const spawnOptions = {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env }
}

let child
if (needsXvfb) {
  // Use xvfb-run for headless Linux environments
  const xvfbRunPath = path.join(__dirname, '..', 'node_modules', '.bin', 'xvfb-run')
  child = spawn(
    xvfbRunPath,
    ['--auto-servernum', '--server-args=-screen 0 1024x768x24', electronPath, ...electronArgs],
    spawnOptions
  )
} else {
  child = spawn(electronPath, electronArgs, spawnOptions)
}

child.on('error', (err) => {
  console.error('Failed to start electron:', err)
  process.exit(1)
})

child.on('close', (code) => {
  process.exit(code || 0)
})
