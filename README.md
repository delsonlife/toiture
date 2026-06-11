# 🏠 RoofWidget — Calculateur de devis toiture

Widget SaaS B2B installable sur n'importe quel site en **une seule ligne de code**. Conçu pour être vendu en licence unique à plusieurs couvreurs.

---

## Sommaire

- [Architecture](#architecture)
- [Installation locale](#installation-locale)
- [Déploiement Vercel](#déploiement-vercel)
- [Créer une licence](#créer-une-licence)
- [Ajouter un couvreur](#ajouter-un-couvreur)
- [Personnalisation](#personnalisation)
- [Intégration sur un site client](#intégration-sur-un-site-client)
- [Notifications email](#notifications-email)
- [Sécurité](#sécurité)
- [Build & obfuscation](#build--obfuscation)
- [Maintenance](#maintenance)

---

## Architecture

```
roof-widget/
├── api/
│   ├── license.js      # Vérifie la licence, retourne branding
│   ├── calculate.js    # Moteur de calcul (server-side only)
│   └── lead.js         # Capture & stockage des leads
├── data/
│   ├── licenses.json   # Config de chaque couvreur
│   └── leads.json      # Leads enregistrés (auto-créé)
├── public/
│   ├── widget.js       # Widget principal (source)
│   ├── widget.min.js   # Version minifiée (build)
│   ├── widget.obf.js   # Version obfusquée (prod)
│   └── widget.css      # Styles premium
├── vercel.json         # Config & headers sécurité
└── package.json        # Scripts build/deploy
```

> **Sécurité essentielle** : les formules de calcul et les tarifs ne quittent **jamais** le serveur. Le navigateur ne reçoit que l'estimation finale.

---

## Installation locale

### Prérequis

- Node.js ≥ 18
- Compte Vercel (gratuit)

### Étapes

```bash
# 1. Cloner le repo
git clone https://github.com/votre-compte/roof-widget.git
cd roof-widget

# 2. Installer les dépendances
npm install

# 3. Installer Vercel CLI (si pas déjà fait)
npm i -g vercel

# 4. Lancer en local
vercel dev
```

Le widget est accessible sur `http://localhost:3000`.

### Tester en local

Ouvrez n'importe quel fichier HTML avec cette balise :

```html
<script src="http://localhost:3000/widget.js?license=ABC123"></script>
```

La vérification de domaine est désactivée en local (`localhost`).

---

## Déploiement Vercel

### Première fois

```bash
# 1. Créer un projet GitHub et pousser le code
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/votre-compte/roof-widget.git
git push -u origin main

# 2. Connecter à Vercel
vercel login
vercel link   # Lie le dossier local au projet Vercel

# 3. Déployer en production
vercel --prod
```

Vercel vous donne une URL du type `https://roof-widget.vercel.app`.

### Mises à jour suivantes

```bash
git add .
git commit -m "Mise à jour"
git push
# Vercel déploie automatiquement via GitHub, ou :
vercel --prod
```

---

## Créer une licence

Ouvrez `data/licenses.json` et ajoutez un bloc :

```json
"MON_CODE_123": {
  "domain": "couvreur-example.fr",
  "active": true,
  "branding": {
    "companyName": "Couverture Example",
    "primaryColor": "#2563eb",
    "secondaryColor": "#0f172a",
    "logo": null,
    "phone": "01 23 45 67 89"
  },
  "services": {
    "renovation": true,
    "repair": true,
    "cleaning": true,
    "insulation": false
  },
  "pricing": {
    "base": {
      "tuile": 90,
      "ardoise": 140,
      "zinc": 175,
      "bac_acier": 108
    },
    "project_multiplier": {
      "renovation": 1.0,
      "repair": 0.35,
      "cleaning": 0.15,
      "insulation": 0.45
    },
    "pan_multiplier": { "1": 0.9, "2": 1.0, "4": 1.15, "more": 1.3 },
    "floor_multiplier": {
      "plain-pied": 1.0,
      "1-etage": 1.1,
      "2-etages": 1.2,
      "plus": 1.35
    },
    "options": {
      "velux": 850,
      "gouttieres": 45,
      "isolation": 35,
      "depose": 12,
      "charpente": 28
    },
    "regional_coefficients": {
      "75": 1.25,
      "default": 1.0
    },
    "margin_low": 0.92,
    "margin_high": 1.18
  },
  "lead_email": "devis@couvreur-example.fr",
  "created_at": "2025-06-01T00:00:00Z"
}
```

**Clé de licence** : générez une clé aléatoire sécurisée :

```bash
node -e "console.log(require('crypto').randomBytes(8).toString('hex').toUpperCase())"
```

---

## Ajouter un couvreur

1. Générer une clé de licence (voir ci-dessus)
2. Ajouter son bloc dans `data/licenses.json`
3. Redéployer : `vercel --prod`
4. Lui envoyer la ligne d'intégration :

```html
<script src="https://votre-domaine.vercel.app/widget.js?license=SA_CLE"></script>
```

---

## Personnalisation

### Couleurs

Dans `licenses.json`, modifiez `branding.primaryColor` (hex). Le widget applique automatiquement la couleur via CSS variables.

### Logo

1. Déposer le logo dans `public/logos/logo-couvreur.png`
2. Dans `licenses.json` : `"logo": "/logos/logo-couvreur.png"`

### Services désactivés

Mettre `false` pour cacher des types de projets :

```json
"services": {
  "renovation": true,
  "repair": true,
  "cleaning": false,   ← bouton masqué dans le widget
  "insulation": true
}
```

### Tarifs régionaux

Ajoutez des préfixes de codes postaux dans `regional_coefficients` :

```json
"regional_coefficients": {
  "75": 1.25,   ← Paris +25%
  "69": 1.10,   ← Lyon +10%
  "13": 1.05,   ← Bouches-du-Rhône +5%
  "default": 1.0
}
```

### Marges

- `margin_low` : 0.92 = fourchette basse à -8% du prix calculé
- `margin_high` : 1.18 = fourchette haute à +18% du prix calculé

### Texte du bouton trigger

```html
<script src="...widget.js?license=XXX&text=Calculer+mon+devis"></script>
```

### Placement du bouton

Par défaut, un bouton flottant s'affiche. Pour le placer dans votre page :

```html
<div data-rw-trigger data-rw-text="Obtenir mon devis gratuit"></div>
<script src="...widget.js?license=XXX"></script>
```

---

## Intégration sur un site client

Le couvreur ajoute **une seule ligne** dans son site (avant `</body>`) :

```html
<script src="https://votre-domaine.vercel.app/widget.js?license=SA_CLE"></script>
```

**Compatible avec** : WordPress, Wix, Squarespace, HTML statique, Webflow, et tout CMS permettant d'insérer du HTML/JS.

### WordPress

Plugins recommandés pour insérer le script :
- **Insert Headers and Footers** (plugin gratuit)
- **WPCode**

---

## Notifications email

Configurez une variable d'environnement dans Vercel Dashboard → Settings → Environment Variables.

### Resend (recommandé)

```
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM=noreply@votre-domaine.fr
```

### Brevo

```
BREVO_API_KEY=xkeysib-xxxxxxxxxxxx
BREVO_FROM=noreply@votre-domaine.fr
```

Le système essaie Resend en premier, puis Brevo en fallback.

---

## Sécurité

| Mécanisme | Détail |
|-----------|--------|
| **Vérification de domaine** | Chaque requête API vérifie que l'`Origin` correspond au domaine de la licence |
| **Calcul serveur-only** | Les tarifs et formules sont dans `licenses.json`, jamais exposés au navigateur |
| **Validation des inputs** | Tous les paramètres envoyés au calcul sont validés et sanitisés |
| **Headers HTTP** | HSTS, X-Frame-Options, X-Content-Type-Options, CSP |
| **Obfuscation** | Le widget publié est minifié + obfusqué |
| **Rate limiting** | À ajouter via Vercel Edge ou un middleware si nécessaire |

### Désactiver une licence

```json
"ABC123": {
  "active": false,   ← désactive instantanément
  ...
}
```

---

## Build & obfuscation

```bash
# Minifier seulement
npm run minify
# → génère public/widget.min.js

# Minifier + obfusquer (pour la prod)
npm run build
# → génère public/widget.obf.js

# Déployer avec build
npm run deploy
```

Pour servir la version obfusquée en production, modifiez `vercel.json` :

```json
{
  "src": "/widget.js",
  "dest": "/public/widget.obf.js"
}
```

---

## Maintenance

### Consulter les leads

```bash
cat data/leads.json | python3 -m json.tool
```

### Exporter en CSV (exemple)

```bash
node -e "
const leads = require('./data/leads.json');
const csv = ['Nom,Email,Téléphone,Estimation,Date'];
leads.forEach(l => csv.push([l.name,l.email,l.phone,l.estimate?.estimateLow+'-'+l.estimate?.estimateHigh,l.createdAt].join(',')));
console.log(csv.join('\n'));
" > leads.csv
```

### Logs Vercel

```bash
vercel logs --follow
```

### Mettre à jour un couvreur sans redéployer

> Pour une gestion sans redéploiement, migrez `licenses.json` vers une base de données (Vercel KV, Supabase, PlanetScale). Voir la section [Évolutions suggérées](#évolutions-suggérées).

---

## Évolutions suggérées

- **Dashboard admin** : interface web pour gérer les licences sans toucher au JSON
- **Vercel KV** : stocker licences et leads dans Redis (plus rapide, pas de fichiers)
- **Webhooks** : envoyer les leads vers un CRM (HubSpot, Pipedrive)
- **Analytics** : tracker les étapes abandonnées avec Plausible ou PostHog
- **A/B testing** : tester différents textes de bouton par licence
- **Rate limiting** : middleware Vercel Edge pour protéger contre le spam

---

## Licence

Propriétaire — usage commercial réservé. Ne pas redistribuer.
