# Notes de version

The launcher's release notes in French; [current.en.md](current.en.md) holds the same entries in English, headed by the same version tags, in
the same order, written in the same pass. Newest first. Each entry names the lowest server version it works with ("Serveur minimum : ..."),
and `tools/release.ps1` refuses a release without both entries. The releases made before (v0.1.0, v0.2.0) have their notes on GitHub only.
When this file nears 200 lines, the oldest entries move to `<year>-<month>.md`, and their English ones to `<year>-<month>.en.md`.

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
