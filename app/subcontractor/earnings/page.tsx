'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Coins,
  TrendingUp,
  Calendar,
  Package,
  Filter,
  PieChart as PieIcon,
  BarChart3,
  Layers,
  ArrowRight,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { AppModel, BatchUpdate, EarningsByModel, EarningsByTransition } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/shared/kpi-card'
import { ErrorMessage } from '@/components/shared/error-message'
import { cn } from '@/lib/utils'

function formatEUR(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

type PeriodOption = 'today' | '7d' | '30d' | 'all'

const PERIOD_LABELS: Record<PeriodOption, string> = {
  today: "Aujourd'hui",
  '7d': '7 jours',
  '30d': '30 jours',
  all: 'Tout',
}

const PIE_COLORS = [
  '#2563eb', // Bleu
  '#10b981', // Vert émeraude
  '#f59e0b', // Ambre
  '#8b5cf6', // Violet
  '#ec4899', // Rose
  '#06b6d4', // Cyan
  '#64748b', // Ardoise
]

interface EarningsSummaryResponse {
  total_day: number
  total_week: number
  total_month: number
  by_model: EarningsByModel[]
  by_transition: EarningsByTransition[]
}

export default function SubcontractorEarningsPage() {
  const [period, setPeriod] = React.useState<PeriodOption>('30d')
  const [selectedModelId, setSelectedModelId] = React.useState<string>('all')
  const [models, setModels] = React.useState<AppModel[]>([])

  const [summary, setSummary] = React.useState<EarningsSummaryResponse>({
    total_day: 0,
    total_week: 0,
    total_month: 0,
    by_model: [],
    by_transition: [],
  })

  const [piecesMonth, setPiecesMonth] = React.useState<number>(0)
  const [dailyData, setDailyData] = React.useState<
    { date: string; label: string; montant: number; pieces: number }[]
  >([])

  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)
  const [mounted, setMounted] = React.useState<boolean>(false)

  const supabase = React.useMemo(() => createClient(), [])

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Charger la liste des modèles
  React.useEffect(() => {
    async function fetchModels() {
      const { data } = await supabase
        .from('models')
        .select('*')
        .order('name')
      if (data) setModels(data)
    }
    fetchModels()
  }, [supabase])

  // Charger les gains selon la période et le modèle sélectionné
  const loadEarningsData = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // 1. Calculer la date de début selon la période sélectionnée
      let fromDate: string | null = null
      const now = new Date()

      if (period === 'today') {
        const start = new Date(now)
        start.setHours(0, 0, 0, 0)
        fromDate = start.toISOString()
      } else if (period === '7d') {
        const start = new Date(now)
        start.setDate(start.getDate() - 7)
        fromDate = start.toISOString()
      } else if (period === '30d') {
        const start = new Date(now)
        start.setDate(start.getDate() - 30)
        fromDate = start.toISOString()
      }

      const modelIdParam = selectedModelId !== 'all' ? selectedModelId : null

      // 2. Appel RPC get_earnings_summary
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'get_earnings_summary',
        {
          p_subcontractor_id: null, // null = l'utilisateur connecté
          p_from_date: fromDate,
          p_to_date: null,
          p_model_id: modelIdParam,
        }
      )

      if (rpcErr) throw rpcErr

      if (rpcData) {
        setSummary({
          total_day: Number(rpcData.total_day) || 0,
          total_week: Number(rpcData.total_week) || 0,
          total_month: Number(rpcData.total_month) || 0,
          by_model: Array.isArray(rpcData.by_model) ? rpcData.by_model : [],
          by_transition: Array.isArray(rpcData.by_transition) ? rpcData.by_transition : [],
        })
      }

      // 3. Charger les batch_updates récents pour le graphique des 30 jours et pièces ce mois
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      thirtyDaysAgo.setHours(0, 0, 0, 0)

      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      // Récupérer les lots pour filtrer par modèle côté client de façon fiable
      const { data: batchesData } = await supabase
        .from('batches')
        .select('id, model_id')

      const validBatchIds = new Set(
        (batchesData || [])
          .filter((b) => modelIdParam === null || b.model_id === modelIdParam)
          .map((b) => b.id)
      )

      const { data: updatesData, error: updatesErr } = await supabase
        .from('batch_updates')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true })

      if (updatesErr) {
        console.warn('Avertissement chargement batch_updates:', updatesErr)
      } else if (updatesData) {
        // Filtrer les mises à jour actives et appartenant aux lots ciblés
        const filtered = (updatesData as BatchUpdate[]).filter(
          (u) =>
            validBatchIds.has(u.batch_id) &&
            !(u as unknown as { original_update_id?: string }).original_update_id
        )

        // Calcul des pièces traitées ce mois
        const piecesThisMonth = filtered
          .filter((u) => new Date(u.created_at) >= startOfMonth)
          .reduce((sum, u) => sum + (u.quantity || 0), 0)
        setPiecesMonth(piecesThisMonth)

        // Construction du tableau journalier sur 30 jours
        const dailyMap = new Map<
          string,
          { date: string; label: string; montant: number; pieces: number }
        >()

        for (let i = 29; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const key = format(d, 'yyyy-MM-dd')
          const label = format(d, 'dd/MM', { locale: fr })
          dailyMap.set(key, { date: key, label, montant: 0, pieces: 0 })
        }

        filtered.forEach((u) => {
          const key = format(new Date(u.created_at), 'yyyy-MM-dd')
          const entry = dailyMap.get(key)
          if (entry) {
            entry.montant += Number(u.amount) || 0
            entry.pieces += u.quantity || 0
          }
        })

        setDailyData(Array.from(dailyMap.values()))
      }
    } catch (err: unknown) {
      console.error('Erreur chargement gains:', err)
      const msg =
        err instanceof Error ? err.message : 'Erreur lors du calcul des gains.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [period, selectedModelId, supabase])

  React.useEffect(() => {
    loadEarningsData()
  }, [loadEarningsData])

  return (
    <div className="space-y-5 pb-16">
      {/* En-tête */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Mes gains
        </h1>
        <p className="text-sm text-muted-foreground">
          Visualisez votre rémunération et vos statistiques de production en temps réel.
        </p>
      </div>

      {/* Barre de filtres : Période & Modèle */}
      <Card className="shadow-sm border">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>Filtres de reporting</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Période (Boutons tactiles) */}
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              {(['today', '7d', '30d', 'all'] as PeriodOption[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'flex-1 text-center py-2 text-xs font-medium rounded-md transition-all active:scale-95',
                    period === p
                      ? 'bg-background text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>

            {/* Modèle (Select) */}
            <div>
              <Select
                value={selectedModelId}
                onValueChange={(val) => setSelectedModelId(val)}
              >
                <SelectTrigger className="h-10 text-xs sm:text-sm">
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
          </div>
        </CardContent>
      </Card>

      {/* Erreur */}
      {error && (
        <ErrorMessage
          title="Erreur de chargement"
          message={error}
          onRetry={loadEarningsData}
        />
      )}

      {/* 4 CARTES KPIS */}
      <div className="grid grid-cols-2 gap-3">
        {loading ? (
          <>
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </>
        ) : (
          <>
            <KpiCard
              title="Aujourd'hui"
              value={formatEUR(summary.total_day)}
              icon={<Coins className="h-5 w-5 text-amber-500" />}
              description="Gains du jour"
            />
            <KpiCard
              title="Cette semaine"
              value={formatEUR(summary.total_week)}
              icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
              description="7 derniers jours"
            />
            <KpiCard
              title="Ce mois"
              value={formatEUR(summary.total_month)}
              icon={<Calendar className="h-5 w-5 text-emerald-500" />}
              description="30 derniers jours"
            />
            <KpiCard
              title="Pièces ce mois"
              value={`${piecesMonth} pce${piecesMonth > 1 ? 's' : ''}`}
              icon={<Package className="h-5 w-5 text-purple-500" />}
              description="Production mensuelle"
            />
          </>
        )}
      </div>

      {/* GRAPHIQUE 1 : GAINS PAR JOUR SUR 30 JOURS (BarChart) */}
      <Card className="shadow-sm border">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span>Gains journaliers (30 derniers jours)</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Évolution de votre rémunération journalière cumulée.
          </p>
        </CardHeader>
        <CardContent className="p-3 sm:p-5 pt-2">
          {loading || !mounted ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : dailyData.length === 0 || dailyData.every((d) => d.montant === 0) ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
              <Coins className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Aucun gain enregistré sur les 30 derniers jours</p>
              <p className="text-xs">Vos gains quotidiens s’afficheront sous forme de barres ici.</p>
            </div>
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={typeof window !== 'undefined' && window.innerWidth < 640 ? 4 : 2}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(val) => `${val}€`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [formatEUR(Number(value)), 'Gains']}
                    labelFormatter={(label) => `Date : ${label}`}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <Bar dataKey="montant" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GRAPHIQUE 2 : RÉPARTITION PAR MODÈLE (PieChart ou BarChart) */}
      <Card className="shadow-sm border">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-primary" />
            <span>Répartition par modèle</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Montants générés selon les modèles traités sur la période.
          </p>
        </CardHeader>
        <CardContent className="p-3 sm:p-5 pt-2">
          {loading || !mounted ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : summary.by_model.length === 0 ? (
            <div className="h-[180px] flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
              <PieIcon className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Aucune donnée par modèle</p>
              <p className="text-xs">Traitez des pièces pour visualiser la répartition.</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="h-[200px] w-full sm:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.by_model}
                      dataKey="total"
                      nameKey="model_name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={40}
                      paddingAngle={3}
                    >
                      {summary.by_model.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [formatEUR(Number(value)), 'Total']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Légende détaillée */}
              <div className="w-full sm:w-1/2 space-y-2">
                {summary.by_model.map((m, index) => {
                  const color = PIE_COLORS[index % PIE_COLORS.length]
                  return (
                    <div
                      key={m.model_name}
                      className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-semibold text-foreground truncate max-w-[120px]">
                          {m.model_name}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {formatEUR(m.total)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TABLEAU RÉCAPITULATIF PAR TRANSITION */}
      <Card className="shadow-sm border">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span>Récapitulatif par transition</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Détail des pièces et montants générés selon les états de départ et d’arrivée.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : summary.by_transition.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs">
              Aucune transition enregistrée sur la période sélectionnée.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-bold">Transition</TableHead>
                    <TableHead className="text-xs font-bold text-right">Nb pièces</TableHead>
                    <TableHead className="text-xs font-bold text-right">Total €</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.by_transition.map((t, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-medium py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-muted text-[11px] font-semibold text-muted-foreground">
                            {t.from_state}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold">
                            {t.to_state}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-right py-3">
                        {t.count}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-right py-3 text-emerald-600 dark:text-emerald-400">
                        {formatEUR(t.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
