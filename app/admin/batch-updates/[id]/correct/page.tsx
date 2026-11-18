'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Wrench } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { createClient } from '@/lib/supabase/client'
import { State, AppModel } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StateBadge } from '@/components/shared/state-badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ErrorMessage } from '@/components/shared/error-message'
import { useToast } from '@/hooks/use-toast'

interface CorrectUpdatePageProps {
  params: {
    id: string
  }
}

interface LoadedUpdate {
  id: string
  batch_id: string
  to_state_id: string
  quantity: number
  price_per_piece: number
  amount: number
  created_at: string
  comment: string | null
  to_state: State
  batch: {
    id: string
    quantity: number
    model: AppModel
    from_state: State
  }
}

export default function CorrectUpdatePage({ params }: CorrectUpdatePageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [loadingData, setLoadingData] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [fetchError, setFetchError] = React.useState<string | null>(null)

  const [updateData, setUpdateData] = React.useState<LoadedUpdate | null>(null)
  const [states, setStates] = React.useState<State[]>([])

  // Form fields
  const [toStateId, setToStateId] = React.useState('')
  const [quantity, setQuantity] = React.useState<number>(1)
  const [comment, setComment] = React.useState('')

  // Load update and states
  const loadData = React.useCallback(async () => {
    try {
      setLoadingData(true)
      setFetchError(null)

      const [updateRes, statesRes] = await Promise.all([
        supabase
          .from('batch_updates')
          .select(`
            *,
            to_state:states!batch_updates_to_state_id_fkey(*),
            batch:batches!batch_updates_batch_id_fkey(
              id,
              quantity,
              model:models(*),
              from_state:states!batches_from_state_id_fkey(*)
            )
          `)
          .eq('id', params.id)
          .single(),
        supabase.from('states').select('*').order('order'),
      ])

      if (updateRes.error) throw updateRes.error
      if (statesRes.error) throw statesRes.error

      const current = updateRes.data as unknown as LoadedUpdate
      setUpdateData(current)
      setStates((statesRes.data || []) as State[])

      // Pre-fill form
      setToStateId(current.to_state_id)
      setQuantity(current.quantity)
    } catch (err: unknown) {
      console.error('Erreur chargement mise à jour:', err)
      const msg =
        err instanceof Error
          ? err.message
          : 'Impossible de charger la saisie à corriger.'
      setFetchError(msg)
    } finally {
      setLoadingData(false)
    }
  }, [params.id, supabase])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-TN', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount || 0) + ' TND'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!toStateId) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner un état cible.',
        variant: 'destructive',
      })
      return
    }

    if (!quantity || quantity <= 0) {
      toast({
        title: 'Erreur',
        description: 'La quantité doit être supérieure à 0.',
        variant: 'destructive',
      })
      return
    }

    if (!comment || comment.trim().length < 10) {
      toast({
        title: 'Commentaire trop court',
        description:
          'Un motif de correction détaillé est requis (au moins 10 caractères).',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)

    try {
      const { data, error } = await supabase.rpc('correct_batch_update', {
        p_update_id: params.id,
        p_new_to_state_id: toStateId,
        p_new_quantity: Number(quantity),
        p_comment: comment.trim(),
      })

      if (error) throw error

      toast({
        title: 'Correction appliquée',
        description:
          'La mise à jour a été corrigée et le montant recalculé avec succès.',
      })

      if (updateData?.batch_id) {
        router.push(`/admin/batches/${updateData.batch_id}`)
      } else {
        router.push('/admin/batches')
      }
      router.refresh()
    } catch (err: unknown) {
      console.error('Erreur RPC correct_batch_update:', err)
      const message =
        err instanceof Error ? err.message : 'Une erreur inattendue est survenue'
      toast({
        title: 'Échec de la correction',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingData) {
    return (
      <div className="container py-12 flex justify-center items-center">
        <LoadingSpinner size="lg" text="Chargement des informations..." />
      </div>
    )
  }

  if (fetchError || !updateData) {
    return (
      <div className="container py-8 max-w-2xl mx-auto">
        <ErrorMessage
          title="Erreur de chargement"
          message={fetchError || 'Saisie introuvable.'}
          onRetry={loadData}
        />
      </div>
    )
  }

  const batch = updateData.batch

  return (
    <div className="container py-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/admin/batches/${updateData.batch_id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour au lot
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Corriger une saisie de production
          </h1>
          <p className="text-sm text-muted-foreground">
            Ajustez l&apos;état ou la quantité et justifiez la rectification
          </p>
        </div>
      </div>

      {/* Current Data (Read-only) */}
      <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Données actuelles enregistrées (Lecture
            seule)
          </CardTitle>
          <CardDescription>
            Saisie enregistrée le{' '}
            {format(new Date(updateData.created_at), 'dd/MM/yyyy à HH:mm', {
              locale: fr,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Lot / Modèle</p>
              <p className="font-semibold text-foreground mt-0.5">
                {batch?.model?.name || 'Inconnu'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">État déclaré</p>
              <div className="mt-1">
                {updateData.to_state ? (
                  <StateBadge state={updateData.to_state} />
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quantité</p>
              <p className="font-semibold text-foreground mt-0.5">
                {updateData.quantity} pièces
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Montant calculé</p>
              <p className="font-semibold text-foreground mt-0.5">
                {formatCurrency(Number(updateData.amount))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Correction Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Nouvelles valeurs à appliquer</CardTitle>
            <CardDescription>
              Le prix unitaire et le montant seront automatiquement recalculés à
              partir de la grille tarifaire en vigueur.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Nouvel état cible */}
            <div className="space-y-2">
              <Label htmlFor="to_state">Nouvel état cible *</Label>
              <Select value={toStateId} onValueChange={setToStateId}>
                <SelectTrigger id="to_state">
                  <SelectValue placeholder="Sélectionnez un état" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span>{s.name}</span>
                        {s.is_final && (
                          <span className="text-xs text-muted-foreground">
                            (Final)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nouvelle quantité */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Nouvelle quantité de pièces *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                required
              />
            </div>

            {/* Commentaire obligatoire (min 10 chars) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="comment">
                  Motif de la correction *{' '}
                  <span className="text-xs text-muted-foreground font-normal">
                    (obligatoire, min. 10 caractères)
                  </span>
                </Label>
                <span
                  className={`text-xs ${
                    comment.trim().length >= 10
                      ? 'text-emerald-600'
                      : 'text-muted-foreground'
                  }`}
                >
                  {comment.trim().length} / 10 min
                </span>
              </div>
              <Textarea
                id="comment"
                rows={4}
                placeholder="Expliquez clairement la raison de cette modification (ex: Erreur de comptage constatée lors du contrôle qualité)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                required
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t p-6">
            <Link href={`/admin/batches/${updateData.batch_id}`}>
              <Button type="button" variant="outline" disabled={submitting}>
                Annuler
              </Button>
            </Link>

            <Button
              type="submit"
              disabled={submitting || comment.trim().length < 10}
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Application de la correction...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Appliquer la correction
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
