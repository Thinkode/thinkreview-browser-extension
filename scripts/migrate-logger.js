#!/usr/bin/env node
// migrate-logger.js
// Script to automatically migrate all files to use the shared logger utility

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Files to exclude from migration
const EXCLUDE_PATTERNS = [
  'node_modules',
  'scripts/migrate-logger.js',
  'utils/logger.js',
  'utils/analytics-service.js',
  'scripts/build.js',
  'scripts/lint-manifest.js',
  'scripts/validate-manifest.js'
];

// Pattern to match old debug function definitions
const DEBUG_PATTERN = /\/\/\s*Debug\s+toggle:.*?\nconst\s+DEBUG\s*=\s*false;?\s*\nfunction\s+dbgLog\([^)]*\)\s*\{[^}]*\}\s*\nfunction\s+dbgWarn\([^)]*\)\s*\{[^}]*\}/gs;

// Pattern to match individual dbgLog/dbgWarn function definitions
const DBGLOG_PATTERN = /function\s+dbgLog\([^)]*\)\s*\{[^}]*\}/g;
const DBGWARN_PATTERN = /function\s+dbgWarn\([^)]*\)\s*\{[^}]*\}/g;
const DEBUG_CONST_PATTERN = /const\s+DEBUG\s*=\s*false;?\s*\n/g;
const DEBUG_VAR_PATTERN = /var\s+DEBUG\s*=\s*false;?\s*\n/g;

/**
 * Calculate relative path from file to utils/logger.js
 */
function getImportPath(filePath) {
  const fileDir = path.dirname(filePath);
  const relativePath = path.relative(fileDir, path.join(rootDir, 'utils', 'logger.js'));
  // Convert to forward slashes for imports
  return relativePath.replace(/\\/g, '/');
}

/**
 * Check if file should be excluded
 */
function shouldExclude(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  return EXCLUDE_PATTERNS.some(pattern => relativePath.includes(pattern));
}

/**
 * Find all JavaScript files recursively
 */
function findJSFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findJSFiles(filePath, fileList);
    } else if (file.endsWith('.js') && !shouldExclude(filePath)) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * Migrate a single file
 */
function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Check if file already has the import
  if (content.includes("from './utils/logger.js'") || 
      content.includes("from '../utils/logger.js'") ||
      content.includes("from '../../utils/logger.js'") ||
      content.includes("from '../../../utils/logger.js'")) {
    console.log(`⏭️  Skipping ${path.relative(rootDir, filePath)} - already migrated`);
    return false;
  }
  
  // Check if file has debug functions
  const hasDebugFunctions = DEBUG_PATTERN.test(content) || 
                            DBGLOG_PATTERN.test(content) || 
                            DBGWARN_PATTERN.test(content);
  
  if (!hasDebugFunctions) {
    return false;
  }
  
  // Calculate import path
  const importPath = getImportPath(filePath);
  const importStatement = `import { dbgLog, dbgWarn, dbgError } from '${importPath}';`;
  
  // Remove old debug function definitions
  // First, try to remove the full block
  content = content.replace(DEBUG_PATTERN, '');
  
  // Remove individual function definitions
  content = content.replace(DBGLOG_PATTERN, '');
  content = content.replace(DBGWARN_PATTERN, '');
  content = content.replace(DEBUG_CONST_PATTERN, '');
  content = content.replace(DEBUG_VAR_PATTERN, '');
  
  // Find the best place to insert the import
  // Look for existing imports
  const importMatch = content.match(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm);
  
  if (importMatch && importMatch.length > 0) {
    // Insert after the last import
    const lastImport = importMatch[importMatch.length - 1];
    const lastImportIndex = content.lastIndexOf(lastImport);
    const insertIndex = lastImportIndex + lastImport.length;
    content = content.slice(0, insertIndex) + '\n' + importStatement + content.slice(insertIndex);
  } else {
    // No imports found, add at the top (after any comments)
    const commentMatch = content.match(/^(\/\/.*?\n)+/);
    if (commentMatch) {
      const insertIndex = commentMatch[0].length;
      content = content.slice(0, insertIndex) + importStatement + '\n' + content.slice(insertIndex);
    } else {
      // Add at the very beginning
      content = importStatement + '\n' + content;
    }
  }
  
  modified = true;
  return { content, modified };
}

/**
 * Main migration function
 */
function main() {
  console.log('🚀 Starting logger migration...\n');
  
  const jsFiles = findJSFiles(rootDir);
  console.log(`Found ${jsFiles.length} JavaScript files to check\n`);
  
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  jsFiles.forEach(filePath => {
    try {
      const result = migrateFile(filePath);
      
      if (result === false) {
        skippedCount++;
        return;
      }
      
      if (result.modified) {
        fs.writeFileSync(filePath, result.content, 'utf8');
        console.log(`✅ Migrated: ${path.relative(rootDir, filePath)}`);
        migratedCount++;
      }
    } catch (error) {
      console.error(`❌ Error migrating ${path.relative(rootDir, filePath)}:`, error.message);
      errorCount++;
    }
  });
  
  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Migrated: ${migratedCount} files`);
  console.log(`   ⏭️  Skipped: ${skippedCount} files`);
  console.log(`   ❌ Errors: ${errorCount} files`);
  console.log('\n✨ Migration complete!');
  console.log('\n⚠️  Next steps:');
  console.log('   1. Review the migrated files');
  console.log('   2. Update utils/analytics-service.js with your GA4 Measurement ID and API Secret');
  console.log('   3. Test the extension to ensure everything works');
}

main();

