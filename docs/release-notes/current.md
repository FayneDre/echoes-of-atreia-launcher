# Notes de version

The launcher's release notes in French; [current.en.md](current.en.md) holds the same entries in English, headed by the same version tags, in
the same order, written in the same pass. Newest first. Each entry names the lowest server version it works with ("Serveur minimum : ..."),
and `tools/release.ps1` refuses a release without both entries. The releases made before (v0.1.0, v0.2.0) have their notes on GitHub only.
When this file nears 200 lines, the oldest entries move to `<year>-<month>.md`, and their English ones to `<year>-<month>.en.md`.

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
