// Campaign brief ⇄ structured fields. The brief is authored as ONE freeform box;
// 自動整理 (parseBrief in apifyApi.js) rewrites it into this labelled format, and
// briefToFields() parses it back out so scoring gets structured fields. Lifted
// verbatim from ConfigStep so the campaign editor can reuse the same tidy.

// Assemble structured brief fields into the labelled text the DM prompt expects.
// Empty fields are dropped so a half-filled brief stays clean. Selling points are
// one per line, each with a ・ bullet (existing bullet chars stripped first).
export function assembleBrief(f) {
  const lines = []
  if ((f.brandName || '').trim()) lines.push(`品牌：${f.brandName.trim()}`)
  if ((f.brandBackground || '').trim()) lines.push(`品牌背景：${f.brandBackground.trim()}`)
  if ((f.newProduct || '').trim()) lines.push(`新品：${f.newProduct.trim()}`)
  if ((f.collabFormat || '').trim()) lines.push(`合作形式：${f.collabFormat.trim()}`)
  const blocks = (f.products || [])
    .filter((p) => (p.name || '').trim() || (p.points || '').trim())
    .map((p) => {
      const pts = (p.points || '')
        .split('\n')
        .map((s) => s.trim().replace(/^[・·•\-\s]+/, ''))
        .filter(Boolean)
        .map((s) => `・${s}`)
      return [`【${(p.name || '').trim()}】`, ...pts].join('\n')
    })
  if (blocks.length) {
    lines.push('產品詳情：')
    lines.push(blocks.join('\n'))
  }
  if ((f.briefNotes || '').trim()) lines.push(f.briefNotes.trim())
  return lines.join('\n')
}

// Inverse of assembleBrief: pull the structured fields back out of the labelled
// brief text. Unlabelled lines fall through to briefNotes, so a freeform
// un-tidied brief loses nothing.
export function briefToFields(text) {
  const f = { brandName: '', brandBackground: '', newProduct: '', collabFormat: '', products: [], briefNotes: '' }
  let inProducts = false
  let current = null
  const notes = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let m
    if ((m = line.match(/^品牌[：:]\s*(.*)$/))) { f.brandName = m[1]; inProducts = false; continue }
    if ((m = line.match(/^品牌背景[：:]\s*(.*)$/))) { f.brandBackground = m[1]; inProducts = false; continue }
    if ((m = line.match(/^新品[：:]\s*(.*)$/))) { f.newProduct = m[1]; inProducts = false; continue }
    if ((m = line.match(/^合作形式[：:]\s*(.*)$/))) { f.collabFormat = m[1]; inProducts = false; continue }
    if (/^產品詳情[：:]?$/.test(line)) { inProducts = true; current = null; continue }
    if ((m = line.match(/^【(.+)】$/))) { current = { name: m[1], points: '' }; f.products.push(current); inProducts = true; continue }
    if (inProducts && current && /^[・·•\-]/.test(line)) {
      const pt = line.replace(/^[・·•\-\s]+/, '')
      current.points = current.points ? `${current.points}\n${pt}` : pt
      continue
    }
    notes.push(line)
  }
  f.briefNotes = notes.join('\n')
  if (!f.products.length) f.products = [{ name: '', points: '' }]
  return f
}
