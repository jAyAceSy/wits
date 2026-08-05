import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import type { PrintableTransferRecord } from '../lib/types'

function BarcodeCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        displayValue: false,
        height: 60,
        width: 2,
        margin: 0,
      })
    } catch {
      // Invalid text for Code128 — leave the canvas blank rather than
      // crashing the whole render.
    }
  }, [value])

  return <canvas ref={ref} style={{ maxWidth: '100%' }} />
}

/**
 * The visual content of one 100mm x 150mm pallet label. Used both by
 * the hidden print sheet (PrintLabelSheet) and the on-screen preview
 * modal, so the two can never visually drift apart.
 *
 * Sizing note: this now carries 9 info rows plus header/barcode/footer
 * in a fixed 150mm height. Every size below was deliberately tightened
 * (not just guessed) to leave headroom rather than exactly fit — if you
 * add more rows later, shrink further rather than letting this overflow
 * the fixed label size again.
 */
export function PalletLabelCard({
  record,
  companyName = 'SCPA - DAVAO BRANCH',
}: {
  record: PrintableTransferRecord
  companyName?: string
}) {
  return (
    <div
      style={{
        width: '100mm',
        height: '150mm',
        boxSizing: 'border-box',
        padding: '4mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        color: '#000',
        overflow: 'hidden', // safety net: clip rather than bleed past the label if content ever runs long
      }}
    >
      <div style={{ textAlign: 'center', borderBottom: '1.5px solid #000', paddingBottom: '1.5mm', flexShrink: 0 }}>
        <div style={{ fontSize: '13pt', fontWeight: 800, letterSpacing: '0.3px', lineHeight: 1.15 }}>{companyName}</div>
        <div style={{ fontSize: '9pt', fontWeight: 600, marginTop: '0.5mm' }}>{record.destination_warehouse}</div>
      </div>

      <div style={{ textAlign: 'center', margin: '2mm 0', flexShrink: 0 }}>
        <div style={{ fontSize: '7.5pt', fontWeight: 700, marginBottom: '0.5mm', textTransform: 'uppercase' }}>
          Transfer Code
        </div>
        <BarcodeCanvas value={record.transfer_barcode} />
        <div style={{ fontSize: '10.5pt', fontWeight: 800, letterSpacing: '1px', marginTop: '0.5mm' }}>
          {record.transfer_barcode}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #000', paddingTop: '1.5mm', fontSize: '9pt', flex: 1, minHeight: 0 }}>
        <LabelRow label="Item Code" value={record.item_code} />
        <LabelRow label="Description" value={record.description} />
        <LabelRow label="Quantity" value={String(record.quantity)} />
        <LabelRow label="UOM" value={record.uom} />
        <LabelRow label="Destination" value={record.destination_warehouse} />
        <LabelRow label="Prod. Date" value={record.production_date} />
        <LabelRow label="Pallet No." value={record.pallet_number} />
        <LabelRow label="Finisher" value={record.finisher} />
        <LabelRow label="QC" value={record.qc} />
      </div>

      <div
        style={{
          textAlign: 'center',
          borderTop: '1.5px solid #000',
          paddingTop: '1mm',
          fontSize: '8.5pt',
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        PLEASE HANDLE WITH CARE
      </div>
    </div>
  )
}

function LabelRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5mm 0', fontWeight: 600, lineHeight: 1.2 }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, textAlign: 'right', maxWidth: '65%' }}>{value || '—'}</span>
    </div>
  )
}
