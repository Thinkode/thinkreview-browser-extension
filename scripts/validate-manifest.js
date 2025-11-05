#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function validateManifest () {
  try {
    const manifestPath = path.join(process.cwd(), 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    console.log('🔍 Validating manifest.json...')

    // Check required fields
    const requiredFields = ['manifest_version', 'name', 'version', 'description']
    for (const field of requiredFields) {
      if (!manifest[field]) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    // Validate manifest version
    if (manifest.manifest_version !== 3) {
      console.warn('⚠️  Warning: Using manifest version', manifest.manifest_version, '- consider upgrading to v3')
    }

    // Check for required files
    const requiredFiles = [
      'background.js',
      'content.js',
      'popup.html',
      'popup.js'
    ]

    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(process.cwd(), file))) {
        throw new Error(`Required file missing: ${file}`)
      }
    }

    // Check icons
    if (manifest.icons) {
      for (const [size, iconPath] of Object.entries(manifest.icons)) {
        if (!fs.existsSync(path.join(process.cwd(), iconPath))) {
          console.warn(`⚠️  Warning: Icon file missing: ${iconPath}`)
        }
      }
    }

    console.log('✅ Manifest validation passed!')
    console.log(`📦 Extension: ${manifest.name} v${manifest.version}`)
    
    return true
  } catch (error) {
    console.error('❌ Manifest validation failed:', error.message)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateManifest()
}

export { validateManifest }
