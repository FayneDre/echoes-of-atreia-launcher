import type { MessageKey } from './en'

export const fr: Record<MessageKey, string> = {
  'language.label': 'Langue',
  'home.tagline': "Atreia n'est plus jamais vide.",
  'footer.disclaimer': 'Projet de fan non officiel, sans lien avec NCSoft ni approuvé par NCSoft.',

  'section.servers': 'Serveurs',
  'section.terminals': 'Terminaux',
  'section.install': 'Installation',

  'server.mysql': 'Base de données (MySQL)',
  'server.chat': 'Serveur de chat',
  'server.login': 'Serveur de connexion',
  'server.game': 'Serveur de jeu',
  'server.external': 'lancé hors du launcher',
  'server.port': 'port {port}',

  'status.stopped': 'Arrêté',
  'status.starting': 'Démarrage…',
  'status.registering': 'Chargement du monde…',
  'status.ready': 'Prêt',
  'status.stopping': 'Arrêt en cours…',
  'status.failed': 'En échec',
  'status.unknown': 'Inconnu',
  'status.missing': 'Non installé',

  'action.start': 'Démarrer les serveurs',
  'action.stop': 'Arrêter les serveurs',
  'action.play': 'Jouer',
  'action.mysqlStart': 'Démarrer',
  'action.mysqlStop': 'Arrêter',
  'action.forceStop': "Forcer l'arrêt",
  'action.choose': 'Choisir…',
  'action.forceConfirm':
    "Tuer le serveur de jeu fait perdre tout ce qu'il n'a pas encore sauvegardé : positions, objets et progression depuis sa dernière sauvegarde. Le tuer quand même ?",

  'install.server': 'Dossier du serveur',
  'install.client': 'Dossier du client',
  'install.java': 'Java',
  'install.notFound': 'Introuvable',
  'install.notSet': 'Non défini',
  'install.detecting': 'Recherche du serveur, du client, de Java et de MySQL…',
  'install.javaVersion': 'Java {version}',
  'install.javaTooOld': 'Java {version} (25 ou plus requis)',

  'terminal.empty': 'Rien pour le moment.',

  'quit.title': 'Les serveurs tournent encore',
  'quit.body':
    "Les arrêter avant de partir ? Le serveur de jeu sauvegarde chaque personnage en s'arrêtant, ce qui peut prendre quelques minutes.",
  'quit.stop': 'Les arrêter et quitter',
  'quit.leave': 'Les laisser tourner et quitter',
  'quit.cancel': 'Annuler',
  'quit.stopping': 'Arrêt des serveurs…',

  'problem.server-missing': 'Aucune installation du serveur trouvée. Choisis le dossier du serveur ci-dessous.',
  'problem.client-missing': 'Aucun client du jeu trouvé. Choisis le dossier du client ci-dessous.',
  'problem.java-missing': "Java est introuvable. Installe Java 25 ou plus récent.",
  'problem.java-too-old': 'Les serveurs ont besoin de Java 25 ou plus récent.',
  'problem.mysql-missing': "Aucun service MySQL n'a été trouvé sur cet ordinateur.",
  'problem.mysql-refused': "Windows n'a pas autorisé le démarrage ou l'arrêt de MySQL (la demande d'autorisation a été refusée).",
  'problem.mysql-timeout': "MySQL n'a pas répondu à temps.",
  'problem.mysql-in-use': 'Arrête les serveurs avant MySQL : le serveur de jeu sauvegarde les personnages dans la base.',
  'problem.exited': "Le serveur s'est arrêté tout seul.",
  'problem.port-timeout': "Le serveur n'a pas ouvert son port en deux minutes.",
  'problem.register-timeout': "Le serveur de jeu n'a pas rejoint le serveur de connexion en dix minutes.",
  'problem.stop-unanswered':
    "Le serveur de jeu n'a pas répondu à la demande d'arrêt. Cette version du serveur est peut-être trop ancienne.",
  'problem.stop-timeout': "Le serveur ne s'est pas arrêté à temps.",
  'problem.client-failed': "Le client du jeu n'a pas pu être lancé."
}
