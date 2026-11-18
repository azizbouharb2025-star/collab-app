'use client'

import * as React from 'react'
import { Plus, ArrowRight, DollarSign, History, Layers } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { createClient } from '@/lib/supabase/client'
import { AppModel, State, PriceRuleWithRelations } from '@/lib/types'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StateBadge } from '@/components/shared/state-badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ErrorMessage } from '@/components/shared/error-message'
import { useToast } from '@/hooks/use-toast'

interface ExtendedPriceRule extends PriceRuleWithRelations {
  isCurrent?: boolean
}

export default function AdminConfigPricesPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [rules, setRules] = React.useState<ExtendedPriceRule[]>([])
  const [models, setModels] = React.useState<AppModel[]>([])
  const [states, setStates] = React.useState<State[]>([])

  // Filter state
  const [filterModel, setFilterModel] = React.useState<string>('all')
  const [showHistory, setShowHistory] = React.useState(true)

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [fromStateId, setFromStateId] = React.useState('')
  const [toStateId, setToStateId] = React.useState('')
  const [modelId, setModelId] = React.useState<string>('all_models')
  const [price, setPrice] = React.useState<string>('1.00')
  const [submitting, setSubmitting] = React.useState(false)

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [rulesRes, modelsRes, statesRes] = await Promise.all([
        supabase
          .from('price_rules')
          .select(`
            *,
            from_state:states!price_rules_from_state_id_fkey(*),
            to_state:states!price_rules_to_state_id_fkey(*),
            model:models(*)
          `)
          .order('valid_from', { ascending: false }),
        supabase.from('models').select('*').order('name'),
        supabase.from('states').select('*').order('order'),
      ])

      if (rulesRes.error) throw rulesRes.error
      if (modelsRes.error) throw modelsRes.error
      if (statesRes.error) throw statesRes.error

      const rawRules = (rulesRes.data || []) as unknown as PriceRuleWithRelations[]
      const now = new Date().getTime()

      // Determine which rules are currently in effect vs superseded
      // Group by `from_state_id + to_state_id + (model_id || 'general')`
      const seenGroups = new Set<string>()
      const annotatedRules: ExtendedPriceRule[] = []

      // rawRules is sorted valid_from DESC
      for (const r of rawRules) {
        const groupKey = `${r.from_state_id}_${r.to_state_id}_${r.model_id || 'null'}`
        const rTime = new Date(r.valid_from).getTime()

        if (rTime <= now && !seenGroups.has(groupKey)) {
          seenGroups.add(groupKey)
          annotatedRules.push({ ...r, isCurrent: true })
        } else {
          annotatedRules.push({ ...r, isCurrent: false })
        }
      }

      setRules(annotatedRules)
      setModels(modelsRes.data || [])
      setStates(statesRes.data || [])

      if (statesRes.data && statesRes.data.length >= 2) {
        setFromStateId(statesRes.data[0].id)
        setToStateId(statesRes.data[1].id)
      }
    } catch (err: unknown) {
      console.error('Erreur chargement prix:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger la grille de prix'
      )
    } finally {
      setLoading(false)
    }
  }, [supabase])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-TN', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount || 0) + ' TND'

  const handleOpenAdd = () => {
    if (states.length >= 2) {
      setFromStateId(states[0].id)
      setToStateId(states[states.length - 1].id)
    }
    setModelId('all_models')
    setPrice('1.50')
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fromStateId || !toStateId) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner les états de départ et d’arrivée.',
        variant: 'destructive',
      })
      return
    }

    if (fromStateId === toStateId) {
      toast({
        title: 'Transition invalide',
        description:
          "L'état d'arrivée doit être différent de l'état de départ.",
        variant: 'destructive',
      })
      return
    }

    const numPrice = parseFloat(price)
    if (isNaN(numPrice) || numPrice < 0) {
      toast({
        title: 'Erreur',
        description: 'Le prix doit être un nombre positif.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const targetModelId = modelId === 'all_models' ? null : modelId
      const nowIso = new Date().toISOString()

      const { error: insertErr } = await supabase.from('price_rules').insert({
        from_state_id: fromStateId,
        to_state_id: toStateId,
        model_id: targetModelId,
        price_per_piece: numPrice,
        valid_from: nowIso,
      })

      if (insertErr) throw insertErr

      toast({
        title: 'Règle tarifaire créée',
        description:
          'La nouvelle règle est active dès maintenant. L’ancienne règle est conservée dans l’historique.',
      })

      setDialogOpen(false)
      loadData()
    } catch (err: unknown) {
      console.error('Erreur ajout règle de prix:', err)
      toast({
        title: 'Erreur',
        description:
          err instanceof Error
            ? err.message
            : 'Impossible de créer la règle de prix.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const filteredRules = React.useMemo(() => {
    return rules.filter((r) => {
      if (!showHistory && !r.isCurrent) return false
      if (filterModel !== 'all') {
        if (filterModel === 'general' && r.model_id !== null) return false
        if (filterModel !== 'general' && r.model_id !== filterModel)
          return false
      }
      return true
    })
  }, [rules, showHistory, filterModel])

  if (loading) {
    return (
      <div className="container py-16 flex justify-center items-center">
        <LoadingSpinner size="lg" text="Chargement de la grille tarifaire..." />
      </div>
    )
  }

  return (
    <div className="container py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" /> Grille tarifaire &
            Règles de prix
          </h1>
          <p className="text-sm text-muted-foreground">
            Tarifs par pièce pour chaque transition d&apos;état (règles
            générales ou spécifiques par modèle)
          </p>
        </div>

        <Button onClick={handleOpenAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle règle de prix
        </Button>
      </div>

      {error && (
        <ErrorMessage
          title="Erreur de chargement"
          message={error}
          onRetry={loadData}
        />
      )}

      {/* Filter / Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-4 rounded-lg border">
        <div className="flex items-center gap-2 min-w-[240px]">
          <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={filterModel} onValueChange={setFilterModel}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrer par modèle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les modèles</SelectItem>
              <SelectItem value="general">Règles Générales uniquement</SelectItem>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  Modèle {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="show_history"
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <Label
            htmlFor="show_history"
            className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1.5"
          >
            <History className="h-4 w-4" />
            Afficher l&apos;historique des règles passées
          </Label>
        </div>
      </div>

      {/* Rules Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Tarifs appliqués ({filteredRules.length})</CardTitle>
          <CardDescription>
            Conformément aux règles comptables, une règle tarifaire n&apos;est
            jamais modifiée : une nouvelle version est créée avec date d&apos;effet
            immédiate, conservant l&apos;historique complet en lecture seule.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transition d&apos;état</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead className="text-right">Prix / pièce</TableHead>
                  <TableHead>Date d&apos;effet</TableHead>
                  <TableHead className="text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Aucune règle tarifaire trouvée.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRules.map((rule) => {
                    const isHistorical = !rule.isCurrent
                    return (
                      <TableRow
                        key={rule.id}
                        className={
                          isHistorical
                            ? 'opacity-50 bg-muted/20 text-muted-foreground'
                            : 'font-medium'
                        }
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {rule.from_state ? (
                              <StateBadge state={rule.from_state} />
                            ) : (
                              'Inconnu'
                            )}
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                            {rule.to_state ? (
                              <StateBadge state={rule.to_state} />
                            ) : (
                              'Inconnu'
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          {rule.model ? (
                            <Badge
                              variant="outline"
                              className="font-semibold text-foreground border-primary/40"
                            >
                              Modèle {rule.model.name}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              Général (Tous modèles)
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <span
                            className={
                              isHistorical
                                ? 'text-muted-foreground'
                                : 'text-base font-bold text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            {formatCurrency(Number(rule.price_per_piece))}
                          </span>
                        </TableCell>

                        <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                          {format(
                            new Date(rule.valid_from),
                            'dd/MM/yyyy HH:mm',
                            { locale: fr }
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          {rule.isCurrent ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-700 border-emerald-300"
                            >
                              En vigueur
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[11px] text-muted-foreground"
                            >
                              Historique (remplacé)
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Ajouter une règle tarifaire</DialogTitle>
              <DialogDescription>
                Définissez la transition d&apos;état concernée, le modèle cible
                et le tarif unitaire applicable.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Transition */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from_state">État de départ *</Label>
                  <Select
                    value={fromStateId}
                    onValueChange={setFromStateId}
                  >
                    <SelectTrigger id="from_state">
                      <SelectValue placeholder="Départ" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="to_state">État d&apos;arrivée *</Label>
                  <Select value={toStateId} onValueChange={setToStateId}>
                    <SelectTrigger id="to_state">
                      <SelectValue placeholder="Arrivée" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Modèle */}
              <div className="space-y-2">
                <Label htmlFor="price_model">Modèle concerné *</Label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger id="price_model">
                    <SelectValue placeholder="Portée de la règle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_models">
                      Général (S&apos;applique à tous les modèles)
                    </SelectItem>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        Modèle spécifique : {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Une règle spécifique à un modèle est toujours prioritaire sur
                  la règle générale.
                </p>
              </div>

              {/* Prix */}
              <div className="space-y-2">
                <Label htmlFor="price_input">Prix par pièce (TND) *</Label>
                <Input
                  id="price_input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Ex: 1.25"
                  required
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
                {submitting ? 'Création...' : 'Créer la règle de prix'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
