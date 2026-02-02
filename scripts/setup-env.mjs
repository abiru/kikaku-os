#!/usr/bin/env node
/**
 * Environment Setup Script
 * Copies example env files to their actual locations if they don't exist
 */

import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const envFiles = [
  {
    source: join(root, '.dev.vars.example'),
    target: join(root, '.dev.vars'),
    name: 'API .dev.vars'
  },
  {
    source: join(root, 'apps', 'storefront', '.env.example'),
    target: join(root, 'apps', 'storefront', '.env'),
    name: 'Storefront .env'
  }
]

console.log('\n🔧 Kikaku OS - Environment Setup\n')

let created = 0
let skipped = 0

for (const { source, target, name } of envFiles) {
  if (!existsSync(source)) {
    console.log(`⚠️  ${name}: source template not found (${source})`)
    continue
  }

  if (existsSync(target)) {
    console.log(`✓  ${name}: already exists (skipped)`)
    skipped++
  } else {
    copyFileSync(source, target)
    console.log(`✅ ${name}: created from template`)
    created++
  }
}

console.log('\n---')
console.log(`Created: ${created}, Skipped: ${skipped}`)

if (created > 0) {
  console.log('\n📝 Next steps:')
  console.log('   1. Edit .dev.vars with your Stripe keys')
  console.log('   2. Edit apps/storefront/.env with your Clerk keys')
  console.log('   3. Run: pnpm install')
  console.log('   4. Run: pnpm db:migrate')
  console.log('   5. Run: pnpm dev')
}

console.log('')
