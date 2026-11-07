# Notes de version

The launcher's release notes in French; [current.en.md](current.en.md) holds the same entries in English, headed by the same version tags, in
the same order, written in the same pass. Newest first. Each entry names the lowest server version it works with ("Serveur minimum : ..."),
and `tools/release.ps1` refuses a release without both entries. The releases made before (v0.1.0, v0.2.0) have their notes on GitHub only.
When this file nears 200 lines, the oldest entries move to `<year>-<month>.md`, and their English ones to `<year>-<month>.en.md`.

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

---

## v0.3.0-beta.3 — 06/11/2026

**Arrive toute seule si tu as la v0.3.0-beta.2 installée** (avec l'installateur) : c'est la première mise à jour que le launcher fait lui-même.
Sinon, installe-la à la main avec `Echoes-of-Atreia-Setup-0.3.0-beta.3.exe`.

**Serveur minimum : v0.1.0-beta.1.** Pour installer le serveur depuis le launcher, il faut le serveur v0.1.0-beta.2, le premier livré tout
compilé.

**Ce qui change**
- **Le launcher installe le serveur** : un panneau « Version du serveur » sur l'accueil dit la version installée et propose la pre-release
  du serveur la plus récente, avec ses notes. « Mettre à jour le serveur » télécharge et vérifie tout pendant que les serveurs tournent
  (le serveur, puis les cartes du navmesh qui ont changé : 1,8 Go la première fois), puis montre ce qui va se passer : les fichiers de
  réglages que tu as modifiés, qui restent tels quels (la nouvelle version est posée à côté en `.new-<version>`), et ta base de données si
  elle n'est jamais passée par le script SQL du serveur. « Installer » arrête les serveurs proprement, remplace les fichiers en gardant une
  copie de chacun, met à jour la base (après l'avoir sauvegardée) et relance les serveurs.
- **Revenir en arrière** : « Revenir à… » remet les fichiers de la version précédente. La base garde les changements de la mise à jour ;
  sa sauvegarde est dans le dossier `backups` du serveur.
- **Un JDK 25 est nécessaire** (pas seulement Java) : le launcher le vérifie avant d'installer et dit quoi faire s'il manque.
- **Un serveur de développement** (installé par le script de déploiement du serveur) n'est jamais remplacé par une version publiée.

**Ce qui n'est pas réglé** (connu, inutile de le signaler)
- **L'installation du serveur** n'a été vérifiée qu'en tests et sur un bundle d'essai, pas encore sur une vraie installation de testeur.
- **La langue du client** est forcée en anglais : un client qui n'a que le français affiche du coréen.

**Configuration requise** : Windows, un JDK 25 ou plus récent, MySQL, le client Aion 4.8.

---

## v0.3.0-beta.2 — 06/11/2026

**À installer une fois à la main, avec l'installateur** (`Echoes-of-Atreia-Setup-0.3.0-beta.2.exe`, pas la version portable) : c'est la
première version qui se met à jour toute seule, les suivantes arrivent par le launcher.

**Serveur minimum : v0.1.0-beta.1.** Le launcher le vérifie maintenant lui-même.

**Ce qui change**
- **Mise à jour automatique** : le launcher regarde ses versions sur GitHub au démarrage puis toutes les 4 heures (une version bêta suit les
  pre-releases, une stable seulement les versions stables). Une version plus récente se télécharge en arrière-plan, un bandeau dit quand elle
  est prête, avec ses notes dans ta langue, et elle s'installe à la fermeture du launcher. « Redémarrer et installer » l'installe tout de suite :
  si des serveurs tournent, la fermeture te demande quoi en faire, comme d'habitude, et rien n'est proposé pendant un démarrage ou un arrêt. La
  copie portable ne peut pas se remplacer : elle dit seulement qu'une version est sortie et où la télécharger.
- **Version du serveur** : le launcher demande sa version au serveur de jeu quand il est prêt, et la lit dans le `manifest.json` de
  l'installation quand il est arrêté. Un serveur trop ancien pour ce launcher affiche un bandeau qui dit quelle version installer.
- **Serveurs déjà lancés** : le launcher ne reprend un serveur lancé en dehors de lui que s'il n'y en a qu'un de ce type sur l'ordinateur.
  S'il y en a plusieurs, il ne devine plus lequel est le tien, et il te demande de l'arrêter toi-même dans sa fenêtre plutôt que d'en arrêter
  un autre.

**Ce qui n'est pas réglé** (connu, inutile de le signaler)
- **La mise à jour depuis GitHub** n'a été vérifiée que sur un serveur de test local : la vraie vérification sera le passage à la beta.3.
- **La langue du client** est forcée en anglais : un client qui n'a que le français affiche du coréen.

**Configuration requise** : Windows, Java 25 ou plus récent, MySQL, le client Aion 4.8.

---

## v0.3.0-beta.1 — 06/11/2026

Première pre-release du launcher : elle part de la branche `develop`, et la version stable (`Latest`) reste la v0.2.0.

**Serveur minimum : v0.1.0-beta.1**, la première pre-release du serveur (elle a le canal d'administration et les réglages des bots dont les pages
Bots, Téléportation et Réglages ont besoin). Le launcher ne vérifie pas encore lui-même la version du serveur : ça vient dans une prochaine
version.

**Ce qui change**
- **MySQL qui s'arrête aussitôt** : quand Windows démarre le service MySQL mais que MySQL s'arrête dans la foulée, le launcher dit pourquoi
  (l'état du service, le fichier de configuration qu'il lit et les dernières erreurs de son journal) au lieu d'attendre pour rien.
- **MySQL avec ton propre my.ini** : « Démarrer avec mon my.ini… » lance MySQL comme un programme avec ton fichier, sans passer par le service
  ni demander les droits d'administrateur. « Utiliser le service Windows » revient au service. Le launcher l'arrête avec `mysqladmin shutdown`,
  jamais en le tuant : le compte de base de données du serveur de jeu doit avoir le privilège SHUTDOWN, sinon le launcher affiche le refus de
  MySQL.

**Ce qui n'est pas réglé** (connu, inutile de le signaler)
- **La langue du client** est forcée en anglais : un client qui n'a que le français affiche du coréen.
- **Le mode « mon my.ini »** a été vérifié sur une installation MySQL d'essai, pas encore sur la tienne.

**Configuration requise** : Windows, Java 25 ou plus récent, MySQL, le client Aion 4.8.

---
