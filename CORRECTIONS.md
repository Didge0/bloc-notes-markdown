# Organisation et corrections

Le projet est organisé par responsabilité tout en restant ouvrable directement avec `index.html`.

## Structure

- `css/base.css` : variables, structure générale et commandes
- `css/editor.css` : éditeur et rendu de l’aperçu
- `css/responsive.css` : adaptations mobile et impression
- `js/markdown.js` : rendu Markdown et échappement du contenu
- `js/storage.js` : lecture et écriture de la note dans `localStorage`
- `js/files.js` : téléchargement des fichiers et libération des URL Blob
- `js/app.js` : événements de l’interface, import, aperçu et export
- `tests/markdown.test.html` : vérifications exécutables du rendu
- `examples/example.md` : document de démonstration

## Corrections apportées

- Prise en charge des listes à puces, numérotées et des cases à cocher annoncées dans le README
- Échappement des contenus et des attributs, avec refus des protocoles de lien non autorisés
- Sauvegarde automatique après modification du contenu ou du nom de note
- Gestion des erreurs de stockage et de lecture de fichier avec un message de statut
- Conservation de la clé `blocNotes` et du format `{ content, fileName }` pour récupérer les données existantes
- Remplacement de la page de test descriptive par des tests qui exécutent le parseur
- Correction des textes français mal encodés

## Vérification

Ouvrir `tests/markdown.test.html` puis `index.html` directement dans un navigateur. Les deux pages n’exigent ni serveur, ni dépendance, ni accès réseau.