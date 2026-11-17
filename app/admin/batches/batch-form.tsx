'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, CheckCircle } from 'lucide-react'

import { AppModel, State, Profile, Batch, BatchStatus } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
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
import { useToast } from '@/hooks/use-toast'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { StateBadge } from '@/components/shared/state-badge'

interface BatchFormProps {
  models: AppModel[]
  states: State[]
  subcontractors: Profile[]
  initialData?: Batch
  isEdit?: boolean
}

export function BatchForm({
  models,
  states,
  subcontractors,
  initialData,
  isEdit = false,
}: BatchFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [loading, setLoading] = React.useState(false)
  const [modelId, setModelId] = React.useState(initialData?.model_id || (models[0]?.id ?? ''))
  const [fromStateId, setFromStateId] = React.useState(
    initialData?.from_state_id ||
      states.find((s) => !s.is_final)?.id ||
      states[0]?.id ||
      ''
  )
  const [expectedStateId, setExpectedStateId] = React.useState(
    initialData?.expected_state_id ||
      states.find((s) => s.is_final)?.id ||
      states[states.length - 1]?.id ||
      ''
  )
  const [quantity, setQuantity] = React.useState<number>(
    initialData?.quantity || 100
  )
  const [subcontractorId, setSubcontractorId] = React.useState(
    initialData?.subcontractor_id || subcontractors[0]?.id || ''
  )
  const [status, setStatus] = React.useState<BatchStatus>(
    initialData?.status || 'sent'
  )
  const [note, setNote] = React.useState(initialData?.note || '')

  // Non-final states for from_state
  const nonFinalStates = React.useMemo(
    () => states.filter((s) => !s.is_final),
    [states]
  )

  // Expected states (can be final or any later state)
  const eligibleExpectedStates = React.useMemo(() => {
    const fromState = states.find((s) => s.id === fromStateId)
    if (!fromState) return states
    return states.filter((s) => s.order >= fromState.order || s.is_final)
  }, [states, fromStateId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!modelId) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner un modèle.',
        variant: 'destructive',
      })
      return
    }

    if (!fromStateId || !expectedStateId) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner les états de départ et prévu.',
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

    if (!subcontractorId) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner un sous-traitant.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      if (isEdit && initialData) {
        // Prepare timestamp updates if status changes
        const nowIso = new Date().toISOString()
        const updatePayload: Record<string, unknown> = {
          model_id: modelId,
          from_state_id: fromStateId,
          expected_state_id: expectedStateId,
          quantity: Number(quantity),
          subcontractor_id: subcontractorId,
          status,
          note: note ? note.trim() : null,
          updated_at: nowIso,
        }

        if (status === 'sent' && !initialData.sent_at) {
          updatePayload.sent_at = nowIso
        } else if (status === 'open' && !initialData.opened_at) {
          updatePayload.opened_at = nowIso
        } else if (status === 'closed' && !initialData.closed_at) {
          updatePayload.closed_at = nowIso
        }

        const { error } = await supabase
          .from('batches')
          .update(updatePayload)
          .eq('id', initialData.id)

        if (error) throw error

        toast({
          title: 'Lot mis à jour',
          description: 'Les modifications ont été enregistrées avec succès.',
        })

        router.push(`/admin/batches/${initialData.id}`)
        router.refresh()
      } else {
        // Create new batch
        const nowIso = new Date().toISOString()
        const newBatchPayload: Record<string, unknown> = {
          model_id: modelId,
          from_state_id: fromStateId,
          expected_state_id: expectedStateId,
          quantity: Number(quantity),
          subcontractor_id: subcontractorId,
          status: 'sent', // New batches are marked sent by default
          sent_at: nowIso,
          note: note ? note.trim() : null,
        }

        const { data: newBatch, error } = await supabase
          .from('batches')
          .insert(newBatchPayload)
          .select('id')
          .single()

        if (error) throw error

        toast({
          title: 'Lot créé',
          description: 'Le nouveau lot a été créé et envoyé au sous-traitant.',
        })

        router.push(`/admin/batches/${newBatch.id}`)
        router.refresh()
      }
    } catch (err: unknown) {
      console.error('Erreur sauvegarde lot:', err)
      const message =
        err instanceof Error ? err.message : 'Une erreur inattendue est survenue'
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={isEdit && initialData ? `/admin/batches/${initialData.id}` : '/admin/batches'}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? 'Modifier le lot' : 'Nouveau lot de sous-traitance'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? 'Mettez à jour les caractéristiques du lot'
              : 'Définissez le modèle, les états de transition et assignez un sous-traitant'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Détails du lot</CardTitle>
            <CardDescription>
              Tous les champs signalés par un astérisque (*) sont requis.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Modèle */}
            <div className="space-y-2">
              <Label htmlFor="model">Modèle de pièce *</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger id="model">
                  <SelectValue placeholder="Sélectionnez un modèle" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} {!m.active && '(Inactif)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* États */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from_state">État de départ (actuel) *</Label>
                <Select value={fromStateId} onValueChange={setFromStateId}>
                  <SelectTrigger id="from_state">
                    <SelectValue placeholder="Sélectionnez l'état de départ" />
                  </SelectTrigger>
                  <SelectContent>
                    {(nonFinalStates.length > 0 ? nonFinalStates : states).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <span>{s.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expected_state">État prévu (objectif) *</Label>
                <Select
                  value={expectedStateId}
                  onValueChange={setExpectedStateId}
                >
                  <SelectTrigger id="expected_state">
                    <SelectValue placeholder="Sélectionnez l'état prévu" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleExpectedStates.map((s) => (
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
            </div>

            {/* Quantité & Sous-traitant */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantité de pièces *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  placeholder="Ex: 150"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subcontractor">Sous-traitant assigné *</Label>
                <Select
                  value={subcontractorId}
                  onValueChange={setSubcontractorId}
                >
                  <SelectTrigger id="subcontractor">
                    <SelectValue placeholder="Sélectionnez un sous-traitant" />
                  </SelectTrigger>
                  <SelectContent>
                    {subcontractors.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.full_name || sub.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Statut (only for edit) */}
            {isEdit && (
              <div className="space-y-2">
                <Label htmlFor="status">Statut du lot *</Label>
                <Select
                  value={status}
                  onValueChange={(val) => setStatus(val as BatchStatus)}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="sent">Envoyé</SelectItem>
                    <SelectItem value="open">En cours</SelectItem>
                    <SelectItem value="completed">Terminé</SelectItem>
                    <SelectItem value="closed">Clos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="note">Notes / Instructions particulières</Label>
              <Textarea
                id="note"
                rows={3}
                placeholder="Instructions pour le sous-traitant (optionnel)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t p-6">
            <Link
              href={
                isEdit && initialData
                  ? `/admin/batches/${initialData.id}`
                  : '/admin/batches'
              }
            >
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </Link>

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Enregistrement...
                </>
              ) : isEdit ? (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Enregistrer les modifications
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Créer le lot
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
