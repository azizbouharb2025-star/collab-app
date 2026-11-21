'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { MinusCircle, Trash2, Wrench, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

interface UpdateRowActionsProps {
  updateId: string
  batchId: string
  currentQuantity: number
  pricePerPiece: number
  modelName: string
  stateName: string
  isSuperseded: boolean
}

export function UpdateRowActions({
  updateId,
  batchId,
  currentQuantity,
  pricePerPiece,
  modelName,
  stateName,
  isSuperseded,
}: UpdateRowActionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = React.useMemo(() => createClient(), [])

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [removeCount, setRemoveCount] = React.useState<number>(1)
  const [reason, setReason] = React.useState<string>('Erreur de saisie du sous-traitant')
  const [submitting, setSubmitting] = React.useState(false)

  // Synchroniser le statut du lot (si des pièces ont été enlevées d'un lot 'completed', le repasser en 'open')
  const syncBatchStatusAfterRemoval = async () => {
    const [{ data: batchRow }, { data: allUpdates }] = await Promise.all([
      supabase.from('batches').select('id, quantity, status').eq('id', batchId).single(),
      supabase.from('batch_updates').select('id, quantity, original_update_id').eq('batch_id', batchId),
    ])

    if (!batchRow || !allUpdates) return

    const superseded = new Set<string>()
    allUpdates.forEach((u) => {
      if (u.original_update_id) superseded.add(u.original_update_id)
    })

    const activeTotal = allUpdates
      .filter((u) => !superseded.has(u.id))
      .reduce((s, u) => s + (Number(u.quantity) || 0), 0)

    if (batchRow.status === 'completed' && activeTotal < batchRow.quantity) {
      await supabase
        .from('batches')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', batchId)
    }
  }

  // Enlever un nombre partiel ou total de pièces sur cette déclaration
  const handleRemovePieces = async (removeAll = false) => {
    const qtyToRemove = removeAll ? currentQuantity : removeCount
    if (qtyToRemove <= 0 || qtyToRemove > currentQuantity) {
      toast({
        variant: 'destructive',
        title: 'Quantité invalide',
        description: `Veuillez indiquer un nombre entre 1 et ${currentQuantity}.`,
      })
      return
    }

    setSubmitting(true)
    try {
      const remainingQty = currentQuantity - qtyToRemove

      if (remainingQty <= 0) {
        // Suppression complète de la déclaration erronée
        const { error: delErr } = await supabase
          .from('batch_updates')
          .delete()
          .eq('id', updateId)

        if (delErr) throw delErr

        toast({
          title: 'Saisie annulée et pièces remises dans le lot',
          description: `${currentQuantity} pièce(s) (${modelName}) ont été retirées des réparations et remises à réparer.`,
        })
      } else {
        // Réduction de la quantité et du montant sur la ligne
        const newAmount = Number((remainingQty * Number(pricePerPiece || 0)).toFixed(3))
        const noteText = reason.trim()
          ? `[Rectifié Admin: -${qtyToRemove} pcs — ${reason.trim()}]`
          : `[Rectifié Admin: -${qtyToRemove} pcs]`

        const { error: updErr } = await supabase
          .from('batch_updates')
          .update({
            quantity: remainingQty,
            amount: newAmount,
            comment: noteText,
          })
          .eq('id', updateId)

        if (updErr) throw updErr

        toast({
          title: 'Pièces retirées avec succès',
          description: `${qtyToRemove} pièce(s) enlevée(s). Nouvelle quantité déclarée : ${remainingQty} pcs.`,
        })
      }

      await syncBatchStatusAfterRemoval()
      setDialogOpen(false)
      router.refresh()
    } catch (err: unknown) {
      console.error('Erreur retrait pièces:', err)
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description:
          err instanceof Error ? err.message : 'Impossible de retirer les pièces.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (isSuperseded) {
    return (
      <span className="text-xs text-muted-foreground italic">Rectifiée</span>
    )
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRemoveCount(1)
            setDialogOpen(true)
          }}
          className="h-8 text-xs border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300"
          title="Enlever des pièces suite à une faute de saisie"
        >
          <MinusCircle className="h-3.5 w-3.5 mr-1" />
          Enlever pièces
        </Button>

        <Link href={`/admin/batch-updates/${updateId}/correct`}>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <Wrench className="h-3.5 w-3.5 mr-1" />
            Corriger état
          </Button>
        </Link>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <MinusCircle className="h-5 w-5" />
              <span>Enlever des pièces (Faute de saisie)</span>
            </DialogTitle>
            <DialogDescription>
              Les pièces retirées seront déduites du gain du sous-traitant et redeviendront disponibles à répartir dans le lot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 p-3 border text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Modèle :</span>
                <strong className="text-foreground">{modelName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">État déclaré :</span>
                <strong className="text-foreground">{stateName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantité actuelle saisie :</span>
                <strong className="text-foreground text-sm">{currentQuantity} pièce(s)</strong>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="remove_qty" className="text-xs font-semibold">
                Nombre de pièces à enlever (max {currentQuantity}) :
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="remove_qty"
                  type="number"
                  min={1}
                  max={currentQuantity}
                  value={removeCount}
                  onChange={(e) =>
                    setRemoveCount(
                      Math.min(
                        currentQuantity,
                        Math.max(1, parseInt(e.target.value, 10) || 1)
                      )
                    )
                  }
                  className="font-bold text-base w-28"
                  disabled={submitting}
                />
                <span className="text-xs text-muted-foreground">
                  → Il restera{' '}
                  <strong className="text-foreground">
                    {Math.max(0, currentQuantity - removeCount)} pièce(s)
                  </strong>{' '}
                  sur cette saisie
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="remove_reason" className="text-xs font-semibold">
                Remarque / Motif (optionnel) :
              </Label>
              <Textarea
                id="remove_reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex : Faute de saisie signalée par le sous-traitant..."
                disabled={submitting}
                className="text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => handleRemovePieces(true)}
              disabled={submitting}
              className="sm:mr-auto"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Supprimer toute la ligne ({currentQuantity} pcs)
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleRemovePieces(false)}
                disabled={submitting || removeCount <= 0 || removeCount > currentQuantity}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Traitement...
                  </>
                ) : (
                  <>Confirmer (-{removeCount} pcs)</>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
