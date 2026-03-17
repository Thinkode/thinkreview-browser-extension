#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')

import { build } from './build.js'

const buildDirName = 'build-firefox'

try {
  console.log('🦊 Building Firefox extension and creating production zip...\n')
  build(true)

  const buildDir = path.join(projectRoot, buildDirName)
  if (!fs.existsSync(buildDir)) {
    console.error('❌ Build directory not found:', buildDir)
    process.exit(1)
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'))
  const zipName = `thinkreview-firefox-v${manifest.version}.zip`
  const zipPath = path.join(projectRoot, zipName)

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)

  execSync(`zip -rq "${zipPath}" .`, { cwd: buildDir, stdio: 'inherit' })

  console.log('\n✅ Firefox production zip created:', zipName)
  console.log('   Upload this file to addons.mozilla.org (AMO) for distribution.')
} catch (error) {
  console.error('❌ Build zip failed:', error.message)
  process.exit(1)
}
