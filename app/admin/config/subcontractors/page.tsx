'use client'

import * as React from 'react'
import {
  Plus,
  Users,
  CheckCircle2,
  XCircle,
  Power,
  ExternalLink,
  Info,
  Copy,
  Check,
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
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

interface CreatedAccountInfo {
  email: string
  fullName: string
  tempPassword?: string
}

export default function AdminConfigSubcontractorsPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [subcontractors, setSubcontractors] = React.useState<Profile[]>([])

  // Create Dialog
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [formEmail, setFormEmail] = React.useState('')
  const [formName, setFormName] = React.useState('')
  const [formPassword, setFormPassword] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  // Success credentials modal
  const [createdInfo, setCreatedInfo] = React.useState<CreatedAccountInfo | null>(
    null
  )
  const [copied, setCopied] = React.useState(false)

  const loadSubcontractors = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'subcontractor')
        .order('full_name', { ascending: true })

      if (fetchErr) throw fetchErr
      setSubcontractors(data || [])
    } catch (err: unknown) {
      console.error('Erreur chargement sous-traitants:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger la liste des sous-traitants'
      )
    } finally {
      setLoading(false)
    }
  }, [supabase])

  React.useEffect(() => {
    loadSubcontractors()
  }, [loadSubcontractors])

  const handleOpenCreate = () => {
    setFormEmail('')
    setFormName('')
    setFormPassword('')
    setDialogOpen(true)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formEmail.trim() || !formName.trim()) {
      toast({
        title: 'Erreur',
        description: 'L’email et le nom complet sont requis.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/subcontractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formEmail.trim(),
          full_name: formName.trim(),
          password: formPassword.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création du compte')
      }

      toast({
        title: 'Compte sous-traitant créé',
        description: `Le profil pour ${formName} a été configuré avec succès.`,
      })

      setCreatedInfo({
        email: formEmail.trim(),
        fullName: formName.trim(),
        tempPassword: data.tempPassword,
      })

      setDialogOpen(false)
      loadSubcontractors()
    } catch (err: unknown) {
      console.error('Erreur création sous-traitant:', err)
      toast({
        title: 'Échec de la création',
        description:
          err instanceof Error
            ? err.message
            : 'Impossible de créer le sous-traitant.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (sub: Profile) => {
    try {
      const newStatus = !sub.active
      const { error: toggleErr } = await supabase
        .from('profiles')
        .update({
          active: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)

      if (toggleErr) throw toggleErr

      setSubcontractors((prev) =>
        prev.map((item) =>
          item.id === sub.id ? { ...item, active: newStatus } : item
        )
      )

      toast({
        title: newStatus ? 'Sous-traitant activé' : 'Sous-traitant désactivé',
        description: `L'accès pour ${sub.full_name || sub.email} est désormais ${
          newStatus ? 'actif' : 'inactif'
        }.`,
      })
    } catch (err: unknown) {
      console.error('Erreur toggle sous-traitant:', err)
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le statut.',
        variant: 'destructive',
      })
    }
  }

  const handleCopyCredentials = () => {
    if (!createdInfo) return
    const text = `Identifiants de connexion :\nEmail : ${createdInfo.email}\nMot de passe temporaire : ${createdInfo.tempPassword}\nLien : ${window.location.origin}/login`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({
      title: 'Copié !',
      description: 'Les identifiants ont été copiés dans le presse-papier.',
    })
  }

  if (loading) {
    return (
      <div className="container py-16 flex justify-center items-center">
        <LoadingSpinner
          size="lg"
          text="Chargement des comptes sous-traitants..."
        />
      </div>
    )
  }

  return (
    <div className="container py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Gestion des
            sous-traitants
          </h1>
          <p className="text-sm text-muted-foreground">
            Comptes d&apos;accès ouvrant l&apos;application mobile pour la saisie
            des lots et le suivi des gains
          </p>
        </div>

        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau sous-traitant
        </Button>
      </div>

      {error && (
        <ErrorMessage
          title="Erreur"
          message={error}
          onRetry={loadSubcontractors}
        />
      )}

      {/* Manual Supabase Auth Instructions Card */}
      <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-blue-900 dark:text-blue-100">
                Création et gestion des utilisateurs
              </p>
              <p className="text-blue-700 dark:text-blue-300 text-xs mt-0.5">
                Vous pouvez créer les comptes directement ci-dessus, ou
                manuellement dans le dashboard Supabase Auth. Le trigger
                PostgreSQL créera automatiquement le profil avec le rôle
                sous-traitant.
              </p>
            </div>
          </div>

          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Button
              variant="outline"
              size="sm"
              className="text-xs bg-background"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Supabase Auth
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Subcontractors Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>
            Comptes sous-traitants ({subcontractors.length})
          </CardTitle>
          <CardDescription>
            Tous les profils enregistrés avec le rôle sous-traitant dans la base
            de données
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom complet</TableHead>
                  <TableHead>Adresse Email</TableHead>
                  <TableHead>Statut d&apos;accès</TableHead>
                  <TableHead>Date d&apos;inscription</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subcontractors.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Aucun sous-traitant configuré.
                    </TableCell>
                  </TableRow>
                ) : (
                  subcontractors.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-semibold text-foreground">
                        {sub.full_name || 'Non renseigné'}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {sub.email}
                      </TableCell>

                      <TableCell>
                        {sub.active ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-300 flex items-center gap-1 w-fit"
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
                            Suspendu
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(sub.created_at), 'dd/MM/yyyy', {
                          locale: fr,
                        })}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant={sub.active ? 'outline' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleActive(sub)}
                          className="text-xs"
                        >
                          <Power className="h-3.5 w-3.5 mr-1" />
                          {sub.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle>Créer un compte sous-traitant</DialogTitle>
              <DialogDescription>
                Crée un accès utilisateur dans Supabase Auth avec le rôle
                sous-traitant.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sub_name">Nom complet ou Raison sociale *</Label>
                <Input
                  id="sub_name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Atelier Mécanique SARL, Paul Dupont..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sub_email">Adresse email de connexion *</Label>
                <Input
                  id="sub_email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="contact@atelier.fr"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sub_pwd">
                  Mot de passe temporaire (optionnel)
                </Label>
                <Input
                  id="sub_pwd"
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Laisser vide pour générer un mot de passe aléatoire"
                />
                <p className="text-xs text-muted-foreground">
                  Si non renseigné, un mot de passe sécurisé sera généré
                  automatiquement et affiché à l&apos;écran.
                </p>
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
                {submitting ? 'Création du compte...' : 'Créer le sous-traitant'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Account Created Modal with Credentials */}
      <Dialog
        open={!!createdInfo}
        onOpenChange={(open) => !open && setCreatedInfo(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Compte créé avec succès !
            </DialogTitle>
            <DialogDescription>
              Veuillez transmettre ces identifiants au sous-traitant. Il pourra
              se connecter dès maintenant.
            </DialogDescription>
          </DialogHeader>

          {createdInfo && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Sous-traitant :
                  </span>
                  <span className="font-semibold">{createdInfo.fullName}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Email de connexion :
                  </span>
                  <span className="font-mono">{createdInfo.email}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Mot de passe temporaire :
                  </span>
                  <span className="font-mono font-bold text-foreground bg-background px-2 py-0.5 rounded border inline-block">
                    {createdInfo.tempPassword}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={handleCopyCredentials}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" /> Copié !
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copier les identifiants
                </>
              )}
            </Button>
            <Button onClick={() => setCreatedInfo(null)}>Terminer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
