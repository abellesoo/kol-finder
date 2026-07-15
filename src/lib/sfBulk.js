// ── SF Express bulk-shipment export (批量寄件) ────────────────────────────────
// Builds the Excel a manager uploads on SF Express HK's online bulk-order page:
// addresses are typed once per KOL in the app, then this one file creates every
// shipping order at once — SF generates the waybills to print and stick on.
// Deliberately file-based: SF's Open Platform API needs a corporate developer
// account (doesn't exist), and automating their website is brittle. A file
// upload is a feature SF supports natively.
//
// ⚠️ COLUMN MAPPING IS A PLACEHOLDER until it's matched against the real blank
// template downloaded from SF's bulk-order page (their upload validates the
// exact header text/order). To lock it in: download SF's template, then edit
// SF_BULK_COLUMNS below — headers must match SF's byte-for-byte; everything
// else in this file stays as is.

export const SF_BULK_COLUMNS = [
  { header: '收件人姓名 (Recipient Name)',    value: (k) => k.recipient_name || '' },
  { header: '收件人電話 (Recipient Phone)',   value: (k) => k.recipient_phone || '' },
  { header: '收件地址 (Recipient Address)',   value: (k) => k.recipient_address || '' },
  { header: '托寄物 (Contents)',              value: (k, c) => `${c?.brand || ''} product sample`.trim() },
  { header: '件數 (Pieces)',                  value: () => 1 },
  { header: '備註 (Remarks)',                 value: (k, c) => [c?.name, `@${k.kol_handle}`].filter(Boolean).join(' · ') },
]

// A KOL belongs in the shipping file if it has an address and hasn't already
// completed the pipeline (posted) or dropped out.
const DONE_STATES = ['posted', 'opted_out']
export function splitShippable(kols) {
  const ready = []
  const noAddress = []
  for (const k of kols || []) {
    if (DONE_STATES.includes(k.state)) continue
    if ((k.recipient_address || '').trim()) ready.push(k)
    else noAddress.push(k)
  }
  return { ready, noAddress }
}

// Download the bulk file for a campaign. Returns { exported, skipped } counts.
export async function exportSfBulkXlsx(campaign, kols) {
  const { ready, noAddress } = splitShippable(kols)
  if (!ready.length) return { exported: 0, skipped: noAddress.length }

  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([
    import('exceljs'),
    import('file-saver'),
  ])
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('SF Bulk')
  ws.addRow(SF_BULK_COLUMNS.map((c) => c.header))
  ws.getRow(1).font = { bold: true }
  for (const k of ready) {
    ws.addRow(SF_BULK_COLUMNS.map((c) => c.value(k, campaign)))
  }
  // Widths: address gets room, the rest fit their headers.
  SF_BULK_COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = /Address/.test(c.header) ? 46 : Math.max(c.header.length + 4, 14)
  })

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `sf-bulk-${(campaign?.name || 'campaign').replace(/[^\w.-]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
  )
  return { exported: ready.length, skipped: noAddress.length }
}
