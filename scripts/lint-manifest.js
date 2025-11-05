#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

function lintManifest () {
  try {
    const manifestPath = path.join(process.cwd(), 'manifest.json')
    const manifestContent = fs.readFileSync(manifestPath, 'utf8')
    
    console.log('🔍 Linting manifest.json...')
    
    // Parse JSON to check for syntax errors
    const manifest = JSON.parse(manifestContent)
    
    // Check for proper formatting
    const formattedContent = JSON.stringify(manifest, null, 2)
    
    if (manifestContent.trim() !== formattedContent) {
      console.log('📝 Formatting manifest.json...')
      fs.writeFileSync(manifestPath, formattedContent + '\n')
      console.log('✅ Manifest formatted successfully')
    } else {
      console.log('✅ Manifest is properly formatted')
    }
    
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
