import * as React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Package,
  Calendar,
  ArrowRight,
  Filter,
  CheckCircle2,
  Clock,
  Send,
  Boxes,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BatchStatus, BatchWithRelations, Profile, State, AppModel } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BatchStatusBadge } from '@/components/shared/batch-status-badge'
import { StateBadge } from '@/components/shared/state-badge'
import { Stopwatch } from '@/components/shared/stopwatch'
import { cn, getBatchDisplayName } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: {
    model?: string
    status?: string
  }
}

const statusOrder: Record<BatchStatus, number> = {
  open: 1,
  sent: 2,
  completed: 3,
  closed: 4,
  draft: 5,
}

const statusFilters: { label: string; value?: BatchStatus }[] = [
  { label: 'Tous' },
  { label: 'En cours', value: 'open' },
  { label: 'Envoyés', value: 'sent' },
  { label: 'Terminés', value: 'completed' },
  { label: 'Clôturés', value: 'closed' },
]

export default async function SubcontractorBatchesPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Profil du sous-traitant
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  // Modèles pour filtres
  const { data: modelsData } = await supabase
    .from('models')
    .select('*')
    .order('name')
  const models = (modelsData as AppModel[]) || []

  // États pour mapping relations
  const { data: statesData } = await supabase
    .from('states')
    .select('*')
    .order('order')
  const states = (statesData as State[]) || []

  // Requête des lots assignés au sous-traitant
  let query = supabase
    .from('batches')
    .select('*, batch_models(id, quantity, model:models(*))')
    .eq('subcontractor_id', user.id)

  if (searchParams.model) {
    query = query.eq('model_id', searchParams.model)
  }

  if (searchParams.status) {
    query = query.eq('status', searchParams.status)
  }

  const { data: rawBatches } = await query

  // Associer les relations
  const defaultState: State = {
    id: '',
    name: 'Inconnu',
    order: 0,
    color: '#6b7280',
    is_final: false,
    created_at: new Date().toISOString(),
  }

  const defaultModel: AppModel = {
    id: '',
    name: 'Sans modèle',
    description: null,
    active: true,
    created_at: new Date().toISOString(),
  }

  const batches: (BatchWithRelations & {
    batch_models?: Array<{ id: string; quantity: number; model: AppModel }>
  })[] = (rawBatches || []).map((b) => {
    const rawBModels = (b as unknown as { batch_models?: Array<{ id: string; quantity: number; model: AppModel }> }).batch_models || []
    const model =
      rawBModels.length > 0
        ? {
            id: b.model_id || '',
            name: rawBModels.map((bm) => bm.model?.name).filter(Boolean).join(' + '),
            description: null,
            active: true,
            created_at: b.created_at,
          }
        : models.find((m) => m.id === b.model_id) || defaultModel

    const from_state = states.find((s) => s.id === b.from_state_id) || defaultState
    const expected_state = states.find((s) => s.id === b.expected_state_id) || defaultState
    const subcontractor = profile || {
      id: user.id,
      email: user.email || '',
      full_name: '',
      role: 'subcontractor' as const,
      active: true,
      created_at: new Date().toISOString(),
    }

    return {
      ...b,
      model,
      batch_models: rawBModels,
      from_state,
      expected_state,
      subcontractor,
    }
  })

  // Tri : lots ouverts en premier (1), puis envoyés (2), puis les autres, puis date DESC
  batches.sort((a, b) => {
    const diff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99)
    if (diff !== 0) return diff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  // Statistiques rapides pour le sous-traitant
  const openCount = batches.filter((b) => b.status === 'open').length
  const sentCount = batches.filter((b) => b.status === 'sent').length

  const buildQuery = (newParams: { model?: string | null; status?: string | null }) => {
    const params = new URLSearchParams()
    const targetModel =
      newParams.model !== undefined ? newParams.model : searchParams.model
    const targetStatus =
      newParams.status !== undefined ? newParams.status : searchParams.status

    if (targetModel) params.set('model', targetModel)
    if (targetStatus) params.set('status', targetStatus)

    const str = params.toString()
    return str ? `?${str}` : '/subcontractor/batches'
  }

  return (
    <div className="space-y-5 pb-10">
      {/* En-tête */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Mes lots
          </h1>
          {(openCount > 0 || sentCount > 0) && (
            <div className="flex items-center gap-1.5">
              {openCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <Clock className="h-3 w-3" />
                  {openCount} en cours
                </span>
              )}
              {sentCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                  <Send className="h-3 w-3" />
                  {sentCount} à ouvrir
                </span>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {profile?.full_name ? `Bonjour, ${profile.full_name}` : 'Espace sous-traitant'} — suivez et saisissez l’avancement de vos pièces.
        </p>
      </div>

      {/* Filtres scrollables horizontaux (Mobile-first chips) */}
      <div className="space-y-2.5">
        {/* Filtre par modèle */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Boxes className="h-3.5 w-3.5" />
            <span>Modèle</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 -mx-1 px-1 scrollbar-none">
            <Link
              href={buildQuery({ model: null })}
              className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95',
                !searchParams.model
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Tous les modèles
            </Link>
            {models.map((model) => (
              <Link
                key={model.id}
                href={buildQuery({ model: model.id })}
                className={cn(
                  'inline-flex shrink-0 items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95',
                  searchParams.model === model.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {model.name}
              </Link>
            ))}
          </div>
        </div>

        {/* Filtre par statut */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>Statut</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 -mx-1 px-1 scrollbar-none">
            {statusFilters.map((sf) => {
              const isActive = sf.value
                ? searchParams.status === sf.value
                : !searchParams.status

              return (
                <Link
                  key={sf.label}
                  href={buildQuery({ status: sf.value || null })}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95',
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {sf.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Liste des cartes de lots */}
      {batches.length === 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="rounded-full bg-blue-50 dark:bg-blue-950/50 p-4 mb-3 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Aucun lot pour le moment
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              {searchParams.model || searchParams.status
                ? 'Aucun lot ne correspond aux filtres sélectionnés. Essayez de réinitialiser vos filtres.'
                : 'Vous êtes à jour ! Dès qu’un nouveau lot de pièces vous sera assigné, il apparaîtra ici.'}
            </p>
            {(searchParams.model || searchParams.status) && (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/subcontractor/batches">Réinitialiser les filtres</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const shortId = batch.id.slice(0, 8).toUpperCase()
            const dateDisplay = batch.sent_at
              ? format(new Date(batch.sent_at), 'dd/MM/yyyy HH:mm', { locale: fr })
              : format(new Date(batch.created_at), 'dd/MM/yyyy HH:mm', { locale: fr })

            const isOpen = batch.status === 'open'
            const isSent = batch.status === 'sent'

            return (
              <Card
                key={batch.id}
                className={cn(
                  'shadow-sm transition-all hover:shadow-md border overflow-hidden',
                  isOpen && 'border-amber-300 dark:border-amber-800 ring-1 ring-amber-300/50 dark:ring-amber-800/50',
                  isSent && 'border-blue-300 dark:border-blue-800'
                )}
              >
                <CardContent className="p-4 sm:p-5 space-y-3.5">
                  {/* Titre & Statut */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                          {getBatchDisplayName(batch)}
                        </span>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          #{shortId}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Modèles : {batch.model.name}
                      </p>
                    </div>
                    <BatchStatusBadge status={batch.status} />
                  </div>

                  {/* Transition prévue : État départ → État prévu */}
                  <div className="flex items-center gap-1.5 flex-wrap bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-medium text-muted-foreground">Transition :</span>
                    <StateBadge state={batch.from_state} />
                    <span className="text-xs font-semibold text-muted-foreground">→</span>
                    <StateBadge state={batch.expected_state} />
                  </div>

                  {/* Infos Quantité et Date */}
                  <div className="grid grid-cols-2 gap-2 text-sm pt-0.5">
                    <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2">
                      <Package className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div>
                        <p className="text-[11px] text-muted-foreground leading-none">Quantité totale</p>
                        <p className="text-sm font-bold text-foreground mt-0.5">
                          {batch.quantity} pièces
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2">
                      <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-[11px] text-muted-foreground leading-none">Date d’envoi</p>
                        <p className="text-xs font-semibold text-foreground mt-0.5 truncate">
                          {batch.sent_at
                            ? format(new Date(batch.sent_at), 'dd/MM HH:mm', { locale: fr })
                            : 'Non daté'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Si statut = open : Chronomètre actif */}
                  {isOpen && (
                    <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-spin-slow" />
                        <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                          Chronomètre en cours
                        </span>
                      </div>
                      <Stopwatch
                        startTime={batch.opened_at}
                        className="text-amber-950 dark:text-amber-100 font-bold"
                      />
                    </div>
                  )}

                  {/* Note éventuelle */}
                  {batch.note && (
                    <p className="text-xs text-muted-foreground italic bg-muted/20 p-2 rounded border border-dashed border-muted">
                      Note : {batch.note}
                    </p>
                  )}

                  {/* Bouton Ouvrir le lot */}
                  <div className="pt-1">
                    <Button
                      asChild
                      className={cn(
                        'w-full h-12 text-base font-semibold shadow-sm transition-all active:scale-[0.98]',
                        isSent && 'bg-blue-600 hover:bg-blue-700 text-white',
                        isOpen && 'bg-amber-600 hover:bg-amber-700 text-white'
                      )}
                      size="lg"
                    >
                      <Link href={`/subcontractor/batches/${batch.id}`}>
                        {isSent ? 'Ouvrir le lot' : isOpen ? 'Continuer la saisie' : 'Consulter le lot'}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
