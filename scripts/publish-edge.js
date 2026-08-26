#!/usr/bin/env node

/**
 * Submit a new version to Microsoft Edge Add-ons via the official REST API v1.1.
 *
 * Required env:
 *   EDGE_PRODUCT_ID  Partner Center product GUID
 *   EDGE_CLIENT_ID   Publish API client ID
 *   EDGE_API_KEY     Publish API key
 *
 * Usage:
 *   node scripts/publish-edge.js path/to/extension.zip
 *
 * Optional env:
 *   EDGE_NOTES       Notes for certification (shown to Microsoft reviewers)
 */

import fs from 'fs'
import path from 'path'

const API_ROOT = 'https://api.addons.microsoftedge.microsoft.com'
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000
const PUBLISH_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 8000

function requiredEnv (name) {
  const value = (process.env[name] || '').trim()
  if (!value) {
    console.error(`❌ Missing required env: ${name}`)
    process.exit(1)
  }
  return value
}

function headers (clientId, apiKey, extra = {}) {
  return {
    Authorization: `ApiKey ${apiKey}`,
    'X-ClientID': clientId,
    ...extra
  }
}

function operationIdFromLocation (location) {
  if (!location) {
    throw new Error('API response missing Location header')
  }
  const trimmed = location.replace(/\/$/, '')
  const id = trimmed.split('/').pop()
  if (!id) {
    throw new Error(`Could not parse operation ID from Location: ${location}`)
  }
  return id
}

async function request (url, options) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // keep raw text
  }
  return { response, body, text }
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function pollOperation (url, clientId, apiKey, timeoutMs, label) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const { response, body, text } = await request(url, {
      method: 'GET',
      headers: headers(clientId, apiKey)
    })

    if (!response.ok) {
      throw new Error(`${label} status check failed (${response.status}): ${text}`)
    }

    const status = body?.status || body?.Status
    console.log(`   ${label} status: ${status || 'unknown'}`)

    if (status === 'Succeeded' || status === 'Success') {
      return body
    }
    if (status === 'Failed' || status === 'Failure') {
      const message = body?.message || body?.errorCode || JSON.stringify(body)
      throw new Error(`${label} failed: ${message}`)
    }

    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)
}

async function main () {
  const zipPath = process.argv[2]
  if (!zipPath) {
    console.error('Usage: node scripts/publish-edge.js path/to/extension.zip')
    process.exit(1)
  }

  const resolvedZip = path.resolve(zipPath)
  if (!fs.existsSync(resolvedZip)) {
    console.error('❌ Zip not found:', resolvedZip)
    process.exit(1)
  }

  const productId = requiredEnv('EDGE_PRODUCT_ID')
  const clientId = requiredEnv('EDGE_CLIENT_ID')
  const apiKey = requiredEnv('EDGE_API_KEY')
  const notes = (process.env.EDGE_NOTES || '').trim() ||
    'Automated submission from GitHub Actions. Source: https://github.com/Thinkode/thinkreview-browser-extension'

  console.log('🟦 Uploading package to Edge Add-ons draft…')
  console.log('   Product:', productId)
  console.log('   Zip:', resolvedZip)

  const zipBuffer = fs.readFileSync(resolvedZip)
  const uploadUrl = `${API_ROOT}/v1/products/${productId}/submissions/draft/package`
  const upload = await request(uploadUrl, {
    method: 'POST',
    headers: headers(clientId, apiKey, { 'Content-Type': 'application/zip' }),
    body: zipBuffer
  })

  if (upload.response.status !== 202) {
    throw new Error(`Upload rejected (${upload.response.status}): ${upload.text}`)
  }

  const uploadOperationId = operationIdFromLocation(upload.response.headers.get('Location'))
  console.log('   Upload operation:', uploadOperationId)

  await pollOperation(
    `${API_ROOT}/v1/products/${productId}/submissions/draft/package/operations/${uploadOperationId}`,
    clientId,
    apiKey,
    UPLOAD_TIMEOUT_MS,
    'Upload'
  )
  console.log('✅ Package uploaded')

  console.log('🟦 Publishing Edge Add-ons submission…')
  const publish = await request(`${API_ROOT}/v1/products/${productId}/submissions`, {
    method: 'POST',
    headers: headers(clientId, apiKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ notes })
  })

  if (publish.response.status !== 202) {
    throw new Error(`Publish rejected (${publish.response.status}): ${publish.text}`)
  }

  const publishOperationId = operationIdFromLocation(publish.response.headers.get('Location'))
  console.log('   Publish operation:', publishOperationId)

  await pollOperation(
    `${API_ROOT}/v1/products/${productId}/submissions/operations/${publishOperationId}`,
    clientId,
    apiKey,
    PUBLISH_TIMEOUT_MS,
    'Publish'
  )

  console.log('✅ Submitted to Microsoft Edge Add-ons (awaiting store review)')
}

main().catch(error => {
  console.error('❌ Edge publish failed:', error.message)
  process.exit(1)
})
