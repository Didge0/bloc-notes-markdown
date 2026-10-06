# Bloc-notes Markdown local

Un éditeur Markdown autonome, sans dépendance externe et utilisable hors ligne. Les notes restent dans le stockage local du navigateur.

## Démarrage

Ouvrez `index.html` dans un navigateur récent. Aucun serveur ni installation n’est nécessaire. Pour tester le rendu, ouvrez `tests/markdown.test.html`.

## Arborescence

```text
bloc-notes-markdown/
├── index.html
├── css/
│   ├── base.css
│   ├── editor.css
│   └── responsive.css
├── js/
│   ├── app.js
│   ├── files.js
│   ├── markdown.js
│   └── storage.js
├── examples/
│   └── example.md
├── tests/
│   └── markdown.test.html
├── README.md
└── CORRECTIONS.md
```

## Fonctions

- Édition Markdown avec aperçu en direct et compteur de mots
- Sauvegarde automatique locale et restauration à la prochaine ouverture
- Création d’une note, import `.md`, `.markdown` ou `.txt`
- Téléchargement en Markdown ou en HTML autonome, impression et export PDF via le navigateur
- Mise en page adaptée aux écrans étroits

### Markdown pris en charge

- Titres de niveaux 1 à 3
- Gras (`**texte**` ou `__texte__`) et italique (`*texte*` ou `_texte_`)
- Code en ligne et blocs de code entre triples accents graves
- Listes à puces, listes numérotées et cases à cocher
- Citations, liens et séparateurs horizontaux

Le parseur est volontairement léger; il ne vise pas la spécification CommonMark complète. Les tableaux, images, listes imbriquées et la coloration syntaxique ne sont pas pris en charge.

## Données locales

La note courante est enregistrée dans `localStorage` sous la clé `blocNotes`, avec les champs `content` et `fileName`. Pour effacer cette note, utilisez la console du navigateur :

```javascript
localStorage.removeItem("blocNotes");
```

Le navigateur détermine l’espace de stockage associé aux pages ouvertes en `file://`; conserver le même navigateur et le même fichier `index.html` permet de retrouver la note.

## Sécurité

Le contenu Markdown est échappé avant d’être rendu. Les liens ayant un protocole autre que `http`, `https` ou `mailto` ne sont pas activés. Les liens ouverts dans un nouvel onglet utilisent `rel="noopener noreferrer"`. L’application ne charge aucun script tiers et n’envoie pas les notes sur un serveur.

## Tests

Ouvrez `tests/markdown.test.html` directement dans le navigateur. La page exécute les cas de rendu et affiche le nombre de tests réussis, y compris des cas d’échappement HTML et de refus de lien `javascript:`.

## Technologies

HTML, CSS et JavaScript natifs; `localStorage`, File API et Blob API. Aucun outil de compilation n’est requis.