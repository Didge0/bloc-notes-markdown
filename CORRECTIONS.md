# Organisation et corrections

Le projet reste ouvrable directement avec `index.html`; l’écran d’accueil accède aux vrais fichiers `.md` du dossier que l’utilisateur autorise.

## Structure

- `css/tokens.css` : variables de thème, reset et styles globaux
- `css/base.css` : structure générale, accueil, en-tête et commandes
- `css/editor.css` : textarea Markdown et interactions clavier visuelles
- `css/preview.css` : styles des éléments Markdown rendus
- `css/responsive.css` : adaptations mobile et impression
- `js/core/markdown/parser.js` : analyse le Markdown en structure de données sans produire de balisage HTML
- `js/core/markdown/renderer.js` : construit l’aperçu sûr avec l’API DOM
- `js/services/notes-files.js` : opérations sur les fichiers Markdown et téléchargements
- `js/services/storage.js` : handle du dossier IndexedDB et compatibilité de migration localStorage
- `js/ui/home-view.js` : rendu de la liste d’accueil
- `js/ui/editor-view.js` : rendu aperçu, tâches interactives et mode aperçu seul
- `js/ui/editor-input.js` : commandes Tab, Entrée et Retour arrière
- `js/ui/html-export.js` : assemblage du document HTML autonome; seul module qui embarque son CSS
- `js/app.js` : coordination de la navigation, des permissions et de la sauvegarde
- `tests/css/test.css` : styles partagés des pages de test
- `tests/js/markdown.test.js` : cas de test parser et renderer
- `tests/js/notes.test.js` : tests CRUD sur un dossier simulé
- `notes/` : notes Markdown réelles de l’application

## Corrections apportées

- Prise en charge des listes à puces, numérotées et des cases à cocher annoncées dans le README
- Construction de l’aperçu par API DOM; le texte de la note n’est pas interprété comme du HTML
- Refus des protocoles de lien non autorisés
- Sauvegarde automatique après modification du contenu de la note
- Sauvegarde immédiate de la note active avec Ctrl+S/Cmd+S
- Continuation automatique des listes à la touche Entrée et sortie propre avec Entrée ou Retour arrière sur un marqueur vide
- Gestion des erreurs de stockage et de lecture de fichier avec un message de statut
- Conservation de la clé `blocNotes` et du format `{ content, fileName }` pour récupérer les données existantes
- Tests séparés en pages HTML, feuilles CSS et scripts JavaScript externes
- Correction des textes français mal encodés
- Séparation du parseur Markdown (données) et du rendu de l’aperçu (API DOM)
- Découpage des services fichiers/stockage et des comportements propres aux vues
- Séparation des tests et des styles en fichiers externes
- Écran d’accueil listant les notes Markdown du dossier autorisé
- Sauvegarde du fichier actif avant le retour à l’accueil et création de notes sans collision
- Suppression confirmée d’une note depuis sa ligne dans l’accueil
- Réordonnancement des notes par poignée, avec ordre persistant par dossier et commandes clavier
- Réordonnancement manuel des notes, mémorisé par dossier et utilisable au clavier
- Proposition de migrer l’ancienne note locale sans supprimer sa copie d’origine
- Restauration du dossier mémorisé au démarrage et renouvellement de permission sans nouvelle sélection

## Vérification

Ouvrir `tests/markdown.test.html`, `tests/notes.test.html` et `index.html` directement dans Chrome ou Edge. La gestion des fichiers utilise le File System Access API et nécessite une autorisation explicite du dossier; aucun serveur, dépendance ou accès réseau n’est requis.