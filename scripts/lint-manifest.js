#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

function lintManifest () {
  try {
    const manifestPath = path.join(process.cwd(), 'manifest.json')
    const manifestContent = fs.readFileSync(manifestPath, 'utf8')

    console.log('🔍 Linting manifest.json...')

    // Parse JSON to check for syntax errors only (do not rewrite the file)
    JSON.parse(manifestContent)

    console.log('✅ Manifest is valid JSON')
    console.log('✅ Manifest linting completed successfully!')
  } catch (error) {
    console.error('❌ Manifest linting failed:', error.message)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  lintManifest()
}

export { lintManifest }
