import { PalletLabelCard } from './PalletLabelCard'
import type { PalletLabel } from '../lib/types'

interface PrintLabelSheetProps {
  records: PalletLabel[]
  companyName?: string
}

/**
 * Renders one 100mm x 150mm label per record, each on its own printed
 * page (page-break-after), for a single window.print() call to send as
 * one multi-page job — this is what makes "sequential, in-order, one
 * label per pallet" possible from a browser: there is no browser API
 * for opening a raw socket to a network printer, so this relies on the
 * Honeywell PD43's installed printer driver + the OS print dialog, with
 * the page size locked to 100x150mm via @page.
 */
export function PrintLabelSheet({ records, companyName }: PrintLabelSheetProps) {
  return (
    <div className="print-label-root">
      <style>{`
        .print-label-root { display: none; }
        @media print {
          body * { visibility: hidden; }
          .print-label-root, .print-label-root * { visibility: visible; }
          .print-label-root {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
          }
          @page { size: 100mm 150mm; margin: 0; }
          .label-page {
            page-break-after: always;
          }
          .label-page:last-child { page-break-after: auto; }
        }
      `}</style>

      {records.map((r) => (
        <div key={r.id} className="label-page">
          <PalletLabelCard record={r} companyName={companyName} />
        </div>
      ))}
    </div>
  )
}
