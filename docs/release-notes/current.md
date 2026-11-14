# Notes de version

The launcher's release notes in French; [current.en.md](current.en.md) holds the same entries in English, headed by the same version tags, in
the same order, written in the same pass. Newest first. Each entry names the lowest server version it works with ("Serveur minimum : ..."),
and `tools/release.ps1` refuses a release without both entries. The releases made before (v0.1.0, v0.2.0) have their notes on GitHub only.
When this file nears 200 lines, the oldest entries move to `<year>-<month>.md`, and their English ones to `<year>-<month>.en.md`.

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

---

## v0.3.0-beta.5 — 07/11/2026

**Arrive toute seule si tu as une v0.3.0-beta installée avec l'installateur.** Sinon, installe-la à la main avec
`Echoes-of-Atreia-Setup-0.3.0-beta.5.exe`.

**Serveur minimum : v0.1.0-beta.1.** Pour les taux premium, il faut le serveur v0.1.0-beta.3, qui rend premium tous les comptes des
joueurs : installe-le depuis le panneau « Version du serveur ».

**Ce qui change**
- **Les taux sont ceux des comptes premium** : tous les comptes des joueurs sont premium (serveur v0.1.0-beta.3), donc la page Réglages
  règle les taux premium. Les taux normaux restent ceux des bots et ne sont pas affichés. À la place de « Valeurs officielles », deux
  boutons mettent les taux aux valeurs officielles d'un compte normal ou d'un compte premium : tu choisis le rythme de l'un ou de l'autre.
- **Les taux s'appliquent vraiment en jeu** : écrits dans `mygs.properties`, ils n'étaient pas pris en compte. Ils sont maintenant écrits
  dans `config/main/rates.properties` (la version d'origine est gardée à côté, `rates.properties.before-launcher`). Un taux réglé par une
  version précédente du launcher y est déplacé au prochain enregistrement.
- **La fenêtre agrandie ou en plein écran** : toute la page grandit avec la fenêtre au lieu de laisser des marges vides (jusqu'à 160 %).
- **F11** met le launcher en plein écran et l'en sort ; un bouton « Quitter le plein écran » remplace les boutons de Windows, et Échap en sort
  aussi.

**Configuration requise** : Windows, un JDK 25 ou plus récent, MySQL, le client Aion 4.8.

---

## v0.3.0-beta.4 — 07/11/2026

**Arrive toute seule si tu as une v0.3.0-beta installée avec l'installateur.** Sinon, installe-la à la main avec
`Echoes-of-Atreia-Setup-0.3.0-beta.4.exe`.

**Serveur minimum : v0.1.0-beta.1.**

**Ce qui change**
- **La langue du jeu** : le client était lancé avec un code de langue qu'il ne connaît pas, d'où le coréen sur un client qui n'a que le
  français. Le launcher vérifie maintenant le dossier du client avant de lancer le jeu (les fichiers du moteur, les packs de langue de `L10N`)
  et propose dans Installation → « Langue du jeu » les langues dont le pack est complet. Par défaut, celle de l'interface du launcher. Un
  fichier ou un pack qui manque est nommé, et « Jouer » refuse au lieu de lancer un jeu qui ne démarrera pas.
- **Une vraie icône** pour le launcher, sa barre de titre, l'installateur et le raccourci du bureau. Si Windows garde l'ancienne sur le
  raccourci, elle se met à jour au prochain redémarrage.
- **Garder les serveurs en arrière-plan** : en fermant la fenêtre pendant que les serveurs tournent, une nouvelle réponse les laisse tourner
  sous le launcher, qui reste près de l'horloge. Son icône rouvre la fenêtre ; son menu lance le jeu, démarre ou arrête les serveurs, ou quitte.
- **La barre des tâches** montre l'état des serveurs par une pastille, et la progression d'une sauvegarde ou d'une mise à jour.
- **Options** dans Installation : démarrer les serveurs à l'ouverture du launcher, lancer le launcher avec Windows, un raccourci sur le bureau,
  et le nettoyage des vieux fichiers à chaque démarrage (vers la corbeille : les journaux archivés des serveurs au-delà de 30 jours ou de
  1 Go, les rapports au-delà des 10 plus récents ; les sauvegardes ne sont jamais touchées).
- **Signaler un problème** (en bas de la fenêtre) : prépare un zip avec les journaux des serveurs et du launcher, les notes des bots et un
  résumé, sans le nom de ton compte Windows, et ouvre la page pour le signaler sur GitHub.
- **Nouvelle page d'accueil** : l'état des serveurs en bannière, le personnage, les bots dans le monde, la mémoire du serveur de jeu et la
  dernière sauvegarde ; les nouveautés du launcher et du serveur ; l'espace libre, les sauvegardes et la taille de la base. La mise en page
  est la même en français et en anglais.
- **Page Bots** : la courbe de la dernière heure, les bots dans le monde par faction.
- **Terminaux** : dans un tiroir en bas, les erreurs en rouge, les avertissements en jaune, un bouton pour ouvrir le dossier des journaux.
- **Moins de mémoire** : le launcher n'utilise plus la carte graphique (110 à 190 Mo de moins, autant de laissé au jeu), et sa fenêtre est
  fermée en arrière-plan (70 Mo de moins).

**Ce qui n'est pas réglé** (connu, inutile de le signaler)
- **Le pack français** en circulation vient d'une autre version du jeu : il lui manque trois fichiers du pack anglais (l'intro de la 4.8 et
  deux archives de son de cinématiques), et des textes de la 4.8 pourraient y manquer. Le launcher le dit dans Installation.
- **L'installation du serveur** depuis le launcher n'a pas encore été vérifiée sur une vraie installation de testeur.

**Configuration requise** : Windows, un JDK 25 ou plus récent, MySQL, le client Aion 4.8.
