#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env from project root if present (for local builds)
function loadEnv () {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

function writeEnvConfig (buildDir) {
  loadEnv()
  // Trim to strip any trailing \r\n / whitespace from GitHub vars/secrets
  const GA_MEASUREMENT_ID = (process.env.GA_MEASUREMENT_ID || '').trim()
  const GA_API_SECRET = (process.env.GA_API_SECRET || '').trim()
  const HONEYBADGER_API_KEY = (process.env.HONEYBADGER_API_KEY || '').trim()
  const outPath = path.join(buildDir, 'utils', 'env-config.js')
  const content = `// Injected at build from .env or CI
export const GA_MEASUREMENT_ID = ${JSON.stringify(GA_MEASUREMENT_ID)};
export const GA_API_SECRET = ${JSON.stringify(GA_API_SECRET)};
export const HONEYBADGER_API_KEY = ${JSON.stringify(HONEYBADGER_API_KEY)};
`
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, content)
  console.log('📝 Injected env into utils/env-config.js')
}

const BUILD_DIRS = ['build', 'build-firefox', 'build-edge']

function createBuildDirectory (target = 'chrome') {
  const dirName = target === 'firefox' ? 'build-firefox' : target === 'edge' ? 'build-edge' : 'build'
  const buildDir = path.join(process.cwd(), dirName)

  // Clean and create build directory
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true })
  }
  fs.mkdirSync(buildDir, { recursive: true })

  console.log('🧹 Cleaned build directory:', dirName)
  return buildDir
}

function copyProjectFiles (buildDir, excludeBuildDirs = BUILD_DIRS) {
  const projectDir = process.cwd()

  // Files and directories to exclude from the build
  const excludePatterns = [
    'node_modules',
    '.git',
    '.github',
    'scripts',
    'package.json',
    'package-lock.json',
    '.eslintrc.json',
    '.gitignore',
    'README.md',
    'ARCHITECTURE.md',
    ...excludeBuildDirs
  ]
  
  console.log('📦 Copying entire project...')
  
  // Get all items in the project directory
  const items = fs.readdirSync(projectDir)
  
  for (const item of items) {
    // Skip excluded items
    if (excludePatterns.includes(item)) {
      console.log(`⏭️  Skipping ${item}`)
      continue
    }
    // Skip zip files (e.g. production zip from previous build)
    if (item.endsWith('.zip')) {
      console.log(`⏭️  Skipping ${item}`)
      continue
    }
    
    const srcPath = path.join(projectDir, item)
    const destPath = path.join(buildDir, item)
    
    const stats = fs.statSync(srcPath)
    
    if (stats.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true })
      console.log(`📁 Copied directory: ${item}/`)
    } else {
      fs.copyFileSync(srcPath, destPath)
      console.log(`📄 Copied file: ${item}`)
    }
  }
}

// AMO / Edge Add-ons require extension name ≤ 45 characters (Chrome allows longer)
const STORE_NAME_MAX_LENGTH = 45
const FIREFOX_SHORT_NAME = 'ThinkReview: Chat with your Pull Requests'
const EDGE_SHORT_NAME = 'ThinkReview: AI Code Review for Pull Requests'

/** Write Firefox-compatible manifest (background.scripts + optional_host_permissions format). */
function writeFirefoxManifest (buildDir) {
  const manifestPath = path.join(buildDir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest.background = {
    scripts: ['background.js'],
    type: 'module'
  }
  // Use short name for Firefox (AMO limit 45 chars)
  if ((manifest.name || '').length > STORE_NAME_MAX_LENGTH) {
    manifest.name = FIREFOX_SHORT_NAME
    console.log('🦊 Set Firefox name to:', manifest.name, `(${manifest.name.length} chars)`)
  }
  // background.type (module) requires Firefox 112+
  const gecko = manifest.browser_specific_settings?.gecko
  if (gecko) {
    gecko.strict_min_version = '112.0'
    console.log('🦊 Set gecko.strict_min_version to 112.0 (required for background.type)')
    // AMO requires data_collection_permissions (built-in consent from Firefox 140+)
    gecko.data_collection_permissions = {
      required: ['websiteContent'],
      optional: ['technicalAndInteraction']
    }
    console.log('🦊 Set gecko.data_collection_permissions')
  }
  // Firefox rejects Chrome-style "http://*:*/*" and "https://*:*/*"; use <all_urls> instead
  if (Array.isArray(manifest.optional_host_permissions)) {
    const hasWildcard = manifest.optional_host_permissions.some(
      p => p === 'http://*:*/*' || p === 'https://*:*/*'
    )
    if (hasWildcard) {
      manifest.optional_host_permissions = ['<all_urls>']
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log('🦊 Wrote Firefox-compatible manifest (background.scripts, optional_host_permissions)')
}

/** Write Edge Add-ons manifest (Chromium format + short name ≤ 45 chars). */
function writeEdgeManifest (buildDir) {
  const manifestPath = path.join(buildDir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if ((manifest.name || '').length > STORE_NAME_MAX_LENGTH) {
    manifest.name = EDGE_SHORT_NAME
    console.log('🟦 Set Edge name to:', manifest.name, `(${manifest.name.length} chars)`)
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log('🟦 Wrote Edge Add-ons manifest (short name)')
}

/**
 * @param {boolean|string} targetOrFirefox - true/'firefox', 'edge', or false/'chrome'
 */
function build (targetOrFirefox = false) {
  try {
    let target = 'chrome'
    if (targetOrFirefox === true || targetOrFirefox === 'firefox') target = 'firefox'
    else if (targetOrFirefox === 'edge') target = 'edge'

    const label =
      target === 'firefox' ? '🦊 Building extension for Firefox...'
        : target === 'edge' ? '🟦 Building extension for Edge Add-ons...'
          : '🚀 Building extension...'
    console.log(label)

    const buildDir = createBuildDirectory(target)
    copyProjectFiles(buildDir, BUILD_DIRS)
    writeEnvConfig(buildDir)

    if (target === 'firefox') {
      writeFirefoxManifest(buildDir)
    } else if (target === 'edge') {
      writeEdgeManifest(buildDir)
    }

    console.log('✅ Build completed successfully!')
    console.log(`📦 Extension files ready in: ${buildDir}`)
    if (target === 'firefox') {
      console.log('   Load this folder in Firefox via about:debugging → Load Temporary Add-on')
    } else if (target === 'edge') {
      console.log('   Load this folder in Edge via edge://extensions → Load unpacked')
    }
  } catch (error) {
    console.error('❌ Build failed:', error.message)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2]
  const target =
    arg === 'firefox' || process.env.BUILD_FIREFOX === '1' ? 'firefox'
      : arg === 'edge' || process.env.BUILD_EDGE === '1' ? 'edge'
        : 'chrome'
  build(target)
}

export { build }
