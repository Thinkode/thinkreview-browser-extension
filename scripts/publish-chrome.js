#!/usr/bin/env node

/**
 * Submit a new version to the Chrome Web Store via the official API v2.
 *
 * Docs:
 *   https://developer.chrome.com/docs/webstore/using-api
 *   https://developer.chrome.com/docs/webstore/service-accounts
 *
 * Required:
 *   CHROME_PUBLISHER_ID   Developer Dashboard → Publisher → Settings
 *   CHROME_EXTENSION_ID   Chrome Web Store item ID
 *
 * Auth — Google Cloud service account (CI):
 *   CHROME_SERVICE_ACCOUNT_JSON   Full JSON key from Google Cloud Console
 *   Add that service account email in CWS Developer Dashboard → Account
 *
 * Usage:
 *   node scripts/publish-chrome.js path/to/extension.zip
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API_ROOT = 'https://chromewebstore.googleapis.com/v2'
const UPLOAD_ROOT = 'https://chromewebstore.googleapis.com/upload/v2'
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000
const POLL_INTERVAL_MS = 5000

function env (name) {
  return (process.env[name] || '').trim()
}

function requiredEnv (name) {
  const value = env(name)
  if (!value) {
    console.error(`❌ Missing required env: ${name}`)
    process.exit(1)
  }
  return value
}

function base64url (input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function readJsonResponse (response) {
  const text = await response.text()
  try {
    return { body: text ? JSON.parse(text) : null, text }
  } catch {
    return { body: null, text }
  }
}

function parseServiceAccountJson (raw) {
  const trimmed = raw.trim()
  let parsed
  if (trimmed.startsWith('{')) {
    parsed = JSON.parse(trimmed)
  } else if (fs.existsSync(trimmed)) {
    parsed = JSON.parse(fs.readFileSync(trimmed, 'utf8'))
  } else {
    throw new Error('CHROME_SERVICE_ACCOUNT_JSON must be the service account JSON or a path to it')
  }
  if (parsed.private_key && !parsed.private_key.includes('\n') && parsed.private_key.includes('\\n')) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
  }
  return parsed
}

function signServiceAccountJwt (serviceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    scope: CWS_SCOPE,
    aud: serviceAccount.token_uri || TOKEN_URL,
    iat: now,
    exp: now + 3600
  }
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(unsigned)
  const signature = sign.sign(serviceAccount.private_key)
  return `${unsigned}.${base64url(signature)}`
}

async function tokenFromServiceAccount (rawJson) {
  const serviceAccount = parseServiceAccountJson(rawJson)
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Service account JSON is missing client_email or private_key')
  }
  console.log(`🔐 Auth: service account ${serviceAccount.client_email}`)
  const assertion = signServiceAccountJwt(serviceAccount)
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  })
  const { body, text } = await readJsonResponse(response)
  if (!response.ok || !body?.access_token) {
    throw new Error(`Service account token exchange failed (${response.status}): ${text}`)
  }
  return body.access_token
}

async function getAccessToken () {
  return tokenFromServiceAccount(requiredEnv('CHROME_SERVICE_ACCOUNT_JSON'))
}

function itemPath (publisherId, extensionId) {
  return `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`
}

function uploadState (payload) {
  return payload?.uploadState || payload?.lastAsyncUploadState || ''
}

async function waitForUpload (token, publisherId, extensionId) {
  const started = Date.now()
  const url = `${API_ROOT}/${itemPath(publisherId, extensionId)}:fetchStatus`
  while (Date.now() - started < UPLOAD_TIMEOUT_MS) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const { body, text } = await readJsonResponse(response)
    if (!response.ok) {
      throw new Error(`fetchStatus failed (${response.status}): ${text}`)
    }
    const state = uploadState(body)
    console.log(`   Upload state: ${state || 'unknown'}`)
    if (state === 'SUCCEEDED' || state === 'SUCCESS') return body
    if (state === 'FAILED' || state === 'FAILURE') {
      throw new Error(`Chrome Web Store upload failed: ${text}`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`Chrome Web Store upload timed out after ${Math.round(UPLOAD_TIMEOUT_MS / 1000)}s`)
}

async function main () {
  const zipPath = process.argv[2]
  if (!zipPath) {
    console.error('Usage: node scripts/publish-chrome.js path/to/extension.zip')
    process.exit(1)
  }

  const resolvedZip = path.resolve(zipPath)
  if (!fs.existsSync(resolvedZip)) {
    console.error('❌ Zip not found:', resolvedZip)
    process.exit(1)
  }

  const publisherId = requiredEnv('CHROME_PUBLISHER_ID')
  const extensionId = requiredEnv('CHROME_EXTENSION_ID')
  const token = await getAccessToken()
  const resource = itemPath(publisherId, extensionId)

  console.log('🟡 Uploading package to Chrome Web Store…')
  console.log('   Publisher:', publisherId)
  console.log('   Extension:', extensionId)
  console.log('   Zip:', resolvedZip)

  const zipBuffer = fs.readFileSync(resolvedZip)
  const uploadResponse = await fetch(`${UPLOAD_ROOT}/${resource}:upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/zip',
      'x-goog-upload-protocol': 'raw'
    },
    body: zipBuffer
  })
  const uploadParsed = await readJsonResponse(uploadResponse)
  if (!uploadResponse.ok) {
    throw new Error(`Upload rejected (${uploadResponse.status}): ${uploadParsed.text}`)
  }

  const state = uploadState(uploadParsed.body)
  console.log(`   Upload response: ${state || uploadResponse.status}`)
  if (state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS') {
    await waitForUpload(token, publisherId, extensionId)
  } else if (state && state !== 'SUCCEEDED' && state !== 'SUCCESS') {
    throw new Error(`Upload did not succeed: ${uploadParsed.text}`)
  }
  console.log('✅ Package uploaded')

  console.log('🟡 Publishing Chrome Web Store submission…')
  const publishResponse = await fetch(`${API_ROOT}/${resource}:publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' })
  })
  const publishParsed = await readJsonResponse(publishResponse)
  if (!publishResponse.ok) {
    throw new Error(`Publish rejected (${publishResponse.status}): ${publishParsed.text}`)
  }

  const itemState = publishParsed.body?.state || 'submitted'
  console.log(`✅ Submitted to Chrome Web Store (state: ${itemState})`)
  if (publishParsed.body?.warningInfo?.warnings?.length) {
    for (const warning of publishParsed.body.warningInfo.warnings) {
      console.warn(`   Warning: ${warning.reason || ''} ${warning.description || ''}`)
    }
  }
}

main().catch(error => {
  console.error('❌ Chrome Web Store publish failed:', error.message)
  process.exit(1)
})
