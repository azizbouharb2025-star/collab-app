'use client'

import * as React from 'react'
import {
  Plus,
  Edit2,
  ArrowUp,
  ArrowDown,
  Trash2,
  Sliders,
  CheckCircle2,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { State } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ErrorMessage } from '@/components/shared/error-message'
import { useToast } from '@/hooks/use-toast'

export default function AdminConfigStatesPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [states, setStates] = React.useState<State[]>([])

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingState, setEditingState] = React.useState<State | null>(null)
  const [formName, setFormName] = React.useState('')
  const [formOrder, setFormOrder] = React.useState<number>(10)
  const [formColor, setFormColor] = React.useState('#3b82f6')
  const [formIsFinal, setFormIsFinal] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const loadStates = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: fetchErr } = await supabase
        .from('states')
        .select('*')
        .order('order', { ascending: true })

      if (fetchErr) throw fetchErr
      setStates(data || [])
    } catch (err: unknown) {
      console.error('Erreur chargement états:', err)
      setError(
        err instanceof Error ? err.message : 'Impossible de charger les états'
      )
    } finally {
      setLoading(false)
    }
  }, [supabase])

  React.useEffect(() => {
    loadStates()
  }, [loadStates])

  const handleOpenCreate = () => {
    setEditingState(null)
    setFormName('')
    // Suggest next order number
    const maxOrder = states.reduce((max, s) => Math.max(max, s.order), 0)
    setFormOrder(maxOrder + 10)
    setFormColor('#3b82f6')
    setFormIsFinal(false)
    setDialogOpen(true)
  }

  const handleOpenEdit = (s: State) => {
    setEditingState(s)
    setFormName(s.name)
    setFormOrder(s.order)
    setFormColor(s.color || '#3b82f6')
    setFormIsFinal(s.is_final)
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formName.trim()) {
      toast({
        title: 'Erreur',
        description: "Le libellé de l'état est requis.",
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      if (editingState) {
        // Update
        const { error: updateErr } = await supabase
          .from('states')
          .update({
            name: formName.trim(),
            order: Number(formOrder),
            color: formColor,
            is_final: formIsFinal,
          })
          .eq('id', editingState.id)

        if (updateErr) throw updateErr

        toast({
          title: 'État mis à jour',
          description: `L'état "${formName}" a été modifié.`,
        })
      } else {
        // Create
        const { error: insertErr } = await supabase.from('states').insert({
          name: formName.trim(),
          order: Number(formOrder),
          color: formColor,
          is_final: formIsFinal,
        })

        if (insertErr) throw insertErr

        toast({
          title: 'État créé',
          description: `L'état "${formName}" a été ajouté.`,
        })
      }

      setDialogOpen(false)
      loadStates()
    } catch (err: unknown) {
      console.error('Erreur sauvegarde état:', err)
      toast({
        title: 'Erreur',
        description:
          err instanceof Error ? err.message : 'Impossible de sauvegarder',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Reorder: Move state up
  const handleMoveUp = async (index: number) => {
    if (index <= 0) return
    const current = states[index]
    const previous = states[index - 1]

    try {
      const { error: err1 } = await supabase
        .from('states')
        .update({ order: previous.order })
        .eq('id', current.id)
      const { error: err2 } = await supabase
        .from('states')
        .update({ order: current.order })
        .eq('id', previous.id)

      if (err1 || err2) throw err1 || err2

      loadStates()
    } catch (err: unknown) {
      console.error('Erreur réordonnancement:', err)
      toast({
        title: 'Erreur',
        description: 'Impossible de changer l’ordre.',
        variant: 'destructive',
      })
    }
  }

  // Reorder: Move state down
  const handleMoveDown = async (index: number) => {
    if (index >= states.length - 1) return
    const current = states[index]
    const next = states[index + 1]

    try {
      const { error: err1 } = await supabase
        .from('states')
        .update({ order: next.order })
        .eq('id', current.id)
      const { error: err2 } = await supabase
        .from('states')
        .update({ order: current.order })
        .eq('id', next.id)

      if (err1 || err2) throw err1 || err2

      loadStates()
    } catch (err: unknown) {
      console.error('Erreur réordonnancement:', err)
      toast({
        title: 'Erreur',
        description: 'Impossible de changer l’ordre.',
        variant: 'destructive',
      })
    }
  }

  // Delete state safely
  const handleDelete = async (s: State) => {
    try {
      // Check if state is used in batches
      const [batchesRes, updatesRes, pricesRes] = await Promise.all([
        supabase
          .from('batches')
          .select('id')
          .or(`from_state_id.eq.${s.id},expected_state_id.eq.${s.id}`)
          .limit(1),
        supabase
          .from('batch_updates')
          .select('id')
          .eq('to_state_id', s.id)
          .limit(1),
        supabase
          .from('price_rules')
          .select('id')
          .or(`from_state_id.eq.${s.id},to_state_id.eq.${s.id}`)
          .limit(1),
      ])

      const isUsed =
        (batchesRes.data && batchesRes.data.length > 0) ||
        (updatesRes.data && updatesRes.data.length > 0) ||
        (pricesRes.data && pricesRes.data.length > 0)

      if (isUsed) {
        toast({
          title: 'Suppression impossible',
          description: `L'état "${s.name}" est utilisé dans des lots ou la grille de prix et ne peut pas être supprimé.`,
          variant: 'destructive',
        })
        return
      }

      const { error: delErr } = await supabase
        .from('states')
        .delete()
        .eq('id', s.id)

      if (delErr) throw delErr

      toast({
        title: 'État supprimé',
        description: `L'état "${s.name}" a été retiré.`,
      })

      loadStates()
    } catch (err: unknown) {
      console.error('Erreur suppression état:', err)
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors de la suppression.',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="container py-16 flex justify-center items-center">
        <LoadingSpinner size="lg" text="Chargement des états..." />
      </div>
    )
  }

  return (
    <div className="container py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Sliders className="h-6 w-6 text-primary" /> Configuration des états
          </h1>
          <p className="text-sm text-muted-foreground">
            Hiérarchie du cycle de vie des pièces, codes couleurs et statuts finaux
          </p>
        </div>

        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un état
        </Button>
      </div>

      {error && (
        <ErrorMessage title="Erreur" message={error} onRetry={loadStates} />
      )}

      {/* States Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Liste des états configurés ({states.length})</CardTitle>
          <CardDescription>
            L&apos;ordre détermine la séquence logique des pièces. Utilisez les
            flèches pour ajuster les priorités.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">Ordre</TableHead>
                  <TableHead className="w-20">Nuance</TableHead>
                  <TableHead>Nom de l&apos;état</TableHead>
                  <TableHead>Type d&apos;état</TableHead>
                  <TableHead className="text-center">Réordonner</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {states.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Aucun état configuré.
                    </TableCell>
                  </TableRow>
                ) : (
                  states.map((s, index) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-center font-mono font-bold text-muted-foreground">
                        {s.order}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-6 h-6 rounded-md shadow-sm border"
                            style={{ backgroundColor: s.color }}
                            title={s.color}
                          />
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="font-semibold text-foreground">
                          {s.name}
                        </span>
                      </TableCell>

                      <TableCell>
                        {s.is_final ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-300"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            État final
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Intermédiaire</Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            title="Monter"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === states.length - 1}
                            title="Descendre"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(s)}
                            title="Modifier"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(s)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingState ? 'Modifier l’état' : 'Nouvel état'}
              </DialogTitle>
              <DialogDescription>
                Définissez le nom, le code couleur et si cet état représente un
                aboutissement (final).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="state_name">Nom de l&apos;état *</Label>
                <Input
                  id="state_name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: 1er choix, Rebut, En attente..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="state_order">Ordre d&apos;affichage *</Label>
                  <Input
                    id="state_order"
                    type="number"
                    value={formOrder}
                    onChange={(e) =>
                      setFormOrder(parseInt(e.target.value) || 0)
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state_color">Couleur associée *</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="state_color"
                      type="color"
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="h-10 w-14 rounded border cursor-pointer p-0.5 bg-background"
                    />
                    <Input
                      type="text"
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="font-mono text-xs uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  id="state_is_final"
                  type="checkbox"
                  checked={formIsFinal}
                  onChange={(e) => setFormIsFinal(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <Label
                  htmlFor="state_is_final"
                  className="text-sm font-medium cursor-pointer"
                >
                  Marquer comme état final (aboutissement du processus)
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? 'Enregistrement...'
                  : editingState
                  ? 'Mettre à jour'
                  : 'Créer l’état'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
