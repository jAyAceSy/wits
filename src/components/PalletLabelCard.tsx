import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import type { PalletLabel } from '../lib/types'

function BarcodeCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        displayValue: false,
        height: 90,
        width: 2.4,
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
 */
export function PalletLabelCard({
  record,
  companyName = 'SCPA Hygiene Products Inc.',
}: {
  record: PalletLabel
  companyName?: string
}) {
  return (
    <div
      style={{
        width: '100mm',
        height: '150mm',
        boxSizing: 'border-box',
        padding: '5mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        color: '#000',
      }}
    >
      <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '3mm' }}>
        <div style={{ fontSize: '16pt', fontWeight: 800, letterSpacing: '0.5px' }}>{companyName}</div>
        <div style={{ fontSize: '11pt', fontWeight: 600, marginTop: '1mm' }}>{record.destination_warehouse}</div>
      </div>

      <div style={{ textAlign: 'center', margin: '4mm 0', flexShrink: 0 }}>
        <div style={{ fontSize: '9pt', fontWeight: 700, marginBottom: '1mm', textTransform: 'uppercase' }}>
          Transfer Code
        </div>
        <BarcodeCanvas value={record.transfer_barcode} />
        <div style={{ fontSize: '13pt', fontWeight: 800, letterSpacing: '2px', marginTop: '1mm' }}>
          {record.transfer_barcode}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #000', paddingTop: '3mm', fontSize: '11pt', flex: 1 }}>
        <LabelRow label="Item Code" value={record.item_code} />
        <LabelRow label="Description" value={record.description} />
        <LabelRow label="Quantity" value={String(record.quantity)} />
        <LabelRow label="UOM" value={record.uom} />
        <LabelRow label="Destination" value={record.destination_warehouse} />
        <LabelRow label="Prod. Date" value={record.production_date} />
        <LabelRow label="Pallet No." value={record.pallet_number} />
      </div>

      <div
        style={{
          textAlign: 'center',
          borderTop: '2px solid #000',
          paddingTop: '2mm',
          fontSize: '10pt',
          fontWeight: 800,
        }}
      >
        PLEASE HANDLE WITH CARE
      </div>
    </div>
  )
}

function LabelRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1mm 0', fontWeight: 600 }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, textAlign: 'right', maxWidth: '65%' }}>{value}</span>
    </div>
  )
}
