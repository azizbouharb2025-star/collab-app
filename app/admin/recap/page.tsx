'use client'

import * as React from 'react'
import {
  format,
  subDays,
  startOfDay,
  endOfDay,
  parseISO,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  CheckCircle2,
  Euro,
  Layers,
  Clock,
  Filter,
  TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

import { createClient } from '@/lib/supabase/client'
import { AppModel, State, Profile } from '@/lib/types'
import { KpiCard } from '@/components/shared/kpi-card'
import { ExportButton } from '@/components/shared/export-button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ErrorMessage } from '@/components/shared/error-message'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BatchUpdateRow {
  id: string
  quantity: number
  price_per_piece: number
  amount: number
  duration_seconds: number | null
  created_at: string
  original_update_id: string | null
  to_state_id: string
  to_state: {
    id: string
    name: string
    color: string
    is_final: boolean
  }
  batch: {
    id: string
    model_id: string
    subcontractor_id: string
    from_state_id: string
    model: {
      name: string
    }
    from_state: {
      name: string
    }
    subcontractor: {
      full_name: string
      email: string
    }
  }
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export default function AdminRecapPage() {
  const supabase = createClient()
  const [mounted, setMounted] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Filter options loaded from DB
  const [models, setModels] = React.useState<AppModel[]>([])
  const [states, setStates] = React.useState<State[]>([])
  const [subcontractors, setSubcontractors] = React.useState<Profile[]>([])

  // Raw updates for client-side filtering and chart calculations
  const [allUpdates, setAllUpdates] = React.useState<BatchUpdateRow[]>([])

  // Filter states
  const [period, setPeriod] = React.useState<string>('30d') // today, 7d, 30d, custom
  const [customStartDate, setCustomStartDate] = React.useState<string>('')
  const [customEndDate, setCustomEndDate] = React.useState<string>('')
  const [selectedModel, setSelectedModel] = React.useState<string>('all')
  const [selectedState, setSelectedState] = React.useState<string>('all')
  const [selectedSub, setSelectedSub] = React.useState<string>('all')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Initial load of filter options & all updates
  const loadInitialData = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [modelsRes, statesRes, subsRes, updatesRes] = await Promise.all([
        supabase.from('models').select('*').order('name'),
        supabase.from('states').select('*').order('order'),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'subcontractor')
          .order('full_name'),
        supabase
          .from('batch_updates')
          .select(`
            id,
            quantity,
            price_per_piece,
            amount,
            duration_seconds,
            created_at,
            original_update_id,
            to_state_id,
            to_state:states!batch_updates_to_state_id_fkey(id, name, color, is_final),
            batch:batches!batch_updates_batch_id_fkey(
              id,
              model_id,
              subcontractor_id,
              from_state_id,
              model:models(name),
              from_state:states!batches_from_state_id_fkey(name),
              subcontractor:profiles!batches_subcontractor_id_fkey(full_name, email)
            )
          `)
          .order('created_at', { ascending: false }),
      ])

      if (modelsRes.error) throw modelsRes.error
      if (statesRes.error) throw statesRes.error
      if (subsRes.error) throw subsRes.error
      if (updatesRes.error) throw updatesRes.error

      setModels(modelsRes.data || [])
      setStates(statesRes.data || [])
      setSubcontractors(subsRes.data || [])
      setAllUpdates((updatesRes.data || []) as unknown as BatchUpdateRow[])
    } catch (err: unknown) {
      console.error('Erreur chargement recap:', err)
      setError(
        err instanceof Error ? err.message : 'Erreur lors du chargement des données'
      )
    } finally {
      setLoading(false)
    }
  }, [supabase])

  React.useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Compute date boundaries
  const dateRange = React.useMemo(() => {
    const now = new Date()
    if (period === 'today') {
      return { from: startOfDay(now), to: endOfDay(now) }
    }
    if (period === '7d') {
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) }
    }
    if (period === '30d') {
      return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) }
    }
    if (period === 'custom') {
      return {
        from: customStartDate ? startOfDay(parseISO(customStartDate)) : null,
        to: customEndDate ? endOfDay(parseISO(customEndDate)) : null,
      }
    }
    return { from: null, to: null }
  }, [period, customStartDate, customEndDate])

  // Filter updates based on selections
  const filteredUpdates = React.useMemo(() => {
    return allUpdates.filter((update) => {
      // Exclude superseded updates
      if (update.original_update_id) return false

      const updateDate = new Date(update.created_at)

      // Date check
      if (dateRange.from && updateDate < dateRange.from) return false
      if (dateRange.to && updateDate > dateRange.to) return false

      // Model check
      if (
        selectedModel !== 'all' &&
        update.batch?.model_id !== selectedModel
      ) {
        return false
      }

      // State check
      if (
        selectedState !== 'all' &&
        update.to_state_id !== selectedState
      ) {
        return false
      }

      // Subcontractor check
      if (
        selectedSub !== 'all' &&
        update.batch?.subcontractor_id !== selectedSub
      ) {
        return false
      }

      return true
    })
  }, [allUpdates, dateRange, selectedModel, selectedState, selectedSub])

  // Formatters
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)

  // Compute 4 KPIs
  const totalPieces = React.useMemo(
    () => filteredUpdates.reduce((sum, u) => sum + (u.quantity || 0), 0),
    [filteredUpdates]
  )

  const firstChoiceRate = React.useMemo(() => {
    if (totalPieces === 0) return 0
    const firstChoicePieces = filteredUpdates
      .filter((u) => {
        const name = u.to_state?.name?.toLowerCase() || ''
        return name.includes('1er choix') || name.includes('premier choix')
      })
      .reduce((sum, u) => sum + u.quantity, 0)
    return Math.round((firstChoicePieces / totalPieces) * 100)
  }, [filteredUpdates, totalPieces])

  const avgDurationMinutes = React.useMemo(() => {
    const validWithDuration = filteredUpdates.filter(
      (u) => u.duration_seconds && u.duration_seconds > 0
    )
    if (validWithDuration.length === 0) return 0
    const totalSecs = validWithDuration.reduce(
      (sum, u) => sum + (u.duration_seconds || 0),
      0
    )
    return Math.round(totalSecs / validWithDuration.length / 60)
  }, [filteredUpdates])

  const totalAmount = React.useMemo(
    () => filteredUpdates.reduce((sum, u) => sum + Number(u.amount || 0), 0),
    [filteredUpdates]
  )

  // Chart 1: BarChart répartition par état final (nb pièces)
  const stateDistributionData = React.useMemo(() => {
    const map = new Map<string, { name: string; count: number; color: string }>()
    filteredUpdates.forEach((u) => {
      const stateName = u.to_state?.name || 'Inconnu'
      const stateColor = u.to_state?.color || '#3b82f6'
      const prev = map.get(stateName) || {
        name: stateName,
        count: 0,
        color: stateColor,
      }
      prev.count += u.quantity
      map.set(stateName, prev)
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [filteredUpdates])

  // Chart 2: PieChart répartition par modèle (montants)
  const modelAmountData = React.useMemo(() => {
    const map = new Map<string, number>()
    filteredUpdates.forEach((u) => {
      const modelName = u.batch?.model?.name || 'Modèle non spécifié'
      map.set(modelName, (map.get(modelName) || 0) + Number(u.amount || 0))
    })
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredUpdates])

  // Chart 3: BarChart activité journalière (pièces traitées par jour)
  const dailyActivityData = React.useMemo(() => {
    const map = new Map<string, number>()
    filteredUpdates.forEach((u) => {
      const dayKey = format(new Date(u.created_at), 'dd/MM', { locale: fr })
      map.set(dayKey, (map.get(dayKey) || 0) + u.quantity)
    })
    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .reverse()
  }, [filteredUpdates])

  // Chart 4: BarChart gains par sous-traitant
  const subEarningsData = React.useMemo(() => {
    const map = new Map<string, number>()
    filteredUpdates.forEach((u) => {
      const subName =
        u.batch?.subcontractor?.full_name ||
        u.batch?.subcontractor?.email ||
        'Sous-traitant'
      map.set(subName, (map.get(subName) || 0) + Number(u.amount || 0))
    })
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [filteredUpdates])

  // Export CSV Data
  const exportData = React.useMemo(() => {
    return filteredUpdates.map((u) => ({
      Date: format(new Date(u.created_at), 'dd/MM/yyyy HH:mm', { locale: fr }),
      Modèle: u.batch?.model?.name || '',
      'Sous-traitant':
        u.batch?.subcontractor?.full_name || u.batch?.subcontractor?.email || '',
      'État de départ': u.batch?.from_state?.name || '',
      'État cible': u.to_state?.name || '',
      Quantité: u.quantity,
      'Prix unitaire': Number(u.price_per_piece).toFixed(2) + ' €',
      'Montant total': Number(u.amount).toFixed(2) + ' €',
      'Durée (secondes)': u.duration_seconds || '',
    }))
  }, [filteredUpdates])

  if (loading) {
    return (
      <div className="container py-16 flex justify-center items-center">
        <LoadingSpinner size="lg" text="Chargement du tableau de bord..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container py-8 max-w-4xl mx-auto">
        <ErrorMessage
          title="Erreur lors du chargement des KPIs"
          message={error}
          onRetry={loadInitialData}
        />
      </div>
    )
  }

  return (
    <div className="container py-6 max-w-7xl mx-auto space-y-6">
      {/* Title & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Tableau de bord & Récapitulatif
          </h1>
          <p className="text-sm text-muted-foreground">
            Suivi des volumes de production, performance qualité et analyse des coûts
          </p>
        </div>

        <ExportButton
          data={exportData}
          filename={`recapitulatif-production-${format(new Date(), 'yyyyMMdd')}`}
          label="Exporter les données (CSV)"
        />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filtres d&apos;analyse
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Période */}
            <div className="space-y-1.5">
              <Label className="text-xs">Période</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Aujourd&apos;hui</SelectItem>
                  <SelectItem value="7d">7 derniers jours</SelectItem>
                  <SelectItem value="30d">30 derniers jours</SelectItem>
                  <SelectItem value="custom">Personnalisée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Modèle */}
            <div className="space-y-1.5">
              <Label className="text-xs">Modèle</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les modèles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les modèles</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* État */}
            <div className="space-y-1.5">
              <Label className="text-xs">État cible</Label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les états" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les états</SelectItem>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sous-traitant */}
            <div className="space-y-1.5">
              <Label className="text-xs">Sous-traitant</Label>
              <Select value={selectedSub} onValueChange={setSelectedSub}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les sous-traitants" />
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

          {/* Custom Date Inputs */}
          {period === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pt-3 border-t">
              <div className="space-y-1">
                <Label className="text-xs">Date début</Label>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date fin</Label>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4 KPIs Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Pièces traitées"
          value={totalPieces.toLocaleString('fr-FR')}
          description="Total sur la sélection"
          icon={<Layers className="h-5 w-5 text-primary" />}
        />

        <KpiCard
          title="Taux vers 1er choix"
          value={`${firstChoiceRate}%`}
          description="Ratio conformité supérieure"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        />

        <KpiCard
          title="Temps moyen par lot"
          value={
            avgDurationMinutes > 0 ? `${avgDurationMinutes} min` : 'Non renseigné'
          }
          description="Durée moyenne constatée"
          icon={<Clock className="h-5 w-5 text-amber-500" />}
        />

        <KpiCard
          title="Montant total dû"
          value={formatCurrency(totalAmount)}
          description="Cumul des montants tarifés"
          icon={<Euro className="h-5 w-5 text-blue-600" />}
        />
      </div>

      {/* 4 Charts Grid */}
      {mounted && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1 : Répartition par état final */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Répartition par état final
              </CardTitle>
              <CardDescription>
                Nombre total de pièces par état de résultat
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {stateDistributionData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée disponible
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stateDistributionData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val: number) => [`${val} pièces`, 'Quantité']}
                    />
                    <Bar dataKey="count" name="Pièces" radius={[4, 4, 0, 0]}>
                      {stateDistributionData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Chart 2 : Répartition par modèle (Montants) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Répartition des montants par modèle
              </CardTitle>
              <CardDescription>
                Part de chaque modèle dans le coût global (€)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {modelAmountData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée disponible
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={modelAmountData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      innerRadius={45}
                      paddingAngle={3}
                      label={({ name, percent }) =>
                        `${name} (${(percent * 100).toFixed(0)}%)`
                      }
                      labelLine={false}
                    >
                      {modelAmountData.map((entry, index) => (
                        <Cell
                          key={`cell-model-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number) => [formatCurrency(val), 'Montant']}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Chart 3 : Activité journalière (Pièces traitées) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Activité journalière
              </CardTitle>
              <CardDescription>
                Volume de pièces traitées par jour
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {dailyActivityData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aucune activité enregistrée sur cette période
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dailyActivityData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val: number) => [`${val} pièces`, 'Traitées']}
                    />
                    <Bar
                      dataKey="count"
                      name="Pièces traitées"
                      fill="#2563eb"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Chart 4 : Gains par sous-traitant */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Gains par sous-traitant
              </CardTitle>
              <CardDescription>
                Montants générés et dus par sous-traitant
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {subEarningsData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aucun montant enregistré
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={subEarningsData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val: number) => [formatCurrency(val), 'Gains']}
                    />
                    <Bar
                      dataKey="amount"
                      name="Montant dû"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
