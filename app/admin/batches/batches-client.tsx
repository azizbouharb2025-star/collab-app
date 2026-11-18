'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, AlertTriangle, Clock, ArrowRight, Eye, Edit, Filter } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { BatchWithRelations, BatchStatus, Profile } from '@/lib/types'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BatchStatusBadge } from '@/components/shared/batch-status-badge'
import { StateBadge } from '@/components/shared/state-badge'
import { getBatchDisplayName } from '@/lib/utils'

export type BatchWithUpdates = BatchWithRelations & {
  batch_models?: Array<{ id: string; quantity: number; model: { name: string } }>
  batch_updates?: Array<{
    id: string
    quantity: number
    to_state_id: string
    created_at: string
    original_update_id: string | null
  }>
}

interface BatchesClientProps {
  initialBatches: BatchWithUpdates[]
  subcontractors: Profile[]
}

export function BatchesClient({
  initialBatches,
  subcontractors,
}: BatchesClientProps) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [subFilter, setSubFilter] = React.useState<string>('all')

  const now = new Date().getTime()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

  // Filtered batches
  const filteredBatches = React.useMemo(() => {
    return initialBatches.filter((batch) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'sent' && batch.status !== 'sent') return false
        if (statusFilter === 'open' && batch.status !== 'open') return false
        if (statusFilter === 'completed' && batch.status !== 'completed') return false
        if (statusFilter === 'closed' && batch.status !== 'closed') return false
        if (statusFilter === 'draft' && batch.status !== 'draft') return false
      }

      // Subcontractor filter
      if (subFilter !== 'all' && batch.subcontractor_id !== subFilter) {
        return false
      }

      return true
    })
  }, [initialBatches, statusFilter, subFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Lots de sous-traitance
          </h1>
          <p className="text-sm text-muted-foreground">
            Supervision, suivi des pièces et attribution aux sous-traitants
          </p>
        </div>
        <Link href="/admin/batches/new">
          <Button className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau lot
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-4 rounded-lg border shadow-sm">
        {/* Status Tabs */}
        <Tabs
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-5 w-full sm:w-auto h-auto p-1">
            <TabsTrigger value="all" className="text-xs sm:text-sm">
              Tous ({initialBatches.length})
            </TabsTrigger>
            <TabsTrigger value="sent" className="text-xs sm:text-sm">
              En envoi
            </TabsTrigger>
            <TabsTrigger value="open" className="text-xs sm:text-sm">
              En cours
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">
              Terminés
            </TabsTrigger>
            <TabsTrigger value="closed" className="text-xs sm:text-sm">
              Clos
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Subcontractor Select */}
        <div className="flex items-center gap-2 min-w-[240px]">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={subFilter} onValueChange={setSubFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filtrer par sous-traitant" />
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
      </div>

      {/* Batches Table */}
      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom du lot</TableHead>
              <TableHead>Modèle(s)</TableHead>
              <TableHead>Transition d&apos;état</TableHead>
              <TableHead>Sous-traitant</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
              <TableHead className="text-right">Traitée</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Date envoi</TableHead>
              <TableHead>Alertes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBatches.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-32 text-center text-muted-foreground"
                >
                  Aucun lot ne correspond aux critères sélectionnés.
                </TableCell>
              </TableRow>
            ) : (
              filteredBatches.map((batch) => {
                // Calculate processed quantity (ignore superseded updates)
                const validUpdates = (batch.batch_updates || []).filter(
                  (u) => !u.original_update_id
                )
                const processedQty = validUpdates.reduce(
                  (sum, u) => sum + (u.quantity || 0),
                  0
                )

                // Check Alert 1: open > 7 days without update
                let hasInactivityAlert = false
                if (batch.status === 'open' && batch.opened_at) {
                  const openedTime = new Date(batch.opened_at).getTime()
                  const latestUpdateTime = validUpdates.length > 0
                    ? Math.max(...validUpdates.map((u) => new Date(u.created_at).getTime()))
                    : openedTime

                  if (now - latestUpdateTime > sevenDaysMs) {
                    hasInactivityAlert = true
                  }
                }

                // Check Alert 2: processed != expected quantity (only for completed or closed or batches with updates)
                let hasDiscrepancyAlert = false
                if (
                  (batch.status === 'completed' || batch.status === 'closed') &&
                  processedQty !== batch.quantity
                ) {
                  hasDiscrepancyAlert = true
                } else if (
                  batch.status === 'open' &&
                  processedQty > batch.quantity
                ) {
                  hasDiscrepancyAlert = true
                }

                return (
                  <TableRow
                    key={batch.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/admin/batches/${batch.id}`)}
                  >
                    <TableCell className="font-semibold text-foreground">
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground">
                          {getBatchDisplayName(batch)}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          #{batch.id.slice(0, 8)}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {batch.batch_models && batch.batch_models.length > 0
                        ? batch.batch_models.map((bm) => bm.model?.name).filter(Boolean).join(' + ')
                        : batch.model?.name || '—'}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {batch.from_state && (
                          <StateBadge state={batch.from_state} />
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {batch.expected_state && (
                          <StateBadge state={batch.expected_state} />
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="font-medium">
                      {batch.subcontractor?.full_name ||
                        batch.subcontractor?.email ||
                        'Non assigné'}
                    </TableCell>

                    <TableCell className="text-right font-medium">
                      {batch.quantity}
                    </TableCell>

                    <TableCell className="text-right font-medium">
                      <span
                        className={
                          processedQty === batch.quantity
                            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                            : processedQty > batch.quantity
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : 'text-foreground'
                        }
                      >
                        {processedQty}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        / {batch.quantity}
                      </span>
                    </TableCell>

                    <TableCell>
                      <BatchStatusBadge status={batch.status} />
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {batch.sent_at
                        ? format(new Date(batch.sent_at), 'dd/MM/yyyy HH:mm', {
                            locale: fr,
                          })
                        : '—'}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {hasInactivityAlert && (
                          <Badge
                            variant="destructive"
                            className="w-fit text-[11px] py-0 px-2 flex items-center gap-1"
                          >
                            <Clock className="h-3 w-3" />
                            Inactif &gt; 7j
                          </Badge>
                        )}
                        {hasDiscrepancyAlert && (
                          <Badge
                            variant="outline"
                            className="w-fit text-[11px] py-0 px-2 bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800 flex items-center gap-1"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Écart qté ({processedQty}/{batch.quantity})
                          </Badge>
                        )}
                        {!hasInactivityAlert && !hasDiscrepancyAlert && (
                          <span className="text-xs text-muted-foreground">
                            Aucune
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/batches/${batch.id}`}>
                          <Button variant="ghost" size="sm" title="Voir détails">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/admin/batches/${batch.id}/edit`}>
                          <Button variant="ghost" size="sm" title="Modifier">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
