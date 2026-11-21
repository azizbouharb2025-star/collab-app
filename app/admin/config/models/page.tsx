'use client'

import * as React from 'react'
import { Plus, Edit2, CheckCircle2, XCircle, Power, Box, Database, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { createClient } from '@/lib/supabase/client'
import { AppModel } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

export default function AdminConfigModelsPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [models, setModels] = React.useState<AppModel[]>([])

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingModel, setEditingModel] = React.useState<AppModel | null>(null)
  const [formName, setFormName] = React.useState('')
  const [formDescription, setFormDescription] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [importingDeluxe, setImportingDeluxe] = React.useState(false)

  const handleImportDeluxeArticles = async () => {
    setImportingDeluxe(true)
    try {
      const res = await fetch('/api/deluxe/articles', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'importer Article.DBF")
      }
      toast({
        title: 'Importation Deluxe réussie !',
        description: `${data.insertedCount} nouveaux articles importés (${data.totalInDbf} lus dans Article.DBF).`,
      })
      await loadModels()
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erreur importation Deluxe',
        description:
          err instanceof Error
            ? err.message
            : "Vérifiez que l'application tourne en local sur le PC ayant accès à C:\\Deluxe\\Gestcom\\TUNISIESANITAIRES2018",
      })
    } finally {
      setImportingDeluxe(false)
    }
  }

  const loadModels = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: fetchErr } = await supabase
        .from('models')
        .select('*')
        .order('name', { ascending: true })

      if (fetchErr) throw fetchErr
      setModels(data || [])
    } catch (err: unknown) {
      console.error('Erreur chargement modèles:', err)
      setError(
        err instanceof Error ? err.message : 'Impossible de charger les modèles'
      )
    } finally {
      setLoading(false)
    }
  }, [supabase])

  React.useEffect(() => {
    loadModels()
  }, [loadModels])

  const handleOpenCreate = () => {
    setEditingModel(null)
    setFormName('')
    setFormDescription('')
    setDialogOpen(true)
  }

  const handleOpenEdit = (m: AppModel) => {
    setEditingModel(m)
    setFormName(m.name)
    setFormDescription(m.description || '')
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) {
      toast({
        title: 'Erreur',
        description: 'Le nom du modèle est obligatoire.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      if (editingModel) {
        // Update
        const { error: updateErr } = await supabase
          .from('models')
          .update({
            name: formName.trim().toUpperCase(),
            description: formDescription.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingModel.id)

        if (updateErr) throw updateErr

        toast({
          title: 'Modèle modifié',
          description: `Le modèle "${formName.toUpperCase()}" a été mis à jour.`,
        })
      } else {
        // Create
        const { error: insertErr } = await supabase.from('models').insert({
          name: formName.trim().toUpperCase(),
          description: formDescription.trim() || null,
          active: true,
        })

        if (insertErr) throw insertErr

        toast({
          title: 'Modèle créé',
          description: `Le modèle "${formName.toUpperCase()}" a été ajouté.`,
        })
      }

      setDialogOpen(false)
      loadModels()
    } catch (err: unknown) {
      console.error('Erreur sauvegarde modèle:', err)
      toast({
        title: 'Erreur',
        description:
          err instanceof Error
            ? err.message
            : 'Impossible d’enregistrer le modèle',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Toggle active/inactive
  const handleToggleActive = async (m: AppModel) => {
    try {
      const newStatus = !m.active
      const { error: toggleErr } = await supabase
        .from('models')
        .update({
          active: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', m.id)

      if (toggleErr) throw toggleErr

      setModels((prev) =>
        prev.map((item) =>
          item.id === m.id ? { ...item, active: newStatus } : item
        )
      )

      toast({
        title: newStatus ? 'Modèle activé' : 'Modèle désactivé',
        description: `Le modèle "${m.name}" est désormais ${
          newStatus ? 'actif' : 'inactif'
        }.`,
      })
    } catch (err: unknown) {
      console.error('Erreur toggle modèle:', err)
      toast({
        title: 'Erreur',
        description: 'Impossible de changer le statut du modèle.',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="container py-16 flex justify-center items-center">
        <LoadingSpinner size="lg" text="Chargement des modèles..." />
      </div>
    )
  }

  return (
    <div className="container py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Box className="h-6 w-6 text-primary" /> Configuration des modèles
          </h1>
          <p className="text-sm text-muted-foreground">
            Gérez le catalogue des pièces et modèles pris en charge par l&apos;application
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleImportDeluxeArticles}
            disabled={importingDeluxe}
            className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300"
          >
            {importingDeluxe ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            {importingDeluxe ? 'Importation Article.DBF...' : 'Importer depuis Article.DBF (Deluxe)'}
          </Button>

          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un modèle
          </Button>
        </div>
      </div>

      {error && (
        <ErrorMessage
          title="Erreur"
          message={error}
          onRetry={loadModels}
        />
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Liste des modèles ({models.length})</CardTitle>
          <CardDescription>
            Conformément aux règles de gestion, les modèles ne sont pas supprimés pour préserver l&apos;historique des lots, mais peuvent être désactivés.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom du modèle</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date de création</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Aucun modèle configuré.
                    </TableCell>
                  </TableRow>
                ) : (
                  models.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-bold text-foreground">
                        {m.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-md">
                        {m.description || '—'}
                      </TableCell>
                      <TableCell>
                        {m.active ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 w-fit"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Actif
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-muted-foreground flex items-center gap-1 w-fit"
                          >
                            <XCircle className="h-3 w-3" />
                            Inactif
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(m.created_at), 'dd/MM/yyyy', {
                          locale: fr,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(m)}
                            title="Modifier"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={m.active ? 'outline' : 'secondary'}
                            size="sm"
                            onClick={() => handleToggleActive(m)}
                            title={m.active ? 'Désactiver' : 'Activer'}
                            className="text-xs"
                          >
                            <Power className="h-3.5 w-3.5 mr-1" />
                            {m.active ? 'Désactiver' : 'Activer'}
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

      {/* Modal Dialog Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingModel ? 'Modifier le modèle' : 'Nouveau modèle'}
              </DialogTitle>
              <DialogDescription>
                Renseignez le nom commercial et une description indicative.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="model_name">Nom du modèle *</Label>
                <Input
                  id="model_name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: SILEX, HOUDA, CRYSTAL..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model_desc">Description (optionnelle)</Label>
                <Textarea
                  id="model_desc"
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Caractéristiques de la pièce..."
                />
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
                  : editingModel
                  ? 'Mettre à jour'
                  : 'Créer le modèle'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
