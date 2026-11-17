import * as React from 'react'
import { redirect } from 'next/navigation'
import { NavBar } from '@/components/shared/nav-bar'
import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SubcontractorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (!profile || profile.role !== 'subcontractor') {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 flex flex-col">
      <NavBar
        role="subcontractor"
        userName={profile.full_name || profile.email}
      />
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-4 sm:py-6">
        {children}
      </main>
    </div>
  )
}
