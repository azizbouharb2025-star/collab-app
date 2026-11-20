'use client'

import * as React from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Printer,
  Truck,
  User,
  Calendar,
  Filter,
  CheckSquare,
  Square,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AppModel, Batch, BatchDelivery, Profile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { getBatchDisplayName } from '@/lib/utils'

type DeliveryWithFullRelations = BatchDelivery & {
  batch?: (Batch & {
    subcontractor?: Profile | null
    model?: AppModel | null
    batch_models?: Array<{ id: string; quantity: number; model?: AppModel | null }>
  }) | null
}

export default function AdminDeliveriesPage() {
  const supabase = React.useMemo(() => createClient(), [])

  const [deliveries, setDeliveries] = React.useState<DeliveryWithFullRelations[]>([])
  const [subcontractors, setSubcontractors] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)

  // Filtres : Date de livraison (par défaut : aujourd'hui ou toutes), Sous-traitant
  const [selectedDate, setSelectedDate] = React.useState<string>('')
  const [selectedSubcontractorId, setSelectedSubcontractorId] = React.useState<string>('all')

  // Sélection manuelle de lignes pour imprimer plusieurs livraisons de plusieurs lots sur un seul bon
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: delivData }, { data: subsData }] = await Promise.all([
        supabase
          .from('batch_deliveries')
          .select(`
            *,
            delivered_by_profile:profiles!delivered_by(id, full_name, email),
            model:models(*),
            batch:batches(
              *,
              model:models(*),
              subcontractor:profiles!batches_subcontractor_id_fkey(id, full_name, email),
              batch_models(id, quantity, model:models(*))
            )
          `)
          .order('delivered_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'subcontractor')
          .order('full_name'),
      ])

      const list = (delivData || []) as DeliveryWithFullRelations[]
      setDeliveries(list)
      setSubcontractors((subsData || []) as Profile[])
    } catch (err) {
      console.error('Erreur chargement livraisons:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // Dates de livraison disponibles
  const uniqueDates = React.useMemo(() => {
    const set = new Set<string>()
    deliveries.forEach((d) => {
      if (d.delivered_at) {
        set.add(format(new Date(d.delivered_at), 'yyyy-MM-dd'))
      }
    })
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1))
  }, [deliveries])

  // Livraisons filtrées par date et sous-traitant
  const filteredDeliveries = React.useMemo(() => {
    return deliveries.filter((d) => {
      if (selectedDate) {
        const dDate = format(new Date(d.delivered_at), 'yyyy-MM-dd')
        if (dDate !== selectedDate) return false
      }
      if (selectedSubcontractorId !== 'all') {
        const subId = d.batch?.subcontractor_id || d.delivered_by
        if (subId !== selectedSubcontractorId) return false
      }
      return true
    })
  }, [deliveries, selectedDate, selectedSubcontractorId])

  // Synchroniser la sélection par défaut avec les éléments filtrés quand les filtres changent
  React.useEffect(() => {
    setSelectedIds(new Set(filteredDeliveries.map((d) => d.id)))
  }, [filteredDeliveries])

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDeliveries.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDeliveries.map((d) => d.id)))
    }
  }

  // Livraisons cochées pour l'impression groupée
  const itemsToPrint = React.useMemo(() => {
    return filteredDeliveries.filter((d) => selectedIds.has(d.id))
  }, [filteredDeliveries, selectedIds])

  const totalPiecesToPrint = React.useMemo(() => {
    return itemsToPrint.reduce((sum, d) => sum + (d.quantity || 0), 0)
  }, [itemsToPrint])

  const distinctBatchesCount = React.useMemo(() => {
    return new Set(itemsToPrint.map((d) => d.batch_id)).size
  }, [itemsToPrint])

  // Impression d'un bon de réception multi-lots
  const handlePrintReceipt = (list: DeliveryWithFullRelations[]) => {
    if (list.length === 0) return

    const totalQty = list.reduce((sum, d) => sum + (d.quantity || 0), 0)
    const uniqueBatchIds = new Set(list.map((d) => d.batch_id))
    const printDate = format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })

    const dateLabel = selectedDate
      ? format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy', { locale: fr })
      : uniqueDates.length === 1
      ? format(new Date(uniqueDates[0] + 'T00:00:00'), 'dd/MM/yyyy', { locale: fr })
      : 'Toutes dates sélectionnées'

    // Sous-traitants concernés sur ce bon
    const delivererNames = Array.from(
      new Set(
        list.map(
          (d) =>
            d.delivered_by_profile?.full_name ||
            d.batch?.subcontractor?.full_name ||
            d.delivered_by_profile?.email ||
            'Sous-traitant'
        )
      )
    ).join(', ')

    // Récapitulatif par modèle
    const summaryByModel: Record<string, number> = {}
    list.forEach((d) => {
      const mName =
        d.model?.name ||
        (d.batch?.batch_models && d.batch.batch_models.length > 0
          ? d.batch.batch_models.map((bm) => bm.model?.name).filter(Boolean).join(' + ')
          : d.batch?.model?.name) ||
        'Standard'
      summaryByModel[mName] = (summaryByModel[mName] || 0) + (d.quantity || 0)
    })

    const summaryBadgesHtml = Object.entries(summaryByModel)
      .map(
        ([mName, qty]) =>
          `<span style="display:inline-block; background:#f3f4f6; border:1px solid #d1d5db; border-radius:4px; padding:4px 10px; margin-right:8px; margin-bottom:6px; font-size:12px;"><strong>${mName}</strong> : ${qty} pcs</span>`
      )
      .join('')

    const rowsHtml = list
      .map((d, idx) => {
        const dDate = format(new Date(d.delivered_at), 'dd/MM/yyyy HH:mm', { locale: fr })
        const shortBatch = d.batch_id.slice(0, 8).toUpperCase()
        const lotName = d.batch ? getBatchDisplayName(d.batch) : `Lot #${shortBatch}`
        const modelName =
          d.model?.name ||
          (d.batch?.batch_models && d.batch.batch_models.length > 0
            ? d.batch.batch_models.map((bm) => bm.model?.name).filter(Boolean).join(' + ')
            : d.batch?.model?.name) ||
          '—'
        const deliverer =
          d.delivered_by_profile?.full_name ||
          d.batch?.subcontractor?.full_name ||
          d.delivered_by_profile?.email ||
          '—'
        const note = d.note || '—'

        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td>${dDate}</td>
            <td>
              <strong>${lotName}</strong>
              <div style="font-size:11px; color:#6b7280; font-family:monospace;">#${shortBatch}</div>
            </td>
            <td><strong>${modelName}</strong></td>
            <td>${deliverer}</td>
            <td style="text-align:right; font-weight:800; font-size:14px;">${d.quantity} pcs</td>
            <td>${note}</td>
          </tr>
        `
      })
      .join('')

    const receiptNum = `BR-${format(new Date(), 'yyyyMMdd-HHmm')}`

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Bon de Réception ${receiptNum}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 32px;
            font-size: 13px;
            line-height: 1.45;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 24px;
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
            margin-bottom: 20px;
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
            margin-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 9px 11px;
            text-align: left;
            vertical-align: top;
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
          .summary-box {
            margin-bottom: 24px;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            margin-top: 40px;
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
            margin-top: 36px;
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
            <div class="subtitle">Réception de pièces sous-traitées (Multi-Lots)</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-size: 15px;">N° ${receiptNum}</div>
            <div class="subtitle">Date de livraison : <strong>${dateLabel}</strong></div>
            <div class="subtitle">Édité le : ${printDate}</div>
          </div>
        </div>

        <div class="meta-box">
          <div>
            <div class="meta-label">Sous-traitant(s) / Livreur(s)</div>
            <div class="meta-value">${delivererNames}</div>
            <div class="meta-label">Nombre de lots concernés</div>
            <div class="meta-value">${uniqueBatchIds.size} lot(s) (${list.length} livraison(s))</div>
          </div>
          <div>
            <div class="meta-label">Date de réception filtrée</div>
            <div class="meta-value">${dateLabel}</div>
            <div class="meta-label">Total général des pièces reçues</div>
            <div class="meta-value" style="color:#c2410c; font-size:16px;">${totalQty} pièces</div>
          </div>
        </div>

        <div class="summary-box">
          <div class="meta-label" style="margin-bottom:6px;">Récapitulatif par modèle :</div>
          <div>${summaryBadgesHtml}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 40px; text-align:center;">N°</th>
              <th>Date & Heure</th>
              <th>Lot</th>
              <th>Modèle</th>
              <th>Livré par</th>
              <th style="text-align:right;">Quantité reçue</th>
              <th>Observation / Note</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="5" style="text-align: right;">TOTAL GÉNÉRAL DES PIÈCES REÇUES SUR CE BON :</td>
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
          Bon de réception ${receiptNum} — Généré depuis l'espace Administrateur
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `

    const printWin = window.open('', '_blank', 'width=950,height=750')
    if (printWin) {
      printWin.document.open()
      printWin.document.write(html)
      printWin.document.close()
    }
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl space-y-6">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Truck className="h-7 w-7 text-orange-600" />
            <span>Livraisons & Bons de Réception</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filtrez par date de livraison ou par sous-traitant et imprimez un seul bon de réception regroupant plusieurs lots.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button
            onClick={() => handlePrintReceipt(itemsToPrint)}
            disabled={itemsToPrint.length === 0}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold shadow"
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimer Bon de Réception ({itemsToPrint.length} livr. / {totalPiecesToPrint} pcs)
          </Button>
        </div>
      </div>

      {/* Barre de filtres */}
      <Card className="border-orange-200 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/10">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            {/* Filtre par date de livraison */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-orange-600" />
                Date de livraison
              </label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-background h-9 text-sm"
                />
                {selectedDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate('')}
                    className="h-9 px-2.5 text-xs"
                  >
                    Toutes
                  </Button>
                )}
              </div>
              {uniqueDates.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedDate('')}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                      !selectedDate
                        ? 'bg-orange-600 text-white border-orange-600 font-semibold'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Toutes les dates
                  </button>
                  {uniqueDates.slice(0, 6).map((dStr) => (
                    <button
                      key={dStr}
                      type="button"
                      onClick={() => setSelectedDate(dStr)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                        selectedDate === dStr
                          ? 'bg-orange-600 text-white border-orange-600 font-semibold'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {format(new Date(dStr + 'T00:00:00'), 'dd/MM/yyyy', { locale: fr })}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filtre par sous-traitant */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-orange-600" />
                Sous-traitant
              </label>
              <Select value={selectedSubcontractorId} onValueChange={setSelectedSubcontractorId}>
                <SelectTrigger className="bg-background h-9 text-sm">
                  <SelectValue placeholder="Tous les sous-traitants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les sous-traitants</SelectItem>
                  {subcontractors.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.full_name || sub.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Résumé de la sélection à imprimer */}
            <div className="rounded-lg bg-background p-3 border flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">
                  Sélection sur le bon
                </p>
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {distinctBatchesCount} lot(s) • {itemsToPrint.length} livraison(s)
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">
                  Total pièces
                </p>
                <p className="text-lg font-extrabold text-orange-600 dark:text-orange-400">
                  {totalPiecesToPrint} pcs
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tableau des livraisons multi-lots */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                Liste des livraisons ({filteredDeliveries.length})
              </CardTitle>
              <CardDescription>
                Cochez ou décochez les livraisons de différents lots à regrouper sur le même bon de réception
              </CardDescription>
            </div>
            {filteredDeliveries.length > 0 && (
              <Button variant="outline" size="sm" onClick={toggleSelectAll} className="text-xs h-8">
                {selectedIds.size === filteredDeliveries.length
                  ? 'Tout décocher'
                  : 'Tout sélectionner'}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Aucune livraison trouvée pour les critères sélectionnés.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="inline-flex items-center justify-center text-primary"
                        title="Tout sélectionner / désélectionner"
                      >
                        {selectedIds.size === filteredDeliveries.length &&
                        filteredDeliveries.length > 0 ? (
                          <CheckSquare className="h-4 w-4 text-orange-600" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>Date & Heure</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Modèle</TableHead>
                    <TableHead>Livré par</TableHead>
                    <TableHead className="text-right">Quantité livrée</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.map((d) => {
                    const isChecked = selectedIds.has(d.id)
                    const shortBatch = d.batch_id.slice(0, 8).toUpperCase()
                    const lotTitle = d.batch ? getBatchDisplayName(d.batch) : `Lot #${shortBatch}`
                    const modelName =
                      d.model?.name ||
                      (d.batch?.batch_models && d.batch.batch_models.length > 0
                        ? d.batch.batch_models.map((bm) => bm.model?.name).filter(Boolean).join(' + ')
                        : d.batch?.model?.name) ||
                      '—'

                    return (
                      <TableRow
                        key={d.id}
                        className={isChecked ? 'bg-orange-50/40 dark:bg-orange-950/15' : ''}
                      >
                        <TableCell className="text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectOne(d.id)}
                            className="inline-flex items-center justify-center"
                          >
                            {isChecked ? (
                              <CheckSquare className="h-4 w-4 text-orange-600" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </TableCell>

                        <TableCell className="font-medium whitespace-nowrap text-sm">
                          {format(new Date(d.delivered_at), 'dd/MM/yyyy HH:mm', { locale: fr })}
                        </TableCell>

                        <TableCell>
                          <Link
                            href={`/admin/batches/${d.batch_id}`}
                            className="inline-flex items-center gap-1 font-semibold text-sm text-primary hover:underline"
                          >
                            <span>{lotTitle}</span>
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </Link>
                          <div className="text-[11px] font-mono text-muted-foreground">
                            #{shortBatch}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {modelName}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-sm">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            {d.delivered_by_profile?.full_name ||
                              d.batch?.subcontractor?.full_name ||
                              d.delivered_by_profile?.email ||
                              '—'}
                          </span>
                        </TableCell>

                        <TableCell className="text-right font-bold text-orange-600 dark:text-orange-400">
                          {d.quantity} pcs
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground italic max-w-[200px] truncate">
                          {d.note || '—'}
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handlePrintReceipt([d])}
                          >
                            <Printer className="h-3.5 w-3.5 mr-1" />
                            Bon seul
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
