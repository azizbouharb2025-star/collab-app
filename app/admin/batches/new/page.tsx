import { createClient } from '@/lib/supabase/server'
import { ErrorMessage } from '@/components/shared/error-message'
import { BatchForm } from '../batch-form'
import { AppModel, State, Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function NewBatchPage() {
  const supabase = await createClient()

  // Fetch models, states, subcontractors
  const [
    { data: modelsData, error: modelsError },
    { data: statesData, error: statesError },
    { data: subcontractorsData, error: subsError },
  ] = await Promise.all([
    supabase.from('models').select('*').eq('active', true).order('name'),
    supabase.from('states').select('*').order('order'),
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'subcontractor')
      .eq('active', true)
      .order('full_name'),
  ])

  if (modelsError || statesError || subsError) {
    const errorMsg =
      modelsError?.message ||
      statesError?.message ||
      subsError?.message ||
      'Impossible de charger les données nécessaires.'
    return (
      <div className="container py-6 max-w-3xl mx-auto">
        <ErrorMessage
          title="Erreur de chargement"
          message={errorMsg}
        />
      </div>
    )
  }

  const models = (modelsData || []) as AppModel[]
  const states = (statesData || []) as State[]
  const subcontractors = (subcontractorsData || []) as Profile[]

  return (
    <div className="container py-6">
      <BatchForm
        models={models}
        states={states}
        subcontractors={subcontractors}
        isEdit={false}
      />
    </div>
  )
}
