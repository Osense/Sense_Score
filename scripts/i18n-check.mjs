// 영어 사전 점검: 소스의 L("한국어") 키 중 src/i18n/en.ts에 없는 것을 보여 준다.
// 쓰는 법: node scripts/i18n-check.mjs   (빠진 게 있으면 종료 코드 1)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const files = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('src/i18n/'))
const re = /\bL\(\s*("(?:[^"\\]|\\.)*")/g
const keys = new Map()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(re)) keys.set(JSON.parse(m[1]), f)
}
const en = readFileSync('src/i18n/en.ts', 'utf8')
const have = new Set([...en.matchAll(/^\s*("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1])))
const missing = [...keys].filter(([k]) => !have.has(k))
const unused = [...have].filter((k) => !keys.has(k))
for (const [k, f] of missing) console.log(`빠짐  ${f}  ${JSON.stringify(k)}`)
console.log(`키 ${keys.size}개 · 사전 ${have.size}개 · 빠짐 ${missing.length}개 · 안 쓰임 ${unused.length}개`)
process.exit(missing.length ? 1 : 0)
