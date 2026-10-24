const ABBREVIATIONS: Record<string, string> = { mohd: 'mohammed', md: 'mohammed', mohd_: 'mohammed' }

export function basicName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function normaliseName(s: string): string {
  return basicName(s)
    .replace(/[.,]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((t) => ABBREVIATIONS[t] ?? t)
    .join(' ')
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aM = new Array<boolean>(a.length).fill(false)
  const bM = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range)
    const hi = Math.min(i + range + 1, b.length)
    for (let j = lo; j < hi; j++) {
      if (bM[j] || a[i] !== b[j]) continue
      aM[i] = bM[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0
  let t = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aM[i]) continue
    while (!bM[k]) k++
    if (a[i] !== b[k]) t++
    k++
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3
  let prefix = 0
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

export function nameSimilarity(a: string, b: string): number {
  return jaroWinkler(normaliseName(a), normaliseName(b))
}
