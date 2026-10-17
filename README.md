# Bloc-notes Markdown local

Un éditeur Markdown autonome, sans dépendance réseau et utilisable hors ligne. Prism.js est inclus localement pour colorer le code. Les notes sont de vrais fichiers `.md` dans le dossier local que vous choisissez.

## Démarrage

Ouvrez `index.html` dans **Chrome ou Edge**. Au premier lancement, choisissez le dossier qui contient vos fichiers Markdown et autorisez l’accès en lecture et écriture. Aucun serveur ni installation n’est nécessaire. Pour tester le rendu et les opérations de fichiers simulées, ouvrez `tests/markdown.test.html` et `tests/notes.test.html`.

L’application ne peut pas parcourir un dossier local sans autorisation explicite. Elle mémorise le dossier choisi. Si Chrome redemande l’autorisation à l’ouverture, utilisez le bouton **Autoriser l’accès à ...** : il réutilise le dossier enregistré sans vous demander de le sélectionner à nouveau. Le bouton **Choisir un autre dossier** reste disponible séparément. Firefox et Safari ne fournissent pas actuellement l’API nécessaire à cette gestion directe des fichiers.

## Arborescence

```text
bloc-notes-markdown/
├── .gitignore                         # Règles d’exclusion de Git
├── Bloc-notes_Markdown_icon.ico       # Icône utilisée par l’onglet du navigateur
├── index.html                         # Point d’entrée HTML et ordre de chargement des ressources
├── css/
│   ├── tokens.css                     # Couleurs, variables et styles globaux
│   ├── base.css                       # En-tête, accueil, commandes et structure générale
│   ├── editor.css                     # Zone de saisie Markdown
│   ├── preview.css                    # Présentation du Markdown rendu
│   ├── code-highlight.css             # Couleurs des catégories syntaxiques
│   └── responsive.css                 # Adaptations mobile et impression
├── js/
│   ├── app.js                         # Coordination des vues, événements et flux de notes
│   ├── core/
│   │   └── markdown/
│   │       ├── parser.js              # Convertit le Markdown en structure de données
│   │       ├── code-highlighter.js    # Crée les tokens Prism en nœuds DOM sûrs
│   │       ├── renderer.js            # Construit l’aperçu avec l’API DOM
│   │       └── mermaid-renderer.js    # Génère les diagrammes Mermaid en SVG
│   ├── vendor/
│   │   ├── mermaid/                   # Mermaid 11.12.2 et licence MIT
│   │   └── prism/                     # Prism.js 1.30.0, grammaires locales et licence MIT
│   ├── services/
│   │   ├── notes-files.js             # Lecture, liste, création, écriture et suppression de notes
│   │   └── storage.js                 # Handle du dossier et migration localStorage
│   ├── ui/
│   │   ├── home-view.js               # Construction de la liste de notes
│   │   ├── editor-view.js             # Aperçu, tâches interactives et bascule aperçu seul
│   │   ├── editor-input.js            # Tabulation et continuation/sortie des listes
│   │   ├── preview-dnd.js             # Glisser-déposer des éléments dans l’aperçu
│   │   ├── html-export.js             # Export autonome; CSS embarqué isolé ici
│   │   └── theme.js                   # Gestion du thème clair/sombre
├── tests/
│   ├── markdown.test.html              # Page de lancement des tests Markdown
│   ├── notes.test.html                 # Page de lancement des tests des fichiers
│   ├── css/
│   │   └── test.css                    # Présentation partagée des rapports
│   └── js/
│       ├── markdown.test.js            # Cas du parseur et du rendu DOM
│       └── notes.test.js               # Tests du service de fichiers simulé
├── README.md                           # Guide du projet et de son lancement
└── CORRECTIONS.md                      # Historique des corrections et fonctionnalités
```

### Logique d’organisation

Le HTML de `index.html` décrit les vues et charge les scripts classiques dans l’ordre de leurs dépendances, sans bundler ni serveur obligatoire. Le parseur (`core/markdown/parser.js`) ne produit que des données; le renderer (`core/markdown/renderer.js`) crée les éléments DOM et insère les textes comme texte, pas comme balises. Les opérations sur les notes et la persistance sont isolées dans `services/`, tandis que `ui/` regroupe les interactions propres à chaque vue. Les styles suivent la même séparation entre fondations, éditeur, aperçu et responsive.

L’export HTML est autonome : `ui/html-export.js` incorpore donc son CSS dans le document exporté. C’est l’unique exception volontaire à la séparation des langages; l’exception est confinée à ce module. Les pages de test gardent elles aussi leur HTML, CSS et JavaScript dans des fichiers séparés.

## Fonctions

- Édition Markdown avec aperçu en direct et compteur de mots
- `Ctrl+S` enregistre immédiatement la note ouverte (`Cmd+S` sur Mac)
- Indentation avec `Tab` et désindentation avec `Maj+Tab` dans l’éditeur
- Continuation automatique des puces, numéros et tâches avec `Entrée`; une nouvelle tâche commence décochée
- Sortie d’une liste avec `Entrée` ou `Retour arrière` sur un marqueur vide
- Écran d’accueil présentant les dossiers et notes sous forme d’arborescence dépliable
- Création de sous-dossiers et de notes directement dans un dossier
- Déplacement des notes entre dossiers par glisser-déposer; déposer sur la racine pour les retirer d’un sous-dossier
- Suppression confirmée d’un dossier, avec choix d’effacer son contenu ou de le conserver dans le parent
- Réorganisation des notes par glisser-déposer avec la poignée à six points; déposer en haut ou en bas d’une ligne choisit la position
- Ordre mémorisé par dossier; les flèches haut/bas déplacent aussi la note au clavier
- Ouverture d’une note, aperçu en direct et enregistrement automatique dans son fichier
- Alignement vertical des titres de l’aperçu avec leur ligne dans l’éditeur lorsque celui-ci est plus long; l’aperçu seul reste sans espace ajouté
- Bouton Retour qui attend l’enregistrement avant de revenir à la liste
- Suppression d’une note depuis l’accueil après confirmation
- Création d’une note sans remplacer un fichier du même nom
- Import `.md`, `.markdown` ou `.txt` dans la note ouverte
- Téléchargement en Markdown ou en HTML autonome, impression et export PDF via le navigateur
- Mise en page adaptée aux écrans étroits

### Markdown pris en charge

- Titres de niveaux 1 à 3
- Gras (`**texte**` ou `__texte__`) et italique (`*texte*` ou `_texte_`)
- Code en ligne et blocs clôturés avec coloration syntaxique pour JavaScript, TypeScript, Python, HTML/XML, CSS et C++
- Diagrammes Mermaid dans les blocs clôturés `mermaid`, dont les graphes Git (`gitGraph`)
- Blocs non annotés ou annotés avec un langage inconnu affichés sans coloration
- Listes à puces, listes numérotées et cases à cocher interactives dans l’aperçu
- Sections des titres repliables et dépliables avec le chevron à leur gauche
- Citations, liens et séparateurs horizontaux
- Retours à la ligne conservés dans les paragraphes

Prism.js et Mermaid sont stockés localement dans `js/vendor/`; aucun téléchargement n’est effectué lors de l’utilisation. Les diagrammes Mermaid sont rendus en SVG dans l’aperçu et intégrés tels quels à l’export HTML autonome. La coloration ne lance pas le code. L’exécution éventuelle d’un langage dans l’aperçu nécessitera une fonctionnalité isolée distincte.

Le parseur est volontairement léger; il ne vise pas la spécification CommonMark complète. Les tableaux, images et listes imbriquées sont pris en charge par des extensions simplifiées.

## Fichiers et migration des données

Chaque note est un fichier Markdown du dossier choisi ou de l’un de ses sous-dossiers. Dans l’accueil, dépliez un dossier pour afficher ses sous-dossiers et ses notes sans quitter la liste; le bouton `+` crée une note directement dans ce dossier. Le bouton **Nouveau dossier** crée un sous-dossier à la racine sélectionnée. Le titre d’une note est son premier titre Markdown `# ...`, ou son nom de fichier en son absence. Le navigateur conserve le handle du dossier racine dans IndexedDB. Il peut demander une nouvelle autorisation, sans exiger de sélectionner de nouveau le dossier.

Si une ancienne note existe dans `localStorage` sous la clé `blocNotes`, l’application propose de l’ajouter au dossier choisi. Cette importation est facultative et ne supprime pas l’ancienne copie. Pour l’effacer manuellement, utilisez la console du navigateur :

```javascript
localStorage.removeItem("blocNotes");
```

Le handle sauvegardé dans IndexedDB sert à retrouver le dossier sélectionné, sous réserve de l’autorisation du navigateur. Les notes elles-mêmes restent des fichiers ordinaires que vous pouvez ouvrir ou modifier avec d’autres outils.

## Sécurité

Le renderer crée les nœuds texte avec l’API DOM, sans interpréter le contenu de la note comme du HTML. Les tokens de code sont aussi construits avec des nœuds texte et des éléments `span`; leur coloration n’exécute jamais le code. Les liens ayant un protocole autre que `http`, `https` ou `mailto` ne sont pas activés. Les liens ouverts dans un nouvel onglet utilisent `rel="noopener noreferrer"`. Prism.js est stocké dans le projet : aucun script tiers distant n’est chargé et les notes ne sont pas envoyées sur un serveur; l’accès aux seuls fichiers choisis reste soumis à l’autorisation du navigateur.

## Tests

Ouvrez les deux pages dans `tests/` directement dans le navigateur. Elles testent le rendu Markdown et les opérations de liste, lecture, création et écriture au moyen d’un dossier simulé.

## Technologies

HTML, CSS et JavaScript natifs, avec Prism.js 1.30.0 et ses grammaires intégrés localement; File System Access API, IndexedDB, File API et Blob API. Aucun outil de compilation ni installation n’est requis. Les scripts sont chargés séparément et dans l’ordre requis afin de garder le lancement direct par `file://`.

## Mode serveur (réseau local)

En plus du mode local, l’application peut utiliser un serveur Node.js (sans dépendance npm) qui expose un dossier de notes sur le réseau de la maison. Ce mode fonctionne dans tous les navigateurs, y compris sur téléphone.

### Lancer le serveur

1. Installez Node.js (version LTS) : `winget install OpenJS.NodeJS.LTS`, puis rouvrez le terminal.
2. Depuis le dossier du projet, lancez le serveur en indiquant le dossier de notes (obligatoire, il doit déjà exister ; sinon le serveur refuse de démarrer) :

   ```powershell
   node server/server.js C:\chemin\vers\mes-notes
   ```

   Le terminal affiche l’adresse et le dossier utilisé. Laissez-le ouvert : `Ctrl+C` arrête le serveur.
3. Sur le PC serveur, ouvrez `http://localhost:3000`, puis cliquez sur **Se connecter à un serveur** (l’adresse proposée est déjà la bonne).
4. Pour un autre appareil du réseau, trouvez l’IP du PC avec `ipconfig` (adresse IPv4, par exemple `192.168.1.20`) et ouvrez `http://192.168.1.20:3000`.
5. Si l’autre appareil n’arrive pas à se connecter, autorisez Node.js dans le pare-feu Windows (réseau privé), ou ajoutez la règle : `New-NetFirewallRule -DisplayName "Bloc-notes" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private` (PowerShell administrateur).

Le choix du serveur est mémorisé par le navigateur. Lors de la première connexion avec un jeton, la fenêtre de connexion propose de le mémoriser sur cet appareil (option cochée par défaut) pour les prochaines visites. Pour revenir au mode local, cliquez sur **Utiliser un dossier local** (la connexion et le jeton mémorisé sont alors oubliés).

### Options (variables d’environnement)

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port d’écoute | `3000` |
| `HOST` | Interface d’écoute (`127.0.0.1` pour limiter à ce PC) | `0.0.0.0` |
| `NOTES_DIR` | Dossier de notes (si non passé en argument) | aucun (chemin obligatoire) |
| `NOTES_TOKEN` | Jeton d’accès (32 caractères minimum si `HOST` n’est pas local) ; le navigateur le demande à la connexion | généré au démarrage |
| `NOTES_TOKEN_FILE` | Fichier contenant le jeton (prioritaire sur `NOTES_TOKEN`), pour ne pas le laisser dans l’historique du terminal | aucun |
| `LOG_DIR` | Dossier des journaux JSON Lines | `%USERPROFILE%\.bloc-notes-markdown\logs` sous Windows |
| `LOG_MAX_BYTES` | Taille maximale d’un fichier de journal avant rotation | `10485760` (10 Mio) |
| `LOG_BACKUPS` | Nombre de fichiers archivés conservés en plus du journal courant | `5` |

Exemple : `$env:NOTES_TOKEN="monjeton"; $env:PORT=8080; node server/server.js C:\notes`

### Sécurité

L’API exige toujours un jeton (`Authorization: Bearer ...`), comparé en temps constant. Après cinq erreurs d’authentification depuis une même adresse IP sur une période de 15 minutes, les requêtes de cette adresse sont bloquées pendant 15 minutes; une authentification réussie réinitialise le compteur. Sans `NOTES_TOKEN` ni `NOTES_TOKEN_FILE`, le serveur génère un jeton aléatoire à chaque démarrage et l’affiche dans le terminal. Pour un jeton durable, générez-le avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, enregistrez-le dans un fichier et lancez `$env:NOTES_TOKEN_FILE="C:\chemin\jeton.txt"`. En HTTP le jeton circule en clair : n’exposez pas le serveur sur Internet (utilisez un VPN ou HTTPS).

Si vous acceptez de mémoriser le jeton, il est conservé dans le `localStorage` du navigateur pour se reconnecter automatiquement. Toute personne ayant accès au profil de ce navigateur, ainsi qu’un script malveillant exécuté sur la même origine, pourrait y accéder. Ne mémorisez le jeton que sur un appareil de confiance; **Utiliser un dossier local** l’efface. Le serveur ne sert que `index.html`, `css/` et `js/`, et refuse les chemins sortant du dossier de notes ou commençant par un point.

### Journaux du serveur

Le serveur écrit des événements structurés au format JSON Lines, un objet JSON par ligne, à la fois dans la console et dans `server.jsonl`. Par défaut, le fichier est dans `%USERPROFILE%\.bloc-notes-markdown\logs` sous Windows; les journaux tournent à 10 Mio et cinq archives sont conservées. Chaque requête comprend notamment un identifiant, la date UTC, l’adresse IP, l’agent utilisateur, l’action, le chemin relatif, le résultat HTTP et la durée. Les jetons et le contenu des notes ne sont pas journalisés. L’adresse IP et les noms/chemins des notes restent des données privées : protégez le dossier des journaux.

Les événements principaux sont `server.started`, `http.request.completed`, `server.stopping` et `logging.file_write_failed`. Une requête terminée contient aussi `authentication` (`success`, `failed`, `blocked` ou `not_required`) et son `request_id`, également renvoyé dans l’en-tête HTTP `X-Request-Id`. Avec le jeton partagé actuel, le serveur identifie l’adresse IP et l’agent utilisateur du client, pas la personne derrière l’appareil.

Exemple d’événement :

```json
{"timestamp":"2026-10-17T19:48:22.322Z","level":"info","event":"http.request.completed","request_id":"fc4b5cad-5045-4ce6-a2c0-2298818212d7","client_ip":"192.168.1.42","user_agent":"Mozilla/5.0","method":"PUT","action":"note.write","resource_path":"Projet.md","authentication":"success","status":204,"outcome":"success","duration_ms":6}
```

Pour lire les événements depuis PowerShell :

```powershell
Get-Content "$env:USERPROFILE\.bloc-notes-markdown\logs\server.jsonl" |
    ForEach-Object { $_ | ConvertFrom-Json } |
    Format-Table timestamp, event, client_ip, action, resource_path, status, duration_ms
```

### Tests du mode serveur

- `node --test tests/js/server.test.js` : démarre un vrai serveur temporaire et teste l’API (jeton, limitation des tentatives, journaux JSONL et rotation, fichiers, dossiers, ordre, chemins interdits, CORS).
- `tests/remote.test.html` : ouvrez-le dans le navigateur ; il teste le client (`remote-backend.js` avec `notes-files.js`) contre un faux serveur en mémoire.