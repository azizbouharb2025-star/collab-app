import { createClient } from '@/lib/supabase/server'
import { ErrorMessage } from '@/components/shared/error-message'
import { BatchesClient, BatchWithUpdates } from './batches-client'
import { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminBatchesPage() {
  const supabase = await createClient()

  // 1. Fetch batches with relations and batch_updates
  const { data: batchesData, error: batchesError } = await supabase
    .from('batches')
    .select(`
      *,
      model:models(*),
      from_state:states!batches_from_state_id_fkey(*),
      expected_state:states!batches_expected_state_id_fkey(*),
      subcontractor:profiles!batches_subcontractor_id_fkey(*),
      batch_updates(id, quantity, to_state_id, created_at, original_update_id)
    `)
    .order('created_at', { ascending: false })

  // 2. Fetch subcontractors
  const { data: subcontractorsData, error: subsError } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'subcontractor')
    .order('full_name', { ascending: true })

  if (batchesError || subsError) {
    const errorMsg =
      batchesError?.message ||
      subsError?.message ||
      'Impossible de charger les lots.'
    return (
      <div className="container py-6">
        <ErrorMessage
          title="Erreur de chargement"
          message={errorMsg}
        />
      </div>
    )
  }

  const batches = (batchesData || []) as unknown as BatchWithUpdates[]
  const subcontractors = (subcontractorsData || []) as Profile[]

  return (
    <div className="container py-6 max-w-7xl mx-auto">
      <BatchesClient
        initialBatches={batches}
        subcontractors={subcontractors}
      />
    </div>
  )
}
