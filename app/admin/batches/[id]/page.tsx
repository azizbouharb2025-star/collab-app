import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Clock, Calendar, AlertCircle, Wrench } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { createClient } from '@/lib/supabase/server'
import { ErrorMessage } from '@/components/shared/error-message'
import { BatchStatusBadge } from '@/components/shared/batch-status-badge'
import { StateBadge } from '@/components/shared/state-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BatchActions } from './batch-actions'
import { BatchWithRelations, BatchUpdateWithRelations, Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface BatchDetailPageProps {
  params: {
    id: string
  }
}

type UpdateDetail = BatchUpdateWithRelations & {
  corrector?: Profile | null
  original_update_id?: string | null
}

export default async function BatchDetailPage({ params }: BatchDetailPageProps) {
  const supabase = await createClient()

  const { data: batchData, error } = await supabase
    .from('batches')
    .select(`
      *,
      model:models(*),
      from_state:states!batches_from_state_id_fkey(*),
      expected_state:states!batches_expected_state_id_fkey(*),
      subcontractor:profiles!batches_subcontractor_id_fkey(*),
      batch_models(
        id,
        quantity,
        model:models(*)
      ),
      batch_updates(
        *,
        model:models(*),
        to_state:states!batch_updates_to_state_id_fkey(*),
        corrector:profiles!batch_updates_corrected_by_fkey(*)
      )
    `)
    .eq('id', params.id)
    .single()

  if (error || !batchData) {
    if (error?.code === 'PGRST116') {
      notFound()
    }
    return (
      <div className="container py-6 max-w-5xl mx-auto">
        <ErrorMessage
          title="Erreur lors de la récupération du lot"
          message={error?.message || 'Ce lot est introuvable.'}
        />
      </div>
    )
  }

  const batch = batchData as unknown as BatchWithRelations & {
    batch_models?: Array<{ id: string; quantity: number; model: AppModel }>
    batch_updates: (UpdateDetail & { model?: AppModel })[]
  }

  // Currency & date formatters
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '—'
    return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: fr })
  }

  const formatDuration = (seconds?: number | null) => {
    if (!seconds && seconds !== 0) return '—'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins} min ${secs} s`
  }

  // Calculations
  const allUpdates = batch.batch_updates || []
  // Sort updates descending by date for timeline
  const sortedUpdates = [...allUpdates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // Active updates (non-superseded)
  const activeUpdates = allUpdates.filter((u) => !u.original_update_id)
  const totalProcessed = activeUpdates.reduce((sum, u) => sum + u.quantity, 0)
  const totalAmount = activeUpdates.reduce((sum, u) => sum + Number(u.amount), 0)
  const progressPercent = Math.min(
    100,
    Math.round((totalProcessed / (batch.quantity || 1)) * 100)
  )

  return (
    <div className="container py-6 max-w-5xl mx-auto space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/batches">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour aux lots
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Lot {batch.batch_models && batch.batch_models.length > 0
                ? batch.batch_models.map((bm) => bm.model?.name).filter(Boolean).join(' + ')
                : batch.model?.name || 'Multi-modèles'}
            </h1>
            <span className="text-sm text-muted-foreground font-mono">
              #{batch.id.slice(0, 8)}
            </span>
          </div>
        </div>

        <BatchActions batchId={batch.id} status={batch.status} />
      </div>

      {/* Main Details Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Transition :</span>
              {batch.from_state && <StateBadge state={batch.from_state} />}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              {batch.expected_state && (
                <StateBadge state={batch.expected_state} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Statut actuel :</span>
              <BatchStatusBadge status={batch.status} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Key Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/40 border">
            <div>
              <p className="text-xs text-muted-foreground">Sous-traitant</p>
              <p className="text-sm font-semibold mt-1">
                {batch.subcontractor?.full_name || batch.subcontractor?.email || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quantité totale</p>
              <p className="text-sm font-semibold mt-1">
                {batch.quantity} pièces
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date d&apos;envoi</p>
              <p className="text-sm font-medium mt-1">
                {formatDateTime(batch.sent_at)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date d&apos;ouverture</p>
              <p className="text-sm font-medium mt-1">
                {formatDateTime(batch.opened_at)}
              </p>
            </div>
          </div>

          {/* Composition multi-modèles si présente */}
          {batch.batch_models && batch.batch_models.length > 0 && (
            <div className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 space-y-2">
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                Composition par modèle :
              </p>
              <div className="flex flex-wrap gap-2">
                {batch.batch_models.map((bm) => (
                  <Badge key={bm.id} variant="secondary" className="px-3 py-1 font-medium text-sm">
                    {bm.model?.name} : <strong className="ml-1 text-primary">{bm.quantity} pièces</strong>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-foreground">
                Progression du traitement
              </span>
              <span className="font-semibold text-foreground">
                {totalProcessed} / {batch.quantity} pièces ({progressPercent}%)
              </span>
            </div>
            <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  progressPercent >= 100
                    ? 'bg-emerald-500'
                    : progressPercent > 0
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Note if present */}
          {batch.note && (
            <div className="p-3 bg-muted/60 rounded-md text-sm text-muted-foreground border-l-4 border-primary">
              <span className="font-medium text-foreground">Note : </span>
              {batch.note}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total pièces traitées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalProcessed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Sur {batch.quantity} pièces attendues
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Montant total dû au sous-traitant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Calculé automatiquement d&apos;après la grille de prix
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline of Updates */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des saisies / Mises à jour</CardTitle>
          <CardDescription>
            Toutes les déclarations de production effectuées sur ce lot
          </CardDescription>
        </CardHeader>

        <CardContent>
          {sortedUpdates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Aucune saisie n&apos;a encore été enregistrée pour ce lot.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date / Heure</TableHead>
                    <TableHead>Modèle</TableHead>
                    <TableHead>État cible</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Prix unit.</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Durée</TableHead>
                    <TableHead>Remarques / Corrections</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUpdates.map((update) => {
                    const isCorrected = !!update.corrected_by
                    const isCorrection = !!update.original_update_id

                    return (
                      <TableRow
                        key={update.id}
                        className={
                          isCorrected
                            ? 'opacity-60 bg-muted/30 line-through-text'
                            : ''
                        }
                      >
                        <TableCell className="font-medium whitespace-nowrap text-sm">
                          {formatDateTime(update.created_at)}
                        </TableCell>

                        <TableCell className="text-sm">
                          <span className="font-semibold text-foreground">
                            {update.model?.name || batch.model?.name || '—'}
                          </span>
                        </TableCell>

                        <TableCell>
                          {update.to_state ? (
                            <StateBadge state={update.to_state} />
                          ) : (
                            '—'
                          )}
                        </TableCell>

                        <TableCell className="text-right font-semibold">
                          {update.quantity}
                        </TableCell>

                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(Number(update.price_per_piece))}
                        </TableCell>

                        <TableCell className="text-right font-bold text-foreground">
                          {formatCurrency(Number(update.amount))}
                        </TableCell>

                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDuration(update.duration_seconds)}
                        </TableCell>

                        <TableCell className="text-xs">
                          {isCorrection && (
                            <div className="mb-1">
                              <Badge
                                variant="outline"
                                className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]"
                              >
                                Correction appliquée
                              </Badge>
                            </div>
                          )}
                          {isCorrected && (
                            <div className="mb-1">
                              <Badge
                                variant="secondary"
                                className="bg-amber-100 text-amber-800 text-[10px]"
                              >
                                Saisie rectifiée
                              </Badge>
                            </div>
                          )}
                          {update.comment && (
                            <span className="text-muted-foreground italic">
                              &ldquo;{update.comment}&rdquo;
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <Link
                            href={`/admin/batch-updates/${update.id}/correct`}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                            >
                              <Wrench className="h-3.5 w-3.5 mr-1" />
                              Corriger
                            </Button>
                          </Link>
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
