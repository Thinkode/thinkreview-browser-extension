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
  const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || ''
  const GA_API_SECRET = process.env.GA_API_SECRET || ''
  const HONEYBADGER_API_KEY = process.env.HONEYBADGER_API_KEY || ''
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

function createBuildDirectory () {
  const buildDir = path.join(process.cwd(), 'build')
  
  // Clean and create build directory
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true })
  }
  fs.mkdirSync(buildDir, { recursive: true })
  
  console.log('🧹 Cleaned build directory')
  return buildDir
}

function copyProjectFiles (buildDir) {
  const projectDir = process.cwd()
  
  // Files and directories to exclude from the build
  const excludePatterns = [
    'node_modules',
    'build',
    '.git',
    '.github',
    'scripts',
    'package.json',
    'package-lock.json',
    '.eslintrc.json',
    '.gitignore',
    'README.md',
    'ARCHITECTURE.md'
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

function build () {
  try {
    console.log('🚀 Building extension...')
    
const buildDir = createBuildDirectory()
    copyProjectFiles(buildDir)
    writeEnvConfig(buildDir)

    console.log('✅ Build completed successfully!')
    console.log(`📦 Extension files ready in: ${buildDir}`)
    
  } catch (error) {
    console.error('❌ Build failed:', error.message)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  build()
}

export { build }
