'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Printer, Truck, User, Calendar } from 'lucide-react'
import { BatchDelivery } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DeliveryPrintSectionProps {
  deliveries: BatchDelivery[]
  batchId: string
  batchName: string
  batchQuantity: number
  subcontractorName: string
  defaultModelName: string
  fromStateName: string
  expectedStateName: string
}

export function DeliveryPrintSection({
  deliveries,
  batchId,
  batchName,
  batchQuantity,
  subcontractorName,
  defaultModelName,
  fromStateName,
  expectedStateName,
}: DeliveryPrintSectionProps) {
  // Grouper les dates uniques de livraison (format YYYY-MM-DD)
  const uniqueDates = React.useMemo(() => {
    const dates = new Set<string>()
    deliveries.forEach((d) => {
      if (d.delivered_at) {
        dates.add(format(new Date(d.delivered_at), 'yyyy-MM-dd'))
      }
    })
    return Array.from(dates).sort((a, b) => (a < b ? 1 : -1))
  }, [deliveries])

  const [selectedDate, setSelectedDate] = React.useState<string>('all')

  const filteredDeliveries = React.useMemo(() => {
    if (selectedDate === 'all') return deliveries
    return deliveries.filter(
      (d) => format(new Date(d.delivered_at), 'yyyy-MM-dd') === selectedDate
    )
  }, [deliveries, selectedDate])

  const handlePrint = (itemsToPrint: BatchDelivery[], dateLabel: string) => {
    if (itemsToPrint.length === 0) return

    const totalQty = itemsToPrint.reduce((sum, d) => sum + (d.quantity || 0), 0)
    const shortBatchId = batchId.slice(0, 8).toUpperCase()
    const printDate = format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })

    const rowsHtml = itemsToPrint
      .map((d, index) => {
        const dDate = format(new Date(d.delivered_at), 'dd/MM/yyyy à HH:mm', { locale: fr })
        const deliverer =
          d.delivered_by_profile?.full_name ||
          d.delivered_by_profile?.email ||
          subcontractorName ||
          '—'
        const modelName = d.model?.name || defaultModelName || '—'
        const note = d.note || '—'

        return `
          <tr>
            <td style="text-align:center;">${index + 1}</td>
            <td>${dDate}</td>
            <td><strong>${modelName}</strong></td>
            <td>${deliverer}</td>
            <td style="text-align:right; font-weight:bold;">${d.quantity} pcs</td>
            <td>${note}</td>
          </tr>
        `
      })
      .join('')

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Bon de Réception - Lot #${shortBatchId}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 32px;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .title {
            font-size: 22px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0;
          }
          .subtitle {
            font-size: 13px;
            color: #4b5563;
            margin-top: 4px;
          }
          .meta-box {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 24px;
          }
          .meta-item {
            margin-bottom: 6px;
          }
          .meta-label {
            font-size: 11px;
            text-transform: uppercase;
            color: #6b7280;
            font-weight: 600;
          }
          .meta-value {
            font-size: 14px;
            font-weight: 700;
            color: #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 10px 12px;
            text-align: left;
          }
          th {
            background-color: #f3f4f6;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 11px;
            color: #374151;
          }
          .total-row td {
            background-color: #fef3c7;
            font-weight: 800;
            font-size: 14px;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            margin-top: 48px;
            page-break-inside: avoid;
          }
          .sig-box {
            border: 1px dashed #9ca3af;
            border-radius: 6px;
            padding: 16px;
            height: 130px;
          }
          .sig-title {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            color: #374151;
            margin-bottom: 4px;
          }
          .sig-sub {
            font-size: 11px;
            color: #6b7280;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #6b7280;
            border-top: 1px solid #e5e7eb;
            padding-top: 12px;
          }
          @media print {
            body { padding: 12px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">Bon de Réception</h1>
            <div class="subtitle">Suivi Sous-Traitance de Pièces</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; font-size: 15px;">Réf. Lot : #${shortBatchId}</div>
            <div class="subtitle">Date de livraison : <strong>${dateLabel}</strong></div>
            <div class="subtitle">Édité le : ${printDate}</div>
          </div>
        </div>

        <div class="meta-box">
          <div>
            <div class="meta-item">
              <div class="meta-label">Désignation du lot</div>
              <div class="meta-value">${batchName}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Transition</div>
              <div class="meta-value">${fromStateName} → ${expectedStateName}</div>
            </div>
          </div>
          <div>
            <div class="meta-item">
              <div class="meta-label">Sous-traitant</div>
              <div class="meta-value">${subcontractorName}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Quantité totale du lot</div>
              <div class="meta-value">${batchQuantity} pièces</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 45px; text-align:center;">N°</th>
              <th>Date & Heure</th>
              <th>Modèle</th>
              <th>Livré par</th>
              <th style="text-align:right;">Quantité reçue</th>
              <th>Observation / Note</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">TOTAL PIÈCES REÇUES SUR CE BON :</td>
              <td style="text-align: right;">${totalQty} pcs</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-title">Signature du Sous-traitant / Livreur</div>
            <div class="sig-sub">Nom & Signature :</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Signature du Réceptionnaire (Admin)</div>
            <div class="sig-sub">Cachet, Date & Signature :</div>
          </div>
        </div>

        <div class="footer">
          Document généré automatiquement — Lot #${shortBatchId} (${batchName})
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `

    const printWin = window.open('', '_blank', 'width=900,height=700')
    if (printWin) {
      printWin.document.open()
      printWin.document.write(html)
      printWin.document.close()
    }
  }

  if (deliveries.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        Aucune livraison déclarée pour ce lot.
      </div>
    )
  }

  const currentDateLabel =
    selectedDate === 'all'
      ? 'Toutes les dates'
      : format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy', { locale: fr })

  return (
    <div className="space-y-4">
      {/* Barre de filtre par date de livraison + bouton Imprimer Bon de Réception */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-orange-600 shrink-0" />
          <span className="text-xs font-semibold text-orange-950 dark:text-orange-200">
            Filtrer par date de livraison :
          </span>
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-[210px] h-9 bg-background text-xs font-medium">
              <SelectValue placeholder="Choisir une date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                Toutes les dates ({deliveries.length} livraisons)
              </SelectItem>
              {uniqueDates.map((dateStr) => {
                const countForDate = deliveries.filter(
                  (d) => format(new Date(d.delivered_at), 'yyyy-MM-dd') === dateStr
                ).length
                const qtyForDate = deliveries
                  .filter((d) => format(new Date(d.delivered_at), 'yyyy-MM-dd') === dateStr)
                  .reduce((s, d) => s + d.quantity, 0)
                return (
                  <SelectItem key={dateStr} value={dateStr}>
                    {format(new Date(dateStr + 'T00:00:00'), 'dd/MM/yyyy', { locale: fr })} — {qtyForDate} pcs ({countForDate})
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => handlePrint(filteredDeliveries, currentDateLabel)}
          size="sm"
          className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
        >
          <Printer className="h-4 w-4 mr-2" />
          Imprimer bon de réception ({filteredDeliveries.reduce((s, d) => s + d.quantity, 0)} pcs)
        </Button>
      </div>

      {/* Tableau des livraisons */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date de livraison</TableHead>
              <TableHead>Livré par</TableHead>
              <TableHead>Modèle</TableHead>
              <TableHead className="text-right">Quantité livrée</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Bon de réception</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDeliveries.map((d) => {
              const formattedDate = format(new Date(d.delivered_at), 'dd/MM/yyyy HH:mm', {
                locale: fr,
              })
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium whitespace-nowrap text-sm">
                    {formattedDate}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {d.delivered_by_profile?.full_name ||
                        d.delivered_by_profile?.email ||
                        subcontractorName ||
                        '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.model?.name ? (
                      <Badge variant="outline">{d.model.name}</Badge>
                    ) : (
                      defaultModelName || '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold text-orange-600 dark:text-orange-400">
                    {d.quantity} pcs
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground italic">
                    {d.note || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handlePrint([d], formattedDate)}
                    >
                      <Printer className="h-3.5 w-3.5 mr-1.5" />
                      Imprimer
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
