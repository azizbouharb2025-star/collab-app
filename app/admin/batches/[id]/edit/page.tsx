import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ErrorMessage } from '@/components/shared/error-message'
import { BatchForm } from '../../batch-form'
import { AppModel, State, Profile, Batch } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface EditBatchPageProps {
  params: {
    id: string
  }
}

export default async function EditBatchPage({ params }: EditBatchPageProps) {
  const supabase = await createClient()

  // Fetch batch, models, states, subcontractors
  const [
    { data: batchData, error: batchError },
    { data: modelsData, error: modelsError },
    { data: statesData, error: statesError },
    { data: subcontractorsData, error: subsError },
  ] = await Promise.all([
    supabase.from('batches').select('*').eq('id', params.id).single(),
    supabase.from('models').select('*').order('name'),
    supabase.from('states').select('*').order('order'),
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'subcontractor')
      .order('full_name'),
  ])

  if (batchError || !batchData) {
    if (batchError?.code === 'PGRST116') {
      notFound()
    }
    return (
      <div className="container py-6 max-w-3xl mx-auto">
        <ErrorMessage
          title="Erreur"
          message={batchError?.message || 'Lot introuvable.'}
        />
      </div>
    )
  }

  if (modelsError || statesError || subsError) {
    return (
      <div className="container py-6 max-w-3xl mx-auto">
        <ErrorMessage
          title="Erreur de chargement"
          message="Impossible de charger les options de formulaire."
        />
      </div>
    )
  }

  return (
    <div className="container py-6">
      <BatchForm
        models={(modelsData || []) as AppModel[]}
        states={(statesData || []) as State[]}
        subcontractors={(subcontractorsData || []) as Profile[]}
        initialData={batchData as Batch}
        isEdit={true}
      />
    </div>
  )
}
