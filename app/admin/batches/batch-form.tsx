'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, CheckCircle, Plus, Trash2 } from 'lucide-react'

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

interface ModelAllocation {
  model_id: string
  quantity: number
}

interface BatchFormProps {
  models: AppModel[]
  states: State[]
  subcontractors: Profile[]
  initialData?: Batch
  initialModelAllocations?: ModelAllocation[]
  isEdit?: boolean
}

export function BatchForm({
  models,
  states,
  subcontractors,
  initialData,
  initialModelAllocations,
  isEdit = false,
}: BatchFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [loading, setLoading] = React.useState(false)

  // Mode multi-modèles avec quantité par modèle
  const [modelAllocations, setModelAllocations] = React.useState<ModelAllocation[]>(() => {
    if (initialModelAllocations && initialModelAllocations.length > 0) {
      return initialModelAllocations
    }
    if (initialData?.model_id) {
      return [{ model_id: initialData.model_id, quantity: initialData.quantity || 100 }]
    }
    return [{ model_id: models[0]?.id ?? '', quantity: 100 }]
  })

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
  const [subcontractorId, setSubcontractorId] = React.useState(
    initialData?.subcontractor_id || subcontractors[0]?.id || ''
  )
  const [status, setStatus] = React.useState<BatchStatus>(
    initialData?.status || 'sent'
  )
  const [note, setNote] = React.useState(initialData?.note || '')

  // Calcul automatique de la quantité totale = somme des modèles
  const totalQuantity = React.useMemo(() => {
    return modelAllocations.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  }, [modelAllocations])

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

  const handleAddModel = () => {
    const existingIds = new Set(modelAllocations.map((m) => m.model_id))
    const nextModel = models.find((m) => !existingIds.has(m.id)) || models[0]
    if (nextModel) {
      setModelAllocations((prev) => [...prev, { model_id: nextModel.id, quantity: 50 }])
    }
  }

  const handleRemoveModel = (index: number) => {
    if (modelAllocations.length <= 1) {
      toast({
        title: 'Attention',
        description: 'Un lot doit comporter au moins un modèle.',
        variant: 'destructive',
      })
      return
    }
    setModelAllocations((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpdateAllocation = (index: number, field: keyof ModelAllocation, value: string | number) => {
    setModelAllocations((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (modelAllocations.length === 0) {
      toast({
        title: 'Erreur',
        description: 'Veuillez ajouter au moins un modèle avec sa quantité.',
        variant: 'destructive',
      })
      return
    }

    // Vérifier les doublons de modèles
    const modelSet = new Set<string>()
    for (const alloc of modelAllocations) {
      if (!alloc.model_id) {
        toast({
          title: 'Erreur',
          description: 'Chaque ligne doit avoir un modèle sélectionné.',
          variant: 'destructive',
        })
        return
      }
      if (modelSet.has(alloc.model_id)) {
        toast({
          title: 'Erreur',
          description: 'Un modèle ne peut pas apparaître deux fois. Regroupez les quantités.',
          variant: 'destructive',
        })
        return
      }
      modelSet.add(alloc.model_id)

      if (!alloc.quantity || alloc.quantity <= 0) {
        toast({
          title: 'Erreur',
          description: 'Chaque modèle doit avoir une quantité strictement supérieure à 0.',
          variant: 'destructive',
        })
        return
      }
    }

    if (!fromStateId || !expectedStateId) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner les états de départ et prévu.',
        variant: 'destructive',
      })
      return
    }

    if (totalQuantity <= 0) {
      toast({
        title: 'Erreur',
        description: 'La quantité totale du lot doit être supérieure à 0.',
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
      const primaryModelId = modelAllocations[0].model_id
      const nowIso = new Date().toISOString()

      if (isEdit && initialData) {
        // 1. Mettre à jour le lot
        const updatePayload: Record<string, unknown> = {
          model_id: primaryModelId,
          from_state_id: fromStateId,
          expected_state_id: expectedStateId,
          quantity: totalQuantity,
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

        const { error: batchErr } = await supabase
          .from('batches')
          .update(updatePayload)
          .eq('id', initialData.id)

        if (batchErr) throw batchErr

        // 2. Mettre à jour batch_models (suppression puis réinsertion)
        await supabase.from('batch_models').delete().eq('batch_id', initialData.id)

        const batchModelsToInsert = modelAllocations.map((alloc) => ({
          batch_id: initialData.id,
          model_id: alloc.model_id,
          quantity: Number(alloc.quantity),
        }))

        const { error: modelsInsertErr } = await supabase
          .from('batch_models')
          .insert(batchModelsToInsert)

        if (modelsInsertErr) console.warn('Note batch_models insert:', modelsInsertErr.message)

        toast({
          title: 'Lot mis à jour',
          description: 'Les modifications et la composition ont été enregistrées.',
        })

        router.push(`/admin/batches/${initialData.id}`)
        router.refresh()
      } else {
        // 1. Créer le nouveau lot
        const newBatchPayload: Record<string, unknown> = {
          model_id: primaryModelId,
          from_state_id: fromStateId,
          expected_state_id: expectedStateId,
          quantity: totalQuantity,
          subcontractor_id: subcontractorId,
          status: 'sent',
          sent_at: nowIso,
          note: note ? note.trim() : null,
        }

        const { data: newBatch, error: batchCreateErr } = await supabase
          .from('batches')
          .insert(newBatchPayload)
          .select('id')
          .single()

        if (batchCreateErr) throw batchCreateErr

        // 2. Insérer la répartition des modèles dans batch_models
        const batchModelsToInsert = modelAllocations.map((alloc) => ({
          batch_id: newBatch.id,
          model_id: alloc.model_id,
          quantity: Number(alloc.quantity),
        }))

        const { error: modelsInsertErr } = await supabase
          .from('batch_models')
          .insert(batchModelsToInsert)

        if (modelsInsertErr) console.warn('Note batch_models insert:', modelsInsertErr.message)

        toast({
          title: 'Lot créé',
          description: `Le lot multi-modèles (${totalQuantity} pièces) a été envoyé au sous-traitant.`,
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
              ? 'Mettez à jour les caractéristiques et les modèles du lot'
              : 'Définissez la composition par modèle, les états et assignez un sous-traitant'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Composition et Détails du lot</CardTitle>
            <CardDescription>
              Vous pouvez associer plusieurs modèles à ce lot en indiquant la quantité pour chacun.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Section Multi-modèles */}
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">Modèles et Quantités du lot *</Label>
                  <p className="text-xs text-muted-foreground">
                    Ajoutez un ou plusieurs modèles de pièces avec leurs quantités respectives.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddModel}
                  className="h-8 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un modèle
                </Button>
              </div>

              <div className="space-y-3">
                {modelAllocations.map((alloc, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-card p-3 rounded-md border"
                  >
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Modèle {idx + 1}</Label>
                      <Select
                        value={alloc.model_id}
                        onValueChange={(val) => handleUpdateAllocation(idx, 'model_id', val)}
                      >
                        <SelectTrigger>
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

                    <div className="w-full sm:w-40 space-y-1">
                      <Label className="text-xs text-muted-foreground">Quantité (pièces)</Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={alloc.quantity}
                        onChange={(e) =>
                          handleUpdateAllocation(idx, 'quantity', parseInt(e.target.value) || 0)
                        }
                        required
                      />
                    </div>

                    <div className="flex sm:self-end pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-9 w-9"
                        onClick={() => handleRemoveModel(idx)}
                        disabled={modelAllocations.length <= 1}
                        title="Supprimer ce modèle"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Résumé de la quantité totale */}
              <div className="flex justify-between items-center pt-2 border-t text-sm font-medium">
                <span className="text-muted-foreground">Quantité totale calculée :</span>
                <span className="text-lg font-bold text-primary">{totalQuantity} pièces</span>
              </div>
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

            {/* Sous-traitant */}
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
