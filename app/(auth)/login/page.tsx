'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Lock, Mail } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

      if (authError) {
        if (
          authError.message.includes('Invalid login credentials') ||
          authError.message.includes('invalid_grant')
        ) {
          setError('Email ou mot de passe incorrect.')
        } else if (authError.message.includes('Email not confirmed')) {
          setError('Votre adresse email n’a pas encore été confirmée.')
        } else {
          setError(
            authError.message || 'Une erreur est survenue lors de la connexion.'
          )
        }
        setLoading(false)
        return
      }

      if (!authData.user) {
        setError('Impossible de récupérer la session utilisateur.')
        setLoading(false)
        return
      }

      // Fetch user profile to redirect according to role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single<Profile>()

      if (profileError || !profile) {
        // Fallback default redirection
        router.push('/subcontractor/batches')
        router.refresh()
        return
      }

      if (profile.role === 'admin') {
        router.push('/admin/batches')
      } else {
        router.push('/subcontractor/batches')
      }
      router.refresh()
    } catch (err: unknown) {
      console.error('Erreur inattendue de connexion :', err)
      setError('Une erreur inattendue est survenue. Veuillez réessayer.')
      setLoading(false)
    }
  }

  return (
    <Card className="w-full shadow-lg border-border">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-md">
          ST
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Suivi Sous-traitance
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Connectez-vous à votre espace de travail
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm font-medium">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Adresse email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="nom@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mot de passe</Label>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Les accès sont gérés par l’administrateur.
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
