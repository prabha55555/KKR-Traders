/**
 * My Delivery Challan (job work) for a processing lot, as a printable A5/A4 HTML page (printHtml -> print dialog,
 * which also offers "Save as PDF"). It lists what goes to the dyeing unit and what it must become, and — when known —
 * the combing unit the dyed fabric goes to next, so both units can match it against their own DCs.
 */
import { getBusiness, printName } from '@/core/business';
import { formatDateIN } from '@/core/format';
import { formatDcNo } from './lotLogic';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const kg = (n) => `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`;

function partyBlock(title, unit) {
  if (!unit) return '';
  return `<div class="party"><div class="cap">${esc(title)}</div><div class="name">${esc(unit.name)}</div>${
    unit.phone ? `<div>Phone: ${esc(unit.phone)}</div>` : ''
  }${unit.address ? `<div>${esc(unit.address)}</div>` : ''}</div>`;
}

export function buildLotDcHtml(lot) {
  const rows = `<tr>
      <td class="c">1</td>
      <td>${esc(lot.grey?.description)}<div class="sub">Grey fabric</div></td>
      <td>Dyeing &rarr; Combing</td>
      <td>${esc(lot.finishedDescription)}</td>
      <td class="r">${esc(lot.grey?.rolls ?? 0)}</td>
      <td class="r">${kg(lot.grey?.qty)}</td>
    </tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(formatDcNo(lot.dcNo))}</title>
<style>
  @page { size: A5 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 6px; }
  .co { font-size: 18px; font-weight: 800; letter-spacing: .5px; }
  .muted { color: #555; font-size: 11px; }
  .tag { background: #111; color: #fff; font-weight: 700; padding: 3px 8px; font-size: 11px; display: inline-block; }
  .meta { text-align: right; }
  .meta b { font-size: 14px; }
  .parties { display: flex; gap: 10px; margin: 10px 0; }
  .party { flex: 1; border: 1px solid #bbb; padding: 6px 8px; border-radius: 4px; }
  .cap { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; font-weight: 700; }
  .name { font-weight: 700; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #999; padding: 6px; vertical-align: top; }
  th { background: #f0f0f0; font-size: 11px; text-align: left; }
  .r { text-align: right; } .c { text-align: center; }
  .sub { color: #666; font-size: 10px; }
  .note { margin-top: 8px; font-size: 11px; }
  .sign { display: flex; justify-content: space-between; margin-top: 36px; font-size: 11px; }
  .sign div { border-top: 1px solid #111; padding-top: 3px; min-width: 160px; text-align: center; }
</style></head><body>
  <div class="head">
    <div>
      <div class="co">${esc(printName())}</div>
      <div class="muted">${esc(getBusiness().address)}</div>
      ${getBusiness().phones ? `<div class="muted">Cell: ${esc(getBusiness().phones)}</div>` : ''}
      ${getBusiness().gstin ? `<div class="muted">GSTIN: ${esc(getBusiness().gstin)}</div>` : ''}
    </div>
    <div class="meta">
      <span class="tag">DELIVERY CHALLAN &middot; JOB WORK</span>
      <div style="margin-top:6px">DC No: <b>${esc(formatDcNo(lot.dcNo))}</b></div>
      <div>Date: ${esc(formatDateIN(lot.dcDate))}</div>
    </div>
  </div>
  <div class="parties">
    ${partyBlock('To (Dyeing unit)', lot.dyer)}
    ${partyBlock('After dyeing, deliver to (Combing unit)', lot.combingUnit)}
  </div>
  <table>
    <thead><tr><th class="c">S.No</th><th>Fabric sent</th><th>Process</th><th>Finished product</th><th class="r">Rolls</th><th class="r">Quantity</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="note">Material sent for job work (dyeing and combing) only &mdash; not for sale. Please quote DC No <b>${esc(
    formatDcNo(lot.dcNo),
  )}</b> on your DC when delivering.${lot.notes ? `<br>Note: ${esc(lot.notes)}` : ''}</div>
  <div class="sign"><div>Receiver's signature</div><div>For ${esc(printName())}</div></div>
</body></html>`;
}
