# Notes de version

The launcher's release notes in French; [current.en.md](current.en.md) holds the same entries in English, headed by the same version tags, in
the same order, written in the same pass. Newest first. Each entry names the lowest server version it works with ("Serveur minimum : ..."),
and `tools/release.ps1` refuses a release without both entries. The releases made before (v0.1.0, v0.2.0) have their notes on GitHub only.
When this file nears 200 lines, the oldest entries move to `<year>-<month>.md`, and their English ones to `<year>-<month>.en.md`.

---

## v0.3.0-beta.15 — 17/11/2026

**Proposée par le launcher** si tu as la v0.3.0-beta.14 : « Mettre à jour » sur la ligne en haut de la fenêtre. Sinon, installe-la à la
main avec `Echoes-of-Atreia-Setup-0.3.0-beta.15.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.6 ; le panneau d'administration, un
serveur plus récent que la v0.1.0-beta.6 ; le seuil de RAM du PC, le serveur v0.1.0-beta.8 ; le délai « Aucun » des donjons, le serveur
v0.1.0-beta.9.

**Ce qui change**
- **Installer le serveur : un échec dit pourquoi, en une ligne** : le message de l'erreur et l'endroit du script, par exemple
  « Remove-Item : … (apply-sql.ps1:286) », avec ses accents, et un bouton « Voir le journal » qui ouvre `setup.log`. Les lignes d'erreur
  ne s'affichent plus comme l'étape en cours, et pendant que l'installation défait ce qu'elle a fait, la fenêtre le dit.
- **L'accueil dit « Installation du serveur… »** pendant une installation à partir de rien, et non plus « Mise à jour ».
- **Donjons : le délai avant d'y retourner** se règle dans les Réglages du serveur : officiel, divisé par 2, 3, 5 ou 10, ou « Aucun :
  autant d'entrées que tu veux ». Il vaut pour toi et pour les bots de ton groupe. Un délai déjà commencé garde sa durée ; l'entrée suivante
  suit le réglage.
- **Sauvegarde automatique des bases de données** après chaque arrêt des serveurs, quand le serveur de jeu tournait. Gardées : les 5
  dernières, et la dernière de chacun des 7 derniers jours de jeu ; tes propres sauvegardes ne sont jamais effacées. Une case de la page
  Sauvegardes la coupe ; elle est cochée par défaut. Si elle échoue au moment de quitter, la fenêtre reste ouverte et dit pourquoi ; la
  refermer quitte.

---

## v0.3.0-beta.14 — 16/11/2026

**Proposée par le launcher** si tu as la v0.3.0-beta.13 : « Mettre à jour » sur la ligne en haut de la fenêtre. Sinon, installe-la à la
main avec `Echoes-of-Atreia-Setup-0.3.0-beta.14.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.6 ; le panneau d'administration, un
serveur plus récent que la v0.1.0-beta.6 ; le seuil de RAM du PC, le serveur v0.1.0-beta.8.

**Ce qui change**
- **Installer le serveur : ce PC est vérifié avant le téléchargement.** Le dossier, PowerShell (bloqué ou bridé par une entreprise), la
  liste des ports ; puis MySQL et Java, lancés juste après leur téléchargement, avant les 2 Go du serveur et des cartes. Ce qui bloque est
  dit tout de suite, au lieu d'une installation qui reste figée.
- **Installer le serveur : la création de la base de données dit ce qu'elle fait**, ligne par ligne sous l'étape, et l'écrit dans
  `setup.log` du dossier du serveur. Un « Signaler un problème » fait pendant ou après l'installation emporte ce journal et celui de MySQL.
  Au bout de 15 minutes, l'installation s'arrête au lieu d'attendre sans fin.
- **Sans serveur installé**, seul l'accueil s'ouvre, et les terminaux n'apparaissent pas.
- **Les terminaux s'ouvrent par-dessus l'accueil**, sans déformer ses cadres, et restent grisés tant que tous les serveurs sont arrêtés.
- **Aucune barre de défilement** : la page Bots a deux onglets, « Réglages des bots » et « Liste des bots » ; chaque faction se lit par pages
  (« Précédents », « Suivants ») d'autant de bots que la fenêtre en tient ; la perte quotidienne des points d'honneur est sur deux colonnes.
- **Nouveautés** : la version que tu as porte la marque « installée ».
- « 1 bot », « 1 fichier » au singulier ; la valeur officielle d'un réglage tient sur une ligne.

---

## v0.3.0-beta.13 — 15/11/2026

**Proposée par le launcher** si tu as la v0.3.0-beta.12 : « Mettre à jour » sur la ligne en haut de la fenêtre. Sinon, installe-la à la
main avec `Echoes-of-Atreia-Setup-0.3.0-beta.13.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.6 ; le panneau d'administration, un
serveur plus récent que la v0.1.0-beta.6 ; le seuil de RAM du PC, le serveur v0.1.0-beta.8.

**Ce qui change**
- **Plus de barre de défilement sur l'accueil quand aucun serveur n'est installé** : à côté des nouveautés, le cadre « Installer le
  serveur » poussait la page 15 pixels trop bas. Sa phrase et son bouton sont maintenant sur la même ligne.

---

## v0.3.0-beta.12 — 15/11/2026

**Proposée par le launcher** si tu as la v0.3.0-beta.11 : « Mettre à jour » sur la ligne en haut de la fenêtre. Sinon, installe-la à la
main avec `Echoes-of-Atreia-Setup-0.3.0-beta.12.exe`.

**Serveur minimum : v0.1.0-beta.1.** L'installation à partir de rien demande le serveur v0.1.0-beta.6 ; le panneau d'administration, un
serveur plus récent que la v0.1.0-beta.6 ; le seuil de RAM du PC, le serveur v0.1.0-beta.8 (sans lui, ses réglages n'apparaissent pas).

**Ce qui change**
- **Compte : le panneau Administration tient dans la page** : une ligne par mode, sur deux colonnes, et ce que fait chaque mode dans une
  fenêtre (« Ce que fait chaque mode ») ou au survol d'une case. Il débordait du cadre.
- **Invulnérable, Invisible, Laissé tranquille et Voir les cachés sont gardés aux prochaines connexions** : le serveur les réactivait à
  chaque connexion d'un personnage administrateur. Sans temps de recharge et Voler partout durent toujours jusqu'à la déconnexion.
- **Bots, Population : arrêter les arrivées de bots quand la RAM du PC est pleine**, avec le seuil de ton choix (90 % par défaut) ; les
  bots reprennent 5 points en dessous. Le cadre « Population en ce moment » affiche la RAM du PC utilisée.
- **Un réglage du serveur s'enregistre même si le serveur relit son fichier au même moment** : Windows refusait de le remplacer, et la case
  restait bloquée.

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
