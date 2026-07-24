// ── SF Express bulk-shipment export (批量寄件) ────────────────────────────────
// Builds the Excel a manager uploads on SF Express HK's online bulk-order page:
// addresses are typed once per KOL in the app, then this one file creates every
// shipping order at once — SF generates the waybills to print and stick on.
// Deliberately file-based: SF's Open Platform API needs a corporate developer
// account (doesn't exist), and automating their website is brittle. A file
// upload is a feature SF supports natively.
//
// Layout matches SF's real template 「寄快遞批量下單模板.xlsx」 exactly:
// row 1 = merged group headers, row 2 = column headers (A–BA, 53 columns,
// required ones marked *), data from row 3. Header strings below were extracted
// from the template file itself — don't retype them by hand.

// Row 1: group headers sitting over merged ranges (see SF_ROW1_MERGES).
const SF_GROUP_HEADER_ROW = [
  '',
  '寄件方信息\nSender Information', '', '', '', '', '', '', '', '',
  '收件方信息\nReceiver Information', '', '', '', '', '', '', '', '', '', '', '',
  '托寄物信息\nConsignment Information', '', '', '', '', '', '',
  '包裹信息\nParcel Information', '', '',
  '產品信息\nProduct Information',
  '付款方式\nPayment Method', '', '',
  '預約上門收件\nExpected Parcel Pick-up', '', '',
  '增值服務\nV.A.S.', '', '', '', '', '', '', '', '', '', '', '', '', '',
]
const SF_ROW1_MERGES = ['B1:J1', 'K1:V1', 'W1:AC1', 'AD1:AF1', 'AH1:AJ1', 'AK1:AL1', 'AN1:AZ1']

// Row 2: the 53 column headers, A → BA. (AJ's trailing space is in SF's file.)
const SF_HEADER_ROW = [
  '客戶訂單編號\nCustomer Order I.D.',
  '* 姓名\nFull Name', '* 電話區號\nArea Code', '手機號碼\nMobile No.', '固網號碼\nFixed No.',
  '公司名稱\nCompany', '* 城市\nCity', '* 地區\nDistrict', '* 區域\nArea', '* 詳細地址\nDetail Address',
  '* 姓名\nFull Name', '* 電話區號\nArea Code', '手機號碼\nMobile No.', '固網號碼\nFixed No.',
  '公司名稱\nCompany', '自取點編號\nSelf Pick-up Point', '省份 / 城市\nProvince / City',
  '市 / 縣 / 地區\nCity / County / District', '區 / 區域\nDistrict / Area', '詳細地址\nDetail Address',
  '證件類型\nI.D. Type', '證件號碼\nI.D. No.',
  '* 物品名稱 / 類型\nItem Name', '* 重量（KG）\nWeight (KG)', '數量\nQuantity', '單位\nUnit',
  '物品單價\nValue', '幣種\nCurrency', '原產地\nOrigin',
  '* 包裹總重量（KG）\nTotal Weight (KG)', '* 包裹數量（子母件數量）\nParcel Quantity (num. of multi-piece shipments)',
  '包裹備註\nParcel Notes',
  '* 產品類型\nProduct Type',
  '* 付款方式\nPayment Method', '稅金付款方式\nDuties and Taxes', '稅金付款帳號\nBill Account for Duties and Taxes ',
  '日期（年-月-日）\nDate (YYYY-MM-DD)', '時間（時:分）\nTime (HH:MM)', '備註\nRemark',
  '保價-物品價值（HKD）\nInsurance（HKD）', 'PoD 簽單返還\nPoD', 'PoD 備註\nPoD - Remark',
  '密碼認證\nSecret Key', 'CoD 代收貨款\nCoD - Amount', 'CoD 代收貨款 - 月結號\nCoD - Credit A/C No.',
  '送貨方式\nDelivery method', '送貨上樓 - 行樓梯層數\nUpstairs Delivery - Floor level',
  '心意送 - 賀卡\nSurprise Delivery - Greeting e-cards', '心意送 - 賀卡祝福語\nSurprise Delivery - Greeting message',
  '心意送 - 賀卡署名\nSurprise Delivery - Signature',
  '定時派送 - 日期（年-月-日）\nFixed Time Delivery - Date (YYYY-MM-DD)',
  '定時派送 - 時間（時:分）\nFixed Time Delivery - Time (HH:MM)',
  '收件校驗碼\nRecipient Verification Code',
]

// A..BA column letters → 0-based index into the 53-wide row.
function colIdx(letters) {
  let n = 0
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

// ── Markato sender details — SF requires these on EVERY row (the * sender
// columns). The values are personal data (a name + mobile number) and this
// repo is PUBLIC, so they are deliberately NOT hardcoded: each manager enters
// them once (the small sender form behind the "SF bulk file" button) and they
// persist in that browser's localStorage only.
const SENDER_KEY = 'sf_bulk_sender'
const EMPTY_SENDER = {
  name: '',                    // * 姓名
  areaCode: '852',             // * 電話區號 (852 / 853 / 86)
  mobile: '',                  // 手機號碼
  company: 'Markato',
  city: '香港/Hong Kong',      // * 城市 — dropdown value: 香港/Hong Kong or 澳門/Macau
  district: '',                // * 地區 — e.g. 南區
  area: '',                    // * 區域 — e.g. 黃竹坑
  address: '',                 // * 詳細地址
}
export function getSfSender() {
  try {
    return { ...EMPTY_SENDER, ...(JSON.parse(localStorage.getItem(SENDER_KEY) || 'null') || {}) }
  } catch {
    return { ...EMPTY_SENDER }
  }
}
export function saveSfSender(profile) {
  const merged = { ...getSfSender(), ...profile }
  localStorage.setItem(SENDER_KEY, JSON.stringify(merged))
  return merged
}
export function sfSenderComplete(s = getSfSender()) {
  return !!(s.name && s.mobile && s.district && s.area && s.address)
}

// The team's standard shipment (from their usual 寄快遞 flow): 護膚品, 1 kg,
// 1 item, 順豐特快, paid on the Markato monthly account. productType/payment
// must be SF dropdown options (元素 Info sheet).
export const SF_DEFAULTS = {
  itemName: '護膚品',
  productType: '順豐特快/SF Speedy Express',
  payment: '寄付月結/Pay by Sender (Credit Account)',
  weightKg: 1,
  quantity: 1,
}

// Receiver locale by campaign market. (Cross-border TW shipments may also need
// I.D. type/number — columns U/V — which the app doesn't collect; HK needs none.)
const RECEIVER_AREA_CODE = { HK: '852', TW: '886', MO: '853', CN: '86' }
const RECEIVER_CITY = { HK: '香港', TW: '台灣', MO: '澳門' }

// Guard against CSV/formula injection: prefix any string starting with a
// formula/control character so Excel treats it as literal text. Recipient
// name/address and the campaign name are DB/user-controlled and land in cells
// unescaped otherwise. Mirrors sanitizeCell in exportCsv.js.
function sanitizeCell(v) {
  if (typeof v !== 'string') return v
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

function buildSfRow(k, campaign, sender) {
  const market = String(campaign?.market || 'HK').toUpperCase()
  const row = new Array(SF_HEADER_ROW.length).fill('')
  const set = (letters, v) => { row[colIdx(letters)] = v == null ? '' : sanitizeCell(v) }

  set('A', `@${k.kol_handle}`) // customer order id → maps the waybill back to the KOL
  // Sender (Markato)
  set('B', sender.name)
  set('C', sender.areaCode)
  set('D', sender.mobile)
  set('F', sender.company)
  set('G', sender.city)
  set('H', sender.district)
  set('I', sender.area)
  set('J', sender.address)
  // Receiver (the KOL)
  set('K', k.recipient_name || '')
  set('L', RECEIVER_AREA_CODE[market] || '852')
  set('M', String(k.recipient_phone || '').replace(/\D/g, ''))
  set('Q', RECEIVER_CITY[market] || '香港')
  set('R', k.recipient_district || '')
  set('S', k.recipient_area || '')
  set('T', k.recipient_address || '')
  // Consignment + parcel
  set('W', SF_DEFAULTS.itemName)
  set('X', SF_DEFAULTS.weightKg)
  set('Y', SF_DEFAULTS.quantity)
  set('AD', SF_DEFAULTS.weightKg)
  set('AE', 1)
  set('AF', [campaign?.name, `@${k.kol_handle}`].filter(Boolean).join(' · '))
  // Product + payment
  set('AG', SF_DEFAULTS.productType)
  set('AH', SF_DEFAULTS.payment)
  return row
}

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
export async function exportSfBulkXlsx(campaign, kols, sender = getSfSender()) {
  const { ready, noAddress } = splitShippable(kols)
  if (!ready.length) return { exported: 0, skipped: noAddress.length }

  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([
    import('exceljs'),
    import('file-saver'),
  ])
  const wb = new ExcelJS.Workbook()
  // Same sheet name as SF's template.
  const ws = wb.addWorksheet('運單訊息內容 Order Content')
  ws.addRow(SF_GROUP_HEADER_ROW)
  ws.addRow(SF_HEADER_ROW)
  for (const ref of SF_ROW1_MERGES) ws.mergeCells(ref)
  ws.getRow(1).font = { bold: true }
  ws.getRow(2).font = { bold: true }
  ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  ws.getRow(2).alignment = { vertical: 'middle', wrapText: true }
  for (const k of ready) ws.addRow(buildSfRow(k, campaign, sender))
  // Give the text-heavy columns room; phone columns stay text-safe as strings.
  for (const letters of ['B', 'J', 'K', 'T', 'W', 'AF']) ws.getColumn(colIdx(letters) + 1).width = 34
  for (const letters of ['A', 'G', 'H', 'I', 'Q', 'R', 'S', 'AG', 'AH']) ws.getColumn(colIdx(letters) + 1).width = 18

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `sf-bulk-${(campaign?.name || 'campaign').replace(/[^\w.-]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
  )
  return { exported: ready.length, skipped: noAddress.length }
}
