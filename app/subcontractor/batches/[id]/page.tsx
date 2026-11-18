'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ArrowLeft,
  Clock,
  Package,
  CheckCircle2,
  AlertTriangle,
  History,
  Send,
  Coins,
  FileText,
  Layers,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Batch,
  BatchStatus,
  BatchUpdate,
  BatchWithRelations,
  Profile,
  RecordBatchUpdateItem,
  State,
  AppModel,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { StateBadge } from '@/components/shared/state-badge'
import { BatchStatusBadge } from '@/components/shared/batch-status-badge'
import { Stopwatch } from '@/components/shared/stopwatch'
import { QuantitySelector } from '@/components/shared/quantity-selector'
import { ErrorMessage } from '@/components/shared/error-message'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn, getBatchDisplayName } from '@/lib/utils'

function formatEUR(amount: number): string {
  return (
    new Intl.NumberFormat('fr-TN', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount || 0) + ' TND'
  )
}

type BatchUpdateWithState = BatchUpdate & {
  to_state: State
  model?: AppModel | null
}

interface BatchModelItem {
  id: string
  model_id: string
  quantity: number
  model?: AppModel
}

export default function SubcontractorBatchDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const batchId = params.id as string

  const [batch, setBatch] = React.useState<BatchWithRelations | null>(null)
  const [batchModels, setBatchModels] = React.useState<BatchModelItem[]>([])
  const [selectedModelId, setSelectedModelId] = React.useState<string>('')
  const [states, setStates] = React.useState<State[]>([])
  const [updates, setUpdates] = React.useState<BatchUpdateWithState[]>([])
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [opening, setOpening] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Gestion du chronomètre individuel par pièce/répartition avec pause
  const [stepSeconds, setStepSeconds] = React.useState<number>(0)
  const [isTimerPaused, setIsTimerPaused] = React.useState<boolean>(false)

  // Saisie dynamique par état : { [stateId]: quantity }
  const [allocations, setAllocations] = React.useState<Record<string, number>>({})
  const [comment, setComment] = React.useState('')

  const supabase = React.useMemo(() => createClient(), [])

  // Charger les données du lot, états et historique
  const loadBatchData = React.useCallback(async () => {
    try {
      setError(null)

      // 1. Charger les états disponibles
      const { data: statesData, error: statesErr } = await supabase
        .from('states')
        .select('*')
        .order('order')

      if (statesErr) throw statesErr
      const allStates = (statesData as State[]) || []
      setStates(allStates)

      // 2. Charger le lot
      const { data: batchData, error: batchErr } = await supabase
        .from('batches')
        .select('*')
        .eq('id', batchId)
        .single<Batch>()

      if (batchErr) throw batchErr
      if (!batchData) throw new Error('Lot introuvable.')

      // 3. Charger le modèle par défaut ou les modèles associés
      const [{ data: modelData }, { data: bModelsData }, { data: allModelsData }] = await Promise.all([
        batchData.model_id
          ? supabase.from('models').select('*').eq('id', batchData.model_id).single<AppModel>()
          : Promise.resolve({ data: null }),
        supabase.from('batch_models').select('*, model:models(*)').eq('batch_id', batchId),
        supabase.from('models').select('*'),
      ])

      const bModels = (bModelsData || []) as BatchModelItem[]
      setBatchModels(bModels)

      // Déterminer le modèle sélectionné par défaut pour la saisie
      if (bModels.length > 0) {
        setSelectedModelId((prev) => (prev && bModels.some((bm) => bm.model_id === prev) ? prev : bModels[0].model_id))
      } else if (batchData.model_id) {
        setSelectedModelId(batchData.model_id)
      }

      // 4. Charger le profil du sous-traitant
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', batchData.subcontractor_id)
        .single<Profile>()

      const defaultState: State = {
        id: '',
        name: 'Inconnu',
        order: 0,
        color: '#6b7280',
        is_final: false,
        created_at: new Date().toISOString(),
      }

      const defaultModel: AppModel = {
        id: batchData.model_id || '',
        name: bModels.length > 0 ? bModels.map((bm) => bm.model?.name).filter(Boolean).join(' + ') : 'Modèle',
        description: null,
        active: true,
        created_at: new Date().toISOString(),
      }

      const fromState = allStates.find((s) => s.id === batchData.from_state_id) || defaultState
      const expectedState =
        allStates.find((s) => s.id === batchData.expected_state_id) || defaultState

      const fullBatch: BatchWithRelations = {
        ...batchData,
        model: modelData || defaultModel,
        from_state: fromState,
        expected_state: expectedState,
        subcontractor: profileData || {
          id: batchData.subcontractor_id,
          email: '',
          full_name: 'Sous-traitant',
          role: 'subcontractor',
          active: true,
          created_at: new Date().toISOString(),
        },
      }

      setBatch(fullBatch)

      // 5. Charger l'historique des mises à jour du lot avec modèle
      const { data: rawUpdates, error: updatesErr } = await supabase
        .from('batch_updates')
        .select('*, to_state:states(*), model:models(*)')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false })

      if (updatesErr) throw updatesErr

      const mappedUpdates: BatchUpdateWithState[] = (rawUpdates || []).map((u) => ({
        ...u,
        to_state: u.to_state || defaultState,
        model: u.model || null,
      }))

      setUpdates(mappedUpdates)
    } catch (err: unknown) {
      console.error('Erreur chargement lot:', err)
      setError(err instanceof Error ? err.message : 'Impossible de charger les données du lot.')
    } finally {
      setLoading(false)
    }
  }, [batchId, supabase])

  React.useEffect(() => {
    loadBatchData()
  }, [loadBatchData])

  // Horloge locale pour le chronomètre de la réparation en cours (se réinitialise après chaque validation)
  React.useEffect(() => {
    if (!batch || batch.status !== 'open' || isTimerPaused) return

    const interval = setInterval(() => {
      setStepSeconds((s) => s + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [batch?.status, isTimerPaused, batch])

  // Initialiser les allocations quand les états sont chargés
  React.useEffect(() => {
    if (states.length > 0) {
      setAllocations((prev) => {
        const initial: Record<string, number> = { ...prev }
        states.forEach((s) => {
          if (initial[s.id] === undefined) {
            initial[s.id] = 0
          }
        })
        return initial
      })
    }
  }, [states])

  // Calculs métriques du lot
  const supersededIds = React.useMemo(() => {
    const ids = new Set<string>()
    updates.forEach((u) => {
      if ((u as unknown as { original_update_id?: string }).original_update_id) {
        ids.add((u as unknown as { original_update_id: string }).original_update_id)
      }
    })
    return ids
  }, [updates])

  // Mises à jour actives
  const activeUpdates = React.useMemo(() => {
    return updates.filter((u) => !supersededIds.has(u.id))
  }, [updates, supersededIds])

  // Quantité déjà traitée
  const treatedQuantity = React.useMemo(() => {
    return activeUpdates.reduce((sum, u) => sum + (u.quantity || 0), 0)
  }, [activeUpdates])

  // Quantité restante
  const remainingQuantity = React.useMemo(() => {
    if (!batch) return 0
    return Math.max(0, batch.quantity - treatedQuantity)
  }, [batch, treatedQuantity])

  // Total cumulé gagné sur ce lot
  const totalAmountEarned = React.useMemo(() => {
    return activeUpdates.reduce((sum, u) => sum + (Number(u.amount) || 0), 0)
  }, [activeUpdates])

  // Total actuellement saisi dans les sélecteurs
  const totalAllocated = React.useMemo(() => {
    return Object.values(allocations).reduce((acc, q) => acc + (q || 0), 0)
  }, [allocations])

  // Pièces restantes non affectées
  const remainingUnallocated = remainingQuantity - totalAllocated

  // Ouvrir le lot quand statut = 'sent'
  const handleOpenBatch = async () => {
    if (!batch) return
    setOpening(true)
    try {
      const { error: rpcError } = await supabase.rpc('record_batch_update', {
        p_batch_id: batch.id,
        p_updates: [],
        p_comment: null,
      })

      if (rpcError) {
        const { error: updateError } = await supabase
          .from('batches')
          .update({
            status: 'open',
            opened_at: new Date().toISOString(),
          })
          .eq('id', batch.id)

        if (updateError) throw updateError
      }

      toast({
        title: 'Lot ouvert !',
        description: 'Le lot est désormais en cours et le chronomètre est lancé.',
      })

      await loadBatchData()
    } catch (err: unknown) {
      console.error('Erreur ouverture lot:', err)
      const msg = err instanceof Error ? err.message : 'Erreur lors de l’ouverture du lot.'
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: msg,
      })
    } finally {
      setOpening(false)
    }
  }

  // Valider la saisie de pièces
  const handleSubmitUpdates = async () => {
    if (!batch) return

    if (totalAllocated <= 0) {
      toast({
        variant: 'destructive',
        title: 'Saisie vide',
        description: 'Veuillez saisir au moins une pièce à répartir.',
      })
      return
    }

    if (totalAllocated > remainingQuantity) {
      toast({
        variant: 'destructive',
        title: 'Quantité invalide',
        description: `Le total saisi (${totalAllocated}) dépasse la quantité restante (${remainingQuantity}).`,
      })
      return
    }

    setSubmitting(true)
    try {
      const updatesPayload: RecordBatchUpdateItem[] = Object.entries(allocations)
        .filter(([, qty]) => qty > 0)
        .map(([to_state_id, quantity]) => ({
          to_state_id,
          quantity,
          model_id: selectedModelId || batch.model_id || null,
        }))

      const { data, error: rpcError } = await supabase.rpc('record_batch_update', {
        p_batch_id: batch.id,
        p_updates: updatesPayload,
        p_comment: comment.trim() || null,
      })

      if (rpcError) throw rpcError

      // Mettre à jour la durée enregistrée sur les nouvelles saisies avec la durée exacte de cette réparation
      if (data && typeof data === 'object' && Array.isArray((data as { updates?: { id?: string }[] }).updates)) {
        const updateIds = (data as { updates: { id: string }[] }).updates.map((u) => u.id).filter(Boolean)
        if (updateIds.length > 0 && stepSeconds > 0) {
          await supabase
            .from('batch_updates')
            .update({ duration_seconds: stepSeconds })
            .in('id', updateIds)
        }
      }

      // Réinitialiser le chronomètre de la réparation suivante à 0
      setStepSeconds(0)

      let wonAmount = 0
      if (data && typeof data === 'object' && Array.isArray((data as { updates?: { amount?: number }[] }).updates)) {
        wonAmount = (data as { updates: { amount?: number }[] }).updates.reduce(
          (acc, item) => acc + (Number(item.amount) || 0),
          0
        )
      }

      toast({
        title: 'Bravo ! Enregistrement réussi',
        description: wonAmount > 0 ? `Bravo ! +${formatEUR(wonAmount)}` : 'Mise à jour enregistrée.',
      })

      // Réinitialiser les inputs
      setAllocations((prev) => {
        const reset: Record<string, number> = {}
        Object.keys(prev).forEach((k) => (reset[k] = 0))
        return reset
      })
      setComment('')

      await loadBatchData()
      router.refresh()
    } catch (err: unknown) {
      console.error('Erreur enregistrement:', err)
      const msg = err instanceof Error ? err.message : 'Erreur lors de l’enregistrement de la saisie.'
      toast({
        variant: 'destructive',
        title: 'Erreur d’enregistrement',
        description: msg,
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !batch) {
    return (
      <div className="py-6 space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/subcontractor/batches" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Retour aux lots</span>
          </Link>
        </Button>
        <ErrorMessage
          title="Erreur de chargement"
          message={error || 'Ce lot est introuvable ou vous n’y avez pas accès.'}
          onRetry={loadBatchData}
        />
      </div>
    )
  }

  const shortId = batch.id.slice(0, 8).toUpperCase()
  const isSent = batch.status === 'sent'
  const isOpen = batch.status === 'open'
  const isCompleted = batch.status === 'completed'
  const isClosed = batch.status === 'closed'
  const canEdit = (isOpen || isSent) && remainingQuantity > 0

  return (
    <div className="space-y-5 pb-16">
      {/* Bouton retour */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-muted-foreground hover:text-foreground active:scale-95"
        >
          <Link href="/subcontractor/batches" className="inline-flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span>Tous mes lots</span>
          </Link>
        </Button>
      </div>

      {/* EN-TÊTE DU LOT */}
      <Card className="shadow-sm border overflow-hidden">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Ligne 1 : Modèles + Numéro de lot + Statut */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {getBatchDisplayName(batch)}
                </h1>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  #{shortId}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Modèles : {batchModels.length > 0
                  ? batchModels.map((bm) => bm.model?.name).filter(Boolean).join(' + ')
                  : batch.model?.name || 'Standard'}
              </p>
            </div>
            <BatchStatusBadge status={batch.status} />
          </div>

          {/* Composition multi-modèles détaillée */}
          {batchModels.length > 0 && (
            <div className="bg-blue-50/60 dark:bg-blue-950/30 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/40 space-y-1.5">
              <span className="text-[11px] font-semibold text-blue-900 dark:text-blue-200 uppercase tracking-wider">
                Composition du lot :
              </span>
              <div className="flex flex-wrap gap-2">
                {batchModels.map((bm) => (
                  <Badge key={bm.id} variant="secondary" className="text-xs py-0.5 font-medium">
                    {bm.model?.name} : <strong className="ml-1 text-primary">{bm.quantity} pièces</strong>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Ligne 2 : Transition État départ → État prévu */}
          <div className="flex items-center gap-2 flex-wrap bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
            <span className="text-xs font-medium text-muted-foreground">Transition prévue :</span>
            <StateBadge state={batch.from_state} />
            <span className="text-xs font-bold text-muted-foreground">→</span>
            <StateBadge state={batch.expected_state} />
          </div>

          {/* Ligne 3 : Compteurs Quantité (Totale | Traitée | Restante) */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/40 p-2.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total
              </p>
              <p className="text-lg sm:text-xl font-bold text-foreground mt-0.5">
                {batch.quantity}
              </p>
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 p-2.5">
              <p className="text-[11px] font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                Traitées
              </p>
              <p className="text-lg sm:text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                {treatedQuantity}
              </p>
            </div>

            <div
              className={cn(
                'rounded-lg p-2.5 border',
                remainingQuantity > 0
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200'
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-wider opacity-80">
                Restant
              </p>
              <p className="text-lg sm:text-xl font-bold mt-0.5">{remainingQuantity}</p>
            </div>
          </div>

          {/* Ligne 4 : Chronomètre individuel de réparation avec bouton Pause */}
          {isOpen && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 p-3 gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="text-xs font-semibold text-amber-900 dark:text-amber-200 block">
                    Chronomètre de la réparation en cours
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Se réinitialise à chaque validation pour mesurer le temps par pièce.
                  </span>
                </div>
              </div>

              <Stopwatch
                startTime={null}
                elapsedSeconds={stepSeconds}
                isPaused={isTimerPaused}
                allowControls={true}
                onTogglePause={() => setIsTimerPaused((p) => !p)}
                className="text-amber-950 dark:text-amber-100 font-bold"
              />
            </div>
          )}

          {/* Si statut = sent : Gros bouton pour ouvrir le lot */}
          {isSent && (
            <div className="pt-2">
              <Button
                onClick={handleOpenBatch}
                disabled={opening}
                className="w-full h-14 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow active:scale-[0.98]"
                size="lg"
              >
                {opening ? (
                  'Ouverture en cours...'
                ) : (
                  <>
                    <Send className="mr-2 h-5 w-5" />
                    Ouvrir le lot & Démarrer le chronomètre
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Bannière de lot terminé */}
          {(isCompleted || remainingQuantity === 0) && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 p-3 text-emerald-800 dark:text-emerald-200 text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                Toutes les pièces de ce lot ont été réparties ! Le lot est complet.
              </span>
            </div>
          )}

          {/* Bannière de lot clôturé */}
          {isClosed && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3 text-rose-800 dark:text-rose-200 text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>Ce lot a été clôturé par l’administrateur.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION SAISIE : RÉPARTITION DES PIÈCES */}
      {canEdit && (
        <Card className="shadow-sm border border-primary/20">
          <CardHeader className="p-4 sm:p-5 pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <span>Répartition des pièces</span>
              </CardTitle>
              <Badge variant="outline" className="font-semibold text-xs">
                {remainingQuantity} à répartir
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Indiquez le modèle et le nombre de pièces dirigées vers chaque état.
            </p>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
            {/* Sélecteur de modèle pour la saisie si lot multi-modèles */}
            {batchModels.length > 0 && (
              <div className="space-y-1.5 p-3 rounded-md bg-muted/30 border">
                <label className="text-xs font-semibold text-foreground">
                  Modèle des pièces à déclarer :
                </label>
                <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                  <SelectTrigger className="w-full bg-card">
                    <SelectValue placeholder="Sélectionnez le modèle" />
                  </SelectTrigger>
                  <SelectContent>
                    {batchModels.map((bm) => (
                      <SelectItem key={bm.model_id} value={bm.model_id}>
                        {bm.model?.name} (Lot total : {bm.quantity} pcs)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Liste des états dynamiques depuis la DB */}
            <div className="divide-y divide-border rounded-lg border bg-card">
              {states.map((state) => {
                const currentVal = allocations[state.id] || 0
                const maxForThisState = currentVal + Math.max(0, remainingUnallocated)

                return (
                  <div
                    key={state.id}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <StateBadge state={state} />
                        {state.is_final && (
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">
                            Final
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {currentVal > 0 ? (
                          <span className="font-semibold text-foreground">
                            {currentVal} pièce{currentVal > 1 ? 's' : ''} affectée{currentVal > 1 ? 's' : ''}
                          </span>
                        ) : (
                          '0 pièce'
                        )}
                      </p>
                    </div>

                    <div className="flex items-center justify-end">
                      <QuantitySelector
                        value={currentVal}
                        onChange={(newVal) => {
                          setAllocations((prev) => ({
                            ...prev,
                            [state.id]: newVal,
                          }))
                        }}
                        min={0}
                        max={maxForThisState}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Compteur dynamique en temps réel */}
            <div
              className={cn(
                'flex items-center justify-between text-xs sm:text-sm font-semibold rounded-lg p-3 border transition-colors',
                remainingUnallocated === 0 && totalAllocated > 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                  : remainingUnallocated < 0
                  ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
                  : 'bg-muted/60 border-muted text-muted-foreground'
              )}
            >
              <span>Total sélectionné : {totalAllocated} pièce(s)</span>
              <span>
                {remainingUnallocated === 0 && totalAllocated > 0
                  ? '✓ Toutes les pièces sont réparties'
                  : remainingUnallocated > 0
                  ? `${remainingUnallocated} restante(s) à affecter`
                  : `Dépassement de ${Math.abs(remainingUnallocated)} pièce(s)`}
              </span>
            </div>

            {/* Champ commentaire optionnel */}
            <div className="space-y-1.5">
              <label
                htmlFor="comment"
                className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Commentaire / Remarques (optionnel)</span>
              </label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ex : 5 pièces légèrement rayées réorientées vers le choix commercial..."
                rows={2}
                disabled={submitting}
                className="text-sm resize-none"
              />
            </div>

            {/* Gros bouton tactile de validation */}
            <Button
              onClick={handleSubmitUpdates}
              disabled={submitting || totalAllocated === 0 || totalAllocated > remainingQuantity}
              className="w-full h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow active:scale-[0.98]"
              size="lg"
            >
              {submitting ? (
                'Validation et calcul en cours...'
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Valider la répartition ({totalAllocated} pièce{totalAllocated > 1 ? 's' : ''})
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* SECTION HISTORIQUE DES MISES À JOUR */}
      <Card className="shadow-sm border">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span>Historique des déclarations</span>
            </CardTitle>
            <span className="text-xs font-semibold text-muted-foreground">
              {updates.length} saisie{updates.length > 1 ? 's' : ''}
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-0">
          {updates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Aucune mise à jour enregistrée pour le moment.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {updates.map((up) => {
                const isCorrected = up.corrected_by !== null
                const isCorrection = Boolean(
                  (up as unknown as { original_update_id?: string }).original_update_id
                )

                return (
                  <div
                    key={up.id}
                    className={cn(
                      'py-3 first:pt-0 last:pb-0 space-y-1.5',
                      isCorrected && 'opacity-60 bg-muted/20 px-2 rounded -mx-2'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {up.model && (
                          <Badge variant="outline" className="text-xs font-semibold">
                            {up.model.name}
                          </Badge>
                        )}
                        <StateBadge state={up.to_state} />
                        <span className="font-bold text-sm text-foreground">
                          {up.quantity} pièce{up.quantity > 1 ? 's' : ''}
                        </span>
                        {isCorrected && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] h-4 px-1.5 uppercase font-bold"
                          >
                            Corrigé
                          </Badge>
                        )}
                        {isCorrection && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1.5 uppercase font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          >
                            Correction
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                          +{formatEUR(up.amount)}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {formatEUR(up.price_per_piece)} / pce
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {format(new Date(up.created_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                      </span>
                      {up.duration_seconds !== null && (
                        <span>
                          Durée : {Math.floor(up.duration_seconds / 60)}m {up.duration_seconds % 60}s
                        </span>
                      )}
                    </div>

                    {up.comment && (
                      <p className="text-xs italic text-muted-foreground bg-muted/30 px-2.5 py-1 rounded">
                        &ldquo;{up.comment}&rdquo;
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Résumé financier en bas de carte */}
          <div className="mt-4 pt-3 border-t flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Gain cumulé sur ce lot
            </span>
            <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
              {formatEUR(totalAmountEarned)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
