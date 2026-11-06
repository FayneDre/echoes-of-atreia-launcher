import { SERVER_IDS, type LauncherState, type ServerState } from '../../../shared/types'
import { useI18n } from '../i18n'
import { ProblemText } from './ProblemText'

function StatusDot({ status }: { status: string }): React.JSX.Element {
  return <span className={`dot dot-${status}`} aria-hidden="true" />
}

function ServerRow({ server, onForceStop }: { server: ServerState; onForceStop: () => void }): React.JSX.Element {
  const { t } = useI18n()
  // Offered once a stop has gone wrong, never as a first choice.
  const canForce = server.status === 'stopping' && server.problem !== undefined
  return (
    <li className="server-row" data-testid={`server-${server.id}`}>
      <div className="server-line">
        <StatusDot status={server.status} />
        <span className="server-name">{t(`server.${server.id}`)}</span>
        <span className="server-status" data-testid={`status-${server.id}`} data-status={server.status}>
          {t(`status.${server.status}`)}
        </span>
        {server.port !== null && <span className="server-meta">{t('server.port', { port: server.port })}</span>}
        {server.external && <span className="server-meta">{t('server.external')}</span>}
        {canForce && (
          <button type="button" className="button-danger small" onClick={onForceStop}>
            {t('action.forceStop')}
          </button>
        )}
      </div>
      <ProblemText problem={server.problem} />
    </li>
  )
}

export function ServersPanel({ state }: { state: LauncherState }): React.JSX.Element {
  const { t } = useI18n()
  const { mysql, servers, activity, install } = state
  const idle = activity === 'idle'
  const mysqlIdle = idle && mysql.status !== 'starting' && mysql.status !== 'stopping'
  const running = SERVER_IDS.some((id) => !['stopped', 'failed'].includes(servers[id].status) || servers[id].external)
  const gameReady = servers.game.status === 'ready'
  // A stop can interrupt a start: the game server takes minutes to load.
  const canStop = running && (idle || activity === 'starting')

  const forceStop = (id: ServerState['id']): void => {
    if (id !== 'game' || window.confirm(t('action.forceConfirm'))) {
      void window.launcher.forceStop(id)
    }
  }

  return (
    <section className="panel" aria-labelledby="servers-title">
      <h2 id="servers-title">{t('section.servers')}</h2>
      <ul className="server-list">
        <li className="server-row" data-testid="server-mysql">
          <div className="server-line">
            <StatusDot status={mysql.status} />
            <span className="server-name">{t('server.mysql')}</span>
            <span className="server-status" data-testid="status-mysql" data-status={mysql.status}>
              {t(`status.${mysql.status}`)}
            </span>
            {mysql.port !== null && <span className="server-meta">{t('server.port', { port: mysql.port })}</span>}
            {mysql.optionsFile && <span className="server-meta">{t('server.mysqlOptions', { file: mysql.optionsFile })}</span>}
            {(mysql.serviceName || mysql.optionsFile) && (
              <button
                type="button"
                className="small"
                disabled={!mysqlIdle}
                onClick={() => void (mysql.status === 'ready' ? window.launcher.stopMysql() : window.launcher.startMysql())}
              >
                {mysql.status === 'ready' ? t('action.mysqlStop') : t('action.mysqlStart')}
              </button>
            )}
          </div>
          <ProblemText problem={mysql.problem} />
          {/* How MySQL is run changes only while it is down: the way it was started is the way it is stopped. */}
          {mysql.status !== 'ready' && mysql.status !== 'unknown' && (
            <div className="server-line">
              <button type="button" className="small" disabled={!mysqlIdle} onClick={() => void window.launcher.chooseMysqlOptions()}>
                {t('action.mysqlOptions')}
              </button>
              {mysql.optionsFile && mysql.serviceName && (
                <button type="button" className="small" disabled={!mysqlIdle} onClick={() => void window.launcher.useMysqlService()}>
                  {t('action.mysqlService')}
                </button>
              )}
            </div>
          )}
        </li>
        {SERVER_IDS.map((id) => (
          <ServerRow key={id} server={servers[id]} onForceStop={() => forceStop(id)} />
        ))}
      </ul>

      <div className="actions">
        <button type="button" disabled={!idle || !install.serverFound || gameReady} onClick={() => void window.launcher.start()}>
          {t('action.start')}
        </button>
        <button type="button" disabled={!canStop} onClick={() => void window.launcher.stop()}>
          {t('action.stop')}
        </button>
        <button type="button" className="button-primary" disabled={!gameReady || !install.clientFound} onClick={() => void window.launcher.play()}>
          {t('action.play')}
        </button>
      </div>
      <ProblemText problem={state.problem} />
    </section>
  )
}
