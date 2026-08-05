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
        height: 75,
        width: 2.2,
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
 * Item Code / Quantity / Prod. Date / Pallet No. are the fields a
 * warehouse worker actually needs at a glance while picking/scanning,
 * so they're rendered larger than the rest.
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
        padding: '4.5mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        color: '#000',
        overflow: 'hidden', // safety net: clip rather than bleed past the label if content ever runs long
      }}
    >
      <div style={{ textAlign: 'center', borderBottom: '1.5px solid #000', paddingBottom: '2mm', flexShrink: 0 }}>
        <div style={{ fontSize: '15pt', fontWeight: 800, letterSpacing: '0.3px', lineHeight: 1.15 }}>{companyName}</div>
        <div style={{ fontSize: '10pt', fontWeight: 600, marginTop: '0.5mm' }}>{record.destination_warehouse}</div>
      </div>

      <div style={{ textAlign: 'center', margin: '2.5mm 0', flexShrink: 0 }}>
        <div style={{ fontSize: '8pt', fontWeight: 700, marginBottom: '0.5mm', textTransform: 'uppercase' }}>
          Transfer Code
        </div>
        <BarcodeCanvas value={record.transfer_barcode} />
        <div style={{ fontSize: '11pt', fontWeight: 800, letterSpacing: '1px', marginTop: '0.5mm' }}>
          {record.transfer_barcode}
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid #000',
          paddingTop: '2mm',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-evenly',
        }}
      >
        <LabelRow label="Item Code" value={record.item_code} large />
        <LabelRow label="Description" value={record.description} />
        <LabelRow label="Quantity" value={String(record.quantity)} large />
        <LabelRow label="UOM" value={record.uom} />
        <LabelRow label="Destination" value={record.destination_warehouse} />
        <LabelRow label="Prod. Date" value={record.production_date} large />
        <LabelRow label="Pallet No." value={record.pallet_number} large />
        <LabelRow label="Finisher" value={record.finisher} />
        <LabelRow label="QC" value={record.qc} />
      </div>

      <div
        style={{
          textAlign: 'center',
          borderTop: '1.5px solid #000',
          paddingTop: '1.5mm',
          fontSize: '9pt',
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        PLEASE HANDLE WITH CARE
      </div>
    </div>
  )
}

function LabelRow({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontWeight: 600,
        fontSize: large ? '13pt' : '9.5pt',
      }}
    >
      <span>{label}</span>
      <span style={{ fontWeight: 800, textAlign: 'right', maxWidth: '65%' }}>{value || '—'}</span>
    </div>
  )
}
