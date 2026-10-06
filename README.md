# Bloc-notes Markdown local

Un éditeur Markdown autonome, sans dépendance externe et utilisable hors ligne. Les notes sont de vrais fichiers `.md` dans le dossier local que vous choisissez.

## Démarrage

Ouvrez `index.html` dans **Chrome ou Edge**. Au premier lancement, choisissez le dossier `notes/` du projet et autorisez l’accès en lecture et écriture. Aucun serveur ni installation n’est nécessaire. Pour tester le rendu et les opérations de fichiers simulées, ouvrez `tests/markdown.test.html` et `tests/notes.test.html`.

L’application ne peut pas parcourir un dossier local sans autorisation explicite. Elle mémorise le dossier choisi. Si Chrome redemande l’autorisation à l’ouverture, utilisez le bouton **Autoriser l’accès à ...** : il réutilise le dossier enregistré sans vous demander de le sélectionner à nouveau. Le bouton **Choisir un autre dossier** reste disponible séparément. Firefox et Safari ne fournissent pas actuellement l’API nécessaire à cette gestion directe des fichiers.

## Arborescence

```text
bloc-notes-markdown/
├── .gitignore                         # Fichiers locaux exclus du suivi Git
├── Bloc-notes_Markdown_icon.ico       # Icône utilisée par l’onglet du navigateur
├── index.html                         # Point d’entrée HTML et ordre de chargement des ressources
├── css/
│   ├── tokens.css                     # Couleurs, variables et styles globaux
│   ├── base.css                       # En-tête, accueil, commandes et structure générale
│   ├── editor.css                     # Zone de saisie Markdown
│   ├── preview.css                    # Présentation du Markdown rendu
│   └── responsive.css                 # Adaptations mobile et impression
├── js/
│   ├── app.js                         # Coordination des vues, événements et flux de notes
│   ├── core/
│   │   └── markdown/
│   │       ├── parser.js              # Convertit le Markdown en structure de données
│   │       └── renderer.js            # Construit l’aperçu avec l’API DOM
│   ├── services/
│   │   ├── notes-files.js             # Lecture, liste, création, écriture et suppression de notes
│   │   └── storage.js                 # Handle du dossier et migration localStorage
│   ├── ui/
│   │   ├── home-view.js               # Construction de la liste de notes
│   │   ├── editor-view.js             # Aperçu, tâches interactives et bascule aperçu seul
│   │   ├── editor-input.js            # Tabulation et continuation/sortie des listes
│   │   └── html-export.js             # Export autonome; CSS embarqué isolé ici
├── notes/
│   ├── example.md                      # Note d’exemple disponible depuis l’accueil
│   ├── RDV Honorée comparaison.md      # Note Markdown du projet
│   └── TODO.md                         # Liste des tâches du projet
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
- Indentation avec `Tab` et désindentation avec `Maj+Tab` dans l’éditeur
- Continuation automatique des puces, numéros et tâches avec `Entrée`; une nouvelle tâche commence décochée
- Sortie d’une liste avec `Entrée` ou `Retour arrière` sur un marqueur vide
- Écran d’accueil listant les fichiers `.md` du dossier choisi
- Ouverture d’une note, aperçu en direct et enregistrement automatique dans son fichier
- Bouton Retour qui attend l’enregistrement avant de revenir à la liste
- Suppression d’une note depuis l’accueil après confirmation
- Création d’une note sans remplacer un fichier du même nom
- Import `.md`, `.markdown` ou `.txt` dans la note ouverte
- Téléchargement en Markdown ou en HTML autonome, impression et export PDF via le navigateur
- Mise en page adaptée aux écrans étroits

### Markdown pris en charge

- Titres de niveaux 1 à 3
- Gras (`**texte**` ou `__texte__`) et italique (`*texte*` ou `_texte_`)
- Code en ligne et blocs de code entre triples accents graves
- Listes à puces, listes numérotées et cases à cocher interactives dans l’aperçu
- Citations, liens et séparateurs horizontaux
- Retours à la ligne conservés dans les paragraphes

Le parseur est volontairement léger; il ne vise pas la spécification CommonMark complète. Les tableaux, images, listes imbriquées et la coloration syntaxique ne sont pas pris en charge.

## Fichiers et migration des données

Chaque note est un fichier Markdown du dossier choisi; l’application affiche les fichiers `.md` directement dans ce dossier, sans parcourir les sous-dossiers. Le titre de liste est le premier titre Markdown `# ...`, ou le nom de fichier en son absence. Le navigateur conserve le handle du dossier dans IndexedDB. Il peut demander une nouvelle autorisation, sans exiger de sélectionner de nouveau le dossier.

Si une ancienne note existe dans `localStorage` sous la clé `blocNotes`, l’application propose de l’ajouter au dossier. Cette importation est facultative et ne supprime pas l’ancienne copie. Pour l’effacer manuellement, utilisez la console du navigateur :

```javascript
localStorage.removeItem("blocNotes");
```

Le handle sauvegardé dans IndexedDB sert à retrouver le dossier sélectionné, sous réserve de l’autorisation du navigateur. Les notes elles-mêmes restent des fichiers ordinaires que vous pouvez ouvrir ou modifier avec d’autres outils.

## Sécurité

Le renderer crée les nœuds texte avec l’API DOM, sans interpréter le contenu de la note comme du HTML. Les liens ayant un protocole autre que `http`, `https` ou `mailto` ne sont pas activés. Les liens ouverts dans un nouvel onglet utilisent `rel="noopener noreferrer"`. L’application ne charge aucun script tiers et n’envoie pas les notes sur un serveur; l’accès aux seuls fichiers choisis reste soumis à l’autorisation du navigateur.

## Tests

Ouvrez les deux pages dans `tests/` directement dans le navigateur. Elles testent le rendu Markdown et les opérations de liste, lecture, création et écriture au moyen d’un dossier simulé.

## Technologies

HTML, CSS et JavaScript natifs; File System Access API, IndexedDB, File API et Blob API. Aucun outil de compilation n’est requis. Les scripts sont chargés séparément et dans l’ordre requis afin de garder le lancement direct par `file://`.
