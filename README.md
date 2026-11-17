# 📦 Suivi de Sous-Traitance de Pièces

## 1. Présentation

Cette application web permet à un **producteur de pièces** de gérer le processus de sous-traitance : il envoie des **lots de pièces** (initialement classées en "2ème choix") à des sous-traitants qui effectuent des opérations d'amélioration et les reclassent en différents états (1er choix, Choix commercial, Rebut). Chaque transition est tracée, horodatée et valorisée automatiquement selon une grille de prix configurable.

L'application est construite sur une stack moderne et entièrement hébergeable gratuitement : **Next.js 14 App Router + TypeScript** pour le frontend et l'API, **Tailwind CSS + shadcn/ui** pour l'interface, **Supabase** (PostgreSQL + Auth + Row Level Security) pour la base de données et l'authentification, et **Recharts** pour les graphiques du tableau de bord.

L'app est également une **PWA (Progressive Web App)** : elle s'installe sur Android et iOS comme une application native, ce qui est idéal pour la saisie mobile en atelier. Aucune installation de store n'est requise.

---

## 2. Fonctionnalités

- ✅ **Deux rôles** : Admin et Sous-traitant (avec accès strictement séparés)
- ✅ **Gestion des lots de pièces** : création, suivi en temps réel, clôture
- ✅ **Saisie mobile-first** pour les sous-traitants (interface optimisée tactile)
- ✅ **Chronomètre automatique** à l'ouverture d'un lot (durée de traitement tracée)
- ✅ **Calcul automatique des gains** côté serveur — le client n'envoie jamais de prix
- ✅ **Correction a posteriori** avec traçabilité complète (audit log)
- ✅ **Tableau de bord et graphiques** (Recharts) : KPIs, tendances, récapitulatifs
- ✅ **Export CSV** des données
- ✅ **Configuration complète** : modèles, états, grille de prix par transition
- ✅ **RLS stricte** : chaque sous-traitant ne voit que ses propres données
- ✅ **PWA installable** sur Android et iOS

---

## 3. Prérequis

Vous n'avez besoin d'**aucun outil installé sur votre ordinateur**. Tout se fait dans le navigateur.

| Compte requis | Gratuit ? | Lien |
|---|---|---|
| GitHub | ✅ Oui | https://github.com |
| Supabase | ✅ Oui (tier gratuit suffisant) | https://supabase.com |
| Vercel | ✅ Oui (tier Hobby) | https://vercel.com |

---

## 4. Étape 1 : Créer le projet Supabase

1. Allez sur **https://supabase.com** et connectez-vous (ou créez un compte)
2. Cliquez sur **"New Project"**
3. Renseignez :
   - **Name** : par exemple `suivi-sous-traitance`
   - **Database Password** : choisissez un mot de passe fort et **notez-le**
   - **Region** : `Europe West (Frankfurt)` (recommandé pour la latence)
4. Cliquez **"Create new project"** et attendez **~2 minutes** que le projet démarre (barre de progression en haut)
5. Une fois prêt, allez dans **Project Settings → API** (menu latéral gauche)
6. Copiez et conservez précieusement ces trois valeurs :

| Clé dans Supabase | Variable d'environnement | Visibilité |
|---|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` | Publique (OK) |
| **anon public** (section "Project API Keys") | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publique (OK) |
| **service_role secret** (section "Project API Keys") | `SUPABASE_SERVICE_ROLE_KEY` | 🔴 **NE JAMAIS EXPOSER** |

> [!CAUTION]
> La clé `service_role` contourne toutes les politiques de sécurité. Ne la collez jamais dans du code côté client, ne la commitez jamais sur GitHub. Elle n'est utilisée que dans les API routes serveur.

---

## 5. Étape 2 : Exécuter le schéma SQL

Cette étape crée toutes les tables, fonctions, politiques RLS et données de démo dans votre base Supabase.

1. Dans le dashboard Supabase, allez dans **SQL Editor** (menu latéral)
2. Cliquez **"New Query"**
3. Ouvrez le fichier **`schema.sql`** situé à la racine de ce repo, copiez son contenu entier et collez-le dans l'éditeur SQL
4. Cliquez **"Run"** (ou `Ctrl+Entrée`)
5. Vérifiez qu'il n'y a **aucune erreur** (toutes les lignes doivent s'afficher en vert)
6. Allez dans **Table Editor** pour vérifier que les tables suivantes ont été créées :

   | Table | Description |
   |---|---|
   | `profiles` | Utilisateurs avec leur rôle (admin / subcontractor) |
   | `models` | Modèles de pièces (ex : SILEX, HOUDA, CRYSTAL) |
   | `states` | États possibles des pièces (2ème choix, 1er choix…) |
   | `price_rules` | Grille de prix par transition d'état |
   | `batches` | Lots de pièces envoyés aux sous-traitants |
   | `batch_updates` | Résultats de traitement par lot |
   | `audit_log` | Historique de toutes les modifications |

7. Vérifiez dans **Table Editor → models** que 3 modèles de démo ont été insérés (SILEX, HOUDA, CRYSTAL), et dans **states** que 4 états existent (2ème choix, Choix commercial, 1er choix, Rebut)

---

## 6. Étape 3 : Créer le compte Admin

> [!IMPORTANT]
> Par défaut, **tous les nouveaux utilisateurs** reçoivent automatiquement le rôle `subcontractor`. Le premier compte admin doit être promu manuellement via SQL.

1. Dans Supabase, allez dans **Authentication → Users**
2. Cliquez **"Add user" → "Create new user"**
3. Saisissez votre email et un mot de passe → **"Create user"**
4. Attendez quelques secondes que le déclencheur crée le profil automatiquement
5. Dans **SQL Editor**, exécutez la requête suivante en remplaçant l'email et le nom :

```sql
UPDATE public.profiles 
SET role = 'admin', full_name = 'Votre Nom'
WHERE email = 'votre-email@exemple.com';
```

6. Vérifiez dans **Table Editor → profiles** que la ligne a bien `role = 'admin'`

---

## 7. Étape 4 : Créer des comptes Sous-traitants

### Option A — Via l'interface admin (recommandée)

Une fois l'app déployée (étape suivante) et connecté en tant qu'admin :

1. Allez dans **Config → Sous-traitants**
2. Cliquez **"Créer un compte"**
3. Saisissez l'email et le nom complet du sous-traitant
4. L'app crée automatiquement le compte et envoie un email d'invitation

### Option B — Manuellement via Supabase

Si vous souhaitez créer des comptes avant le déploiement :

1. Dans Supabase : **Authentication → Users → "Create new user"**
2. Le profil sera automatiquement créé avec le rôle `subcontractor` (via un déclencheur SQL)
3. Le sous-traitant reçoit un email et doit changer son mot de passe à la première connexion

---

## 8. Étape 5 : Déployer sur Vercel

1. **Poussez ce repo sur GitHub** (public ou privé, les deux fonctionnent)
   - Si vous ne l'avez pas encore : sur GitHub, créez un nouveau dépôt → suivez les instructions pour y pousser ce dossier
2. Sur **https://vercel.com**, connectez-vous avec votre compte GitHub
3. Cliquez **"New Project"**
4. Dans la liste de vos repos GitHub, trouvez ce repo et cliquez **"Import"**
5. Vercel détecte automatiquement Next.js → **aucune configuration build n'est nécessaire**
6. Dans la section **"Environment Variables"**, ajoutez les 3 variables suivantes (une par une) :

   ```
   NEXT_PUBLIC_SUPABASE_URL       = https://xxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY      = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

   > Copiez ces valeurs depuis Supabase → Project Settings → API (voir étape 1)

7. Cliquez **"Deploy"** et attendez **~2–3 minutes**
8. ✅ Votre app est en ligne ! L'URL ressemble à `https://votre-projet.vercel.app`

---

## 9. Étape 6 : (Optionnel) Configurer un domaine personnalisé

Si vous possédez un nom de domaine (ex: `suivi.monentreprise.com`) :

1. Dans Vercel, allez dans **Settings → Domains**
2. Ajoutez votre domaine et suivez les instructions pour configurer les enregistrements DNS chez votre registrar
3. Vercel génère automatiquement un certificat HTTPS (Let's Encrypt)

---

## 10. Configuration initiale de l'application

Après déploiement, connectez-vous avec votre compte admin et effectuez ces vérifications :

1. **Config → Modèles** : vérifiez ou modifiez les modèles de démo (SILEX, HOUDA, CRYSTAL). Ajoutez vos propres modèles de pièces.
2. **Config → États** : vérifiez les états disponibles (2ème choix → Choix commercial / 1er choix / Rebut). Modifiez les couleurs et l'ordre si besoin.
3. **Config → Grille de prix** : vérifiez et ajustez les prix par transition d'état (ex: 2ème choix → 1er choix = X €/pièce)
4. **Config → Sous-traitants** : créez les vrais comptes de vos sous-traitants
5. **Lots → Créer un lot** : créez votre premier lot, assignez-le à un sous-traitant et envoyez-le

---

## 11. Architecture

```
c:\Users\SPIRIT\Desktop\COLLAB APP\
├── schema.sql                        ← Schéma complet de la BDD (à exécuter dans Supabase)
├── .env.example                      ← Template des variables d'environnement
├── middleware.ts                     ← Rafraîchissement de session + redirections
├── lib/
│   ├── types.ts                      ← Tous les types TypeScript
│   └── supabase/
│       ├── client.ts                 ← Client navigateur
│       ├── server.ts                 ← Client serveur (SSR)
│       └── middleware.ts             ← Client middleware
└── app/
    ├── layout.tsx                    ← Root layout (PWA meta, providers)
    ├── globals.css
    ├── (auth)/
    │   └── login/                    ← Page de connexion
    ├── admin/
    │   ├── batches/                  ← Liste et détail des lots (vue admin)
    │   ├── batch-updates/            ← Corrections a posteriori
    │   ├── recap/                    ← Tableau de bord KPIs et graphiques
    │   └── config/
    │       ├── models/               ← Gestion des modèles de pièces
    │       ├── states/               ← Gestion des états
    │       ├── prices/               ← Grille de prix
    │       └── subcontractors/       ← Gestion des sous-traitants
    └── subcontractor/
        ├── batches/                  ← Saisie et suivi des lots (vue sous-traitant)
        └── earnings/                 ← Mes gains
```

---

## 12. Sécurité

| Mécanisme | Description |
|---|---|
| **RLS (Row Level Security)** | Activée sur toutes les tables. Supabase refuse toute requête ne respectant pas les politiques. |
| **Calcul des prix côté serveur** | La valorisation est effectuée par une fonction PostgreSQL `SECURITY DEFINER` — le navigateur ne voit jamais les prix unitaires. |
| **Données cloisonnées** | Les politiques RLS garantissent qu'un sous-traitant ne peut lire/écrire que ses propres lots. |
| **Service Role Key protégée** | Utilisée uniquement dans les API routes Node.js (serveur) — jamais exposée au navigateur ni en variable `NEXT_PUBLIC_`. |
| **Audit log** | Toute modification est enregistrée avec l'identifiant de l'utilisateur et le diff des données. |

---

## 13. Développement local (optionnel)

Si vous souhaitez modifier le code en local avant de redéployer :

```bash
# 1. Cloner le repo
git clone https://github.com/votre-compte/votre-repo.git
cd votre-repo

# 2. Copier le fichier de variables d'environnement
cp .env.example .env.local

# 3. Éditer .env.local avec vos vraies valeurs Supabase
#    (ouvrez le fichier dans un éditeur de texte)

# 4. Installer les dépendances
npm install

# 5. Lancer le serveur de développement
npm run dev
# → Ouvrir http://localhost:3000 dans votre navigateur
```

> [!NOTE]
> L'application en développement local se connecte au même projet Supabase que la production. Vous pouvez créer un second projet Supabase dédié au dev si vous souhaitez éviter de toucher aux données réelles.

Après avoir modifié le code, il suffit de faire un `git push` sur GitHub — Vercel redéploie automatiquement en quelques minutes.

---

## 14. Résolution de problèmes

### ❌ "Invalid API key" ou erreur 401

- Vérifiez que les 3 variables d'environnement sont bien saisies dans **Vercel → Settings → Environment Variables**
- Vérifiez qu'il n'y a pas d'espace avant/après les valeurs
- Après avoir modifié les variables, **redéployez** (Vercel → Deployments → "Redeploy")

### ❌ "RLS policy violation" ou erreur 403

- Vérifiez dans Supabase **Table Editor → profiles** que l'utilisateur concerné a bien le bon `role`
- Vérifiez que le schéma SQL a bien été exécuté entièrement (toutes les politiques RLS doivent exister)

### ❌ Un sous-traitant ne voit pas ses lots

- Vérifiez dans **Table Editor → batches** que le champ `subcontractor_id` du lot correspond exactement à l'`id` du profil du sous-traitant (qui est son `auth.uid()`)
- Vérifiez que le lot a bien le statut `sent` ou `open` (les lots en `draft` ne sont pas visibles par le sous-traitant)

### ❌ Le build Vercel échoue

- Allez dans **Vercel → Deployments** → cliquez sur le déploiement en échec → onglet **"Build Logs"**
- Les erreurs TypeScript et ESLint sont ignorées en build (configuré dans `next.config.ts`), donc l'échec est probablement lié aux variables d'environnement manquantes ou à une dépendance

### ❌ L'email de réinitialisation de mot de passe n'arrive pas

- Vérifiez dans Supabase **Authentication → Email Templates** que les templates sont configurés
- Par défaut, Supabase envoie via son propre serveur SMTP avec une limite de **3 emails/heure** sur le tier gratuit. Pour la production, configurez votre propre SMTP dans **Project Settings → Auth → SMTP Settings**.

---

## 15. Licence

Projet propriétaire — tous droits réservés.
