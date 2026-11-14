# Notes de version

The launcher's release notes in French; [current.en.md](current.en.md) holds the same entries in English, headed by the same version tags, in
the same order, written in the same pass. Newest first. Each entry names the lowest server version it works with ("Serveur minimum : ..."),
and `tools/release.ps1` refuses a release without both entries. The releases made before (v0.1.0, v0.2.0) have their notes on GitHub only.
When this file nears 200 lines, the oldest entries move to `<year>-<month>.md`, and their English ones to `<year>-<month>.en.md`.

---

## v0.3.0-beta.11 — 14/11/2026

**Proposée par le launcher** si tu as la v0.3.0-beta.10 : « Mettre à jour » sur la ligne en haut de la fenêtre. Sinon, installe-la à la
main avec `Echoes-of-Atreia-Setup-0.3.0-beta.11.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.6 ; le panneau d'administration, un
serveur plus récent que la v0.1.0-beta.6 (il le dit lui-même sinon).

**Ce qui change**
- **Plus de fenêtre de terminal au démarrage de MySQL** : MySQL lançait un second processus qui ouvrait sa propre console.
- **Les notifications passent par-dessus la page** (« Redémarre les serveurs… », mise à jour, serveur trop ancien) : elles ne décalent plus
  les blocs de l'accueil, et une croix les ferme.
- **Réglages du serveur** : le bloc prend toute la fenêtre, la liste défile dedans, et la barre « Enregistrer » ne cache plus aucune ligne.
- **Bots** : la courbe « Bots dans le monde, dernière heure » est retirée.
- **Compte : un panneau Administration pour un compte administrateur**, à côté de la téléportation, quand le personnage est en jeu :
  Invulnérable, Invisible, Laissé tranquille, Voir les cachés, Sans temps de recharge, Voler partout, et afficher ou non le tag »Admin«.
  Chaque case fait ce que fait la commande de maître du jeu tapée en jeu.

---

## v0.3.0-beta.10 — 14/11/2026

**Proposée par le launcher** si tu as la v0.3.0-beta.9 : « Mettre à jour » sur la ligne en haut de la fenêtre. Sinon, installe-la à la
main avec `Echoes-of-Atreia-Setup-0.3.0-beta.10.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.6.

**Ce qui change**
- **MySQL n'est plus affiché « Prêt » quand il est arrêté** : après un arrêt raté, la ligne MySQL restait verte et son bouton disait
  « Arrêter » au lieu de « Démarrer », si bien qu'un clic arrêtait le MySQL qu'on venait de lancer, et qu'une sauvegarde échouait.
  Arrêter un MySQL déjà arrêté dit simplement qu'il est arrêté.
- **« Quoi de neuf » passe à la ligne** : les phrases des notes n'étaient plus coupées au bord de la fenêtre.
- **La fenêtre pour quitter, serveurs démarrés, est plus claire** : trois choix présentés chacun avec ce qu'il fait, l'arrêt propre mis en
  avant, et « Annuler » à part.

---

## v0.3.0-beta.9 — 14/11/2026

**Proposée par le launcher** si tu as la v0.3.0-beta.8 : « Mettre à jour » sur la ligne en haut de la fenêtre. Sinon, installe-la à la main
avec `Echoes-of-Atreia-Setup-0.3.0-beta.9.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.6.

**Ce qui change**
- **Plus de faux échec au premier démarrage** : le serveur de jeu n'est plus marqué en échec tant qu'il écrit dans son terminal (le premier
  démarrage prépare ses cartes et ses bots pendant de longues minutes). Il ne l'est plus qu'après cinq minutes sans rien écrire.
- **Une erreur de serveur ne casse plus l'accueil** : la ligne du serveur garde sa place, avec un bouton « Pourquoi ? » qui ouvre le
  problème et ce que le serveur a écrit dans une fenêtre, d'où « Afficher le journal » ouvre son terminal. Un échec n'ouvre plus les
  terminaux tout seul.
- **L'installation du serveur tient sur une ligne** : les explications, le choix du dossier, les étapes du téléchargement, un échec et
  « Réessayer » sont dans une fenêtre.
- **L'accueil remplit la fenêtre** : les deux colonnes s'arrêtent sur la même ligne, et le bloc « Nouveautés » garde la même hauteur sur
  ses deux onglets.
- **La population des bots expliquée** : chaque mode dit ce qu'il fait sous son nom (« Selon les joueurs », « Constant », « Avec un
  minimum »), le pourcentage est grisé quand le mode ne s'en sert pas, et « Population en ce moment » parle de bots présents et en réserve.
- **La désinstallation se termine par une fenêtre** qui dit où la dernière sauvegarde de tes comptes et personnages est gardée. Le texte
  de la désinstallation n'est plus coupé.
- Les options de la fenêtre « Installation » sont régulièrement espacées.

---

## v0.3.0-beta.8 — 14/11/2026

**Proposée par le launcher** si tu as la v0.3.0-beta.7 : « Mettre à jour » sur la ligne en haut de la fenêtre. Sinon, installe-la à la main
avec `Echoes-of-Atreia-Setup-0.3.0-beta.8.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.6 (la base de données de la beta.5 ne
démarre pas sur un Windows neuf).

**Ce qui change**
- **Désinstaller le serveur** : un serveur que le launcher a installé lui-même se désinstalle depuis la fenêtre « Installation »
  (« Modifier… » sur l'accueil), et le désinstalleur du launcher propose aussi de l'enlever. Les serveurs sont arrêtés, une sauvegarde de tes
  comptes et personnages est gardée dans `Documents\Echoes of Atreia\backups`, puis le dossier du serveur est supprimé. Un serveur que tu as
  installé toi-même n'est jamais proposé, ni un serveur installé avec une version précédente du launcher.
- **Plus de barre de défilement dans une petite fenêtre** : quand la fenêtre est plus petite que sa taille de départ (un petit écran, ou
  Windows qui l'ouvre un peu plus petite), la page rétrécit avec elle.

---

## v0.3.0-beta.7 — 14/11/2026

**Arrive toute seule si tu as une v0.3.0-beta installée avec l'installateur** (c'est la dernière fois : à partir de celle-ci, une mise à jour
est proposée, jamais installée sans toi). Sinon, installe-la à la main avec `Echoes-of-Atreia-Setup-0.3.0-beta.7.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.5.

**Ce qui change**
- **Les mises à jour se font quand tu le décides** : une nouvelle version du launcher est proposée sur une ligne en haut de la fenêtre, avec
  « Quoi de neuf », « Mettre à jour » et « Plus tard ». Rien n'est téléchargé avant « Mettre à jour », rien n'est installé avant
  « Redémarrer et installer », et fermer le launcher n'installe plus rien. Un téléchargement raté le dit et propose « Réessayer ».
- **« Quoi de neuf » s'ouvre dans une fenêtre**, pour le launcher comme pour le serveur : la page ne bouge plus.
- **L'accueil tient dans la fenêtre** sans barre de défilement :
  - la base de données (MySQL) tient sur une ligne comme les serveurs ; la façon dont elle est lancée (ton my.ini ou le service Windows) s'ouvre
    avec le bouton « … » à côté de son nom ;
  - sans service ni my.ini, « Démarrer avec mon my.ini… » est sur la ligne elle-même ;
  - les Nouveautés et l'Installation ne s'étirent plus avec du vide.
- **Une fenêtre ne se ferme plus** quand on clique dans sa marge ; seulement à côté.

---

## v0.3.0-beta.6 — 14/11/2026

**Arrive toute seule si tu as une v0.3.0-beta installée avec l'installateur.** Sinon, installe-la à la main avec
`Echoes-of-Atreia-Setup-0.3.0-beta.6.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien, la densité des bots et la population du serveur demandent le serveur
v0.1.0-beta.5.

**Ce qui change**
- **Installer le serveur à partir de rien** : sur un ordinateur qui n'a que le client du jeu, l'accueil propose « Installer le serveur ». Tu
  choisis un dossier (vide, ou un dossier `echoes-server` y est créé) ; le launcher vérifie la place sur le disque, télécharge et vérifie le
  serveur, son Java, sa base de données MySQL et les cartes des bots (environ 2,1 Go), crée la base sur un port libre et prend ce dossier comme
  serveur. Rien n'est installé dans Windows. Un téléchargement interrompu reprend où il en était ; si la base n'a pas pu être créée,
  « Réessayer » reprend à cette étape.
- **Le Java et le MySQL de l'installation** : un serveur qui porte les siens (dossiers `runtime` et `mysql`) démarre avec eux, et les
  sauvegardes utilisent ses outils ; sinon rien ne change.
- **La densité des bots** sur la page Bots : le mode et le pourcentage, et la population du serveur en cours (les bots éveillés sur ceux
  voulus, les endormis, et si le serveur retient les arrivées faute de mémoire ou de calcul de trajets).
- **La mémoire du serveur de jeu adaptée à l'ordinateur** : 1 Go sous 6 Go de mémoire, 1,5 Go sous 10 Go, 2 Go sous 14 Go, la valeur du
  serveur au-delà.

**Configuration requise** : Windows et le client Aion 4.8. Un JDK 25 et MySQL seulement pour un serveur installé autrement que par le
launcher.
