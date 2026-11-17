'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu,
  X,
  LogOut,
  ChevronDown,
  Layers,
  BarChart3,
  Settings,
  Package,
  CircleDollarSign,
  Users,
  Sliders,
  DollarSign,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { Role } from '@/lib/types'
import { cn } from '@/lib/utils'

interface NavBarProps {
  role: Role
  userName?: string
}

export function NavBar({ role, userName }: NavBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)
  const supabase = createClient()

  const handleSignOut = async () => {
    try {
      setIsLoggingOut(true)
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Erreur lors de la déconnexion :', error)
      router.push('/login')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const adminNavItems = [
    {
      title: 'Lots',
      href: '/admin/batches',
      icon: Layers,
      active: pathname.startsWith('/admin/batches') || pathname.startsWith('/admin/batch-updates'),
    },
    {
      title: 'Récapitulatif',
      href: '/admin/recap',
      icon: BarChart3,
      active: pathname.startsWith('/admin/recap'),
    },
  ]

  const configItems = [
    { title: 'Modèles', href: '/admin/config/models', icon: Package },
    { title: 'États', href: '/admin/config/states', icon: Sliders },
    { title: 'Grille de prix', href: '/admin/config/prices', icon: DollarSign },
    { title: 'Sous-traitants', href: '/admin/config/subcontractors', icon: Users },
  ]

  const subcontractorNavItems = [
    {
      title: 'Mes Lots',
      href: '/subcontractor/batches',
      icon: Layers,
      active: pathname.startsWith('/subcontractor/batches'),
    },
    {
      title: 'Mes Gains',
      href: '/subcontractor/earnings',
      icon: CircleDollarSign,
      active: pathname.startsWith('/subcontractor/earnings'),
    },
  ]

  const navItems = role === 'admin' ? adminNavItems : subcontractorNavItems
  const isConfigActive = pathname.startsWith('/admin/config')
  const homeHref = role === 'admin' ? '/admin/batches' : '/subcontractor/batches'

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-6">
          <Link href={homeHref} className="flex items-center gap-3 font-semibold">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-bold text-white shadow-sm">
              ST
            </div>
            <span className="hidden sm:inline-block text-base tracking-tight text-foreground font-bold">
              Suivi Sous-traitance
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-md transition-colors',
                    item.active
                      ? 'bg-secondary text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              )
            })}

            {/* Admin Config Dropdown */}
            {role === 'admin' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={isConfigActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'gap-1.5 px-3',
                      isConfigActive && 'text-primary font-semibold'
                    )}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Configuration</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {configItems.map((item) => {
                    const Icon = item.icon
                    const isSubActive = pathname === item.href
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2 cursor-pointer w-full',
                            isSubActive && 'font-semibold text-primary'
                          )}
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span>{item.title}</span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {userName && (
            <span className="hidden lg:inline-block text-xs text-muted-foreground max-w-[150px] truncate">
              {userName}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="hidden sm:inline-flex items-center gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span>Déconnexion</span>
          </Button>

          {/* Mobile menu trigger */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden"
            aria-label="Ouvrir le menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="border-b bg-background px-4 py-4 md:hidden space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    item.active
                      ? 'bg-secondary text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              )
            })}

            {role === 'admin' && (
              <div className="pt-2">
                <div className="px-3 pb-1 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Configuration
                </div>
                {configItems.map((item) => {
                  const Icon = item.icon
                  const isSubActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                        isSubActive
                          ? 'bg-secondary text-primary font-semibold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{item.title}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="w-full justify-start text-destructive hover:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}
