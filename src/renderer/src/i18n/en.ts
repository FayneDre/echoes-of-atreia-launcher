// The reference dictionary: every other language must define the same keys.
export const en = {
  'language.label': 'Language',
  'home.tagline': 'Atreia is never empty.',
  'footer.disclaimer': 'Unofficial fan project, not affiliated with or endorsed by NCSoft.',

  'section.servers': 'Servers',
  'section.terminals': 'Terminals',
  'section.install': 'Installation',

  'server.mysql': 'Database (MySQL)',
  'server.chat': 'Chat server',
  'server.login': 'Login server',
  'server.game': 'Game server',
  'server.external': 'started outside the launcher',
  'server.port': 'port {port}',

  'status.stopped': 'Stopped',
  'status.starting': 'Starting…',
  'status.registering': 'Loading the world…',
  'status.ready': 'Ready',
  'status.stopping': 'Stopping…',
  'status.failed': 'Failed',
  'status.unknown': 'Unknown',
  'status.missing': 'Not installed',

  'action.start': 'Start the servers',
  'action.stop': 'Stop the servers',
  'action.play': 'Play',
  'action.mysqlStart': 'Start',
  'action.mysqlStop': 'Stop',
  'action.forceStop': 'Force stop',
  'action.choose': 'Choose…',
  'action.forceConfirm':
    'Killing the game server loses everything it has not saved yet: positions, items and progress since its last save. Kill it anyway?',

  'install.server': 'Server folder',
  'install.client': 'Game client folder',
  'install.java': 'Java',
  'install.notFound': 'Not found',
  'install.notSet': 'Not set',
  'install.detecting': 'Looking for the server, the client, Java and MySQL…',
  'install.javaVersion': 'Java {version}',
  'install.javaTooOld': 'Java {version} (25 or later needed)',

  'terminal.empty': 'Nothing yet.',

  'quit.title': 'The servers are still running',
  'quit.body': 'Stop them before leaving? The game server saves every character as it stops, which can take a few minutes.',
  'quit.stop': 'Stop them and quit',
  'quit.leave': 'Leave them running and quit',
  'quit.cancel': 'Cancel',
  'quit.stopping': 'Stopping the servers…',

  'problem.server-missing': 'No server installation found. Choose the server folder below.',
  'problem.client-missing': 'No game client found. Choose the client folder below.',
  'problem.java-missing': 'Java was not found. Install Java 25 or later.',
  'problem.java-too-old': 'The servers need Java 25 or later.',
  'problem.mysql-missing': 'No MySQL service was found on this computer.',
  'problem.mysql-refused': 'Windows did not allow MySQL to be started or stopped (the permission prompt was declined).',
  'problem.mysql-timeout': 'MySQL did not answer in time.',
  'problem.mysql-in-use': 'Stop the servers before MySQL: the game server saves the characters into the database.',
  'problem.exited': 'The server stopped by itself.',
  'problem.port-timeout': 'The server did not open its port within two minutes.',
  'problem.register-timeout': 'The game server did not reach the login server within ten minutes.',
  'problem.stop-unanswered': 'The game server did not answer the stop request. This server version may be too old for it.',
  'problem.stop-timeout': 'The server did not stop in time.',
  'problem.client-failed': 'The game client could not be started.'
}

export type MessageKey = keyof typeof en
