# Organisation et corrections

Le projet reste ouvrable directement avec `index.html`; l’écran d’accueil accède aux vrais fichiers `.md` du dossier que l’utilisateur autorise.

## Structure

- `css/base.css` : variables, structure générale et commandes
- `css/editor.css` : éditeur et rendu de l’aperçu
- `css/responsive.css` : adaptations mobile et impression
- `js/markdown.js` : rendu Markdown et échappement du contenu
- `js/storage.js` : handle du dossier dans IndexedDB et lecture de l’ancienne note `localStorage`
- `js/files.js` : liste, ouverture, création sans écrasement et écriture des notes; téléchargements
- `js/app.js` : navigation accueil/éditeur, autorisations, import, aperçu et sauvegarde au retour
- `tests/markdown.test.html` : vérifications exécutables du rendu
- `tests/notes.test.html` : vérifications des opérations sur les fichiers simulés
- `examples/example.md` : document de démonstration
- `notes/` : fichiers de notes de l’application

## Corrections apportées

- Prise en charge des listes à puces, numérotées et des cases à cocher annoncées dans le README
- Échappement des contenus et des attributs, avec refus des protocoles de lien non autorisés
- Sauvegarde automatique après modification du contenu ou du nom de note
- Gestion des erreurs de stockage et de lecture de fichier avec un message de statut
- Conservation de la clé `blocNotes` et du format `{ content, fileName }` pour récupérer les données existantes
- Remplacement de la page de test descriptive par des tests qui exécutent le parseur
- Correction des textes français mal encodés
- Écran d’accueil listant les notes Markdown du dossier autorisé
- Sauvegarde du fichier actif avant le retour à l’accueil et création de notes sans collision
- Suppression confirmée d’une note depuis sa ligne dans l’accueil
- Proposition de migrer l’ancienne note locale sans supprimer sa copie d’origine

## Vérification

Ouvrir `tests/markdown.test.html`, `tests/notes.test.html` et `index.html` directement dans Chrome ou Edge. La gestion des fichiers utilise le File System Access API et nécessite une autorisation explicite du dossier; aucun serveur, dépendance ou accès réseau n’est requis.