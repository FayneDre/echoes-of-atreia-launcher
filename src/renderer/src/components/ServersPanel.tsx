import { SERVER_IDS, type LauncherState, type ServerId, type ServerState } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Icon } from './Icon'
import { ProblemText } from './ProblemText'

function StatusDot({ status }: { status: string }): React.JSX.Element {
  return <span className={`dot dot-${status}`} aria-hidden="true" />
}

interface RowProps {
  server: ServerState
  /** Nothing else is under way and the install is there: the row may start or restart its server. */
  canAct: boolean
  onForceStop: () => void
  onShowLog: () => void
}

function ServerRow({ server, canAct, onForceStop, onShowLog }: RowProps): React.JSX.Element {
  const { t } = useI18n()
  // Offered once a stop has gone wrong, never as a first choice.
  const canForce = server.status === 'stopping' && server.problem !== undefined
  const action = server.status === 'ready' ? 'action.restartOne' : server.status === 'stopped' || server.status === 'failed' ? 'action.startOne' : null
  return (
    <li className="server-row" data-testid={`server-${server.id}`}>
      <div className="server-line">
        <StatusDot status={server.status} />
        <span className="server-name" title={server.port !== null ? t('server.port', { port: server.port }) : undefined}>
          {t(`server.${server.id}`)}
        </span>
        {server.external && <span className="server-meta">{t('server.external')}</span>}
        <span className="server-status" data-testid={`status-${server.id}`} data-status={server.status}>
          {t(`status.${server.status}`)}
        </span>
        {canForce && (
          <button type="button" className="button-danger small" onClick={onForceStop}>
            {t('action.forceStop')}
          </button>
        )}
        {action && !canForce && (
          <button
            type="button"
            className="small"
            data-testid={`restart-${server.id}`}
            disabled={!canAct}
            onClick={() => void window.launcher.restartServer(server.id)}
          >
            <Icon name={server.status === 'ready' ? 'restart' : 'play'} />
            {t(action)}
          </button>
        )}
      </div>
      <ProblemText problem={server.problem} onShowLog={onShowLog} />
    </li>
  )
}

export function ServersPanel({ state, onShowLog }: { state: LauncherState; onShowLog: (id: ServerId) => void }): React.JSX.Element {
  const { t } = useI18n()
  const { mysql, servers, activity, install } = state
  const idle = activity === 'idle'
  const mysqlIdle = idle && mysql.status !== 'starting' && mysql.status !== 'stopping'

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
            <span className="server-name" title={mysql.port !== null ? t('server.port', { port: mysql.port }) : undefined}>
              {t('server.mysql')}
            </span>
            {mysql.optionsFile && <span className="server-meta">{t('server.mysqlOptions', { file: mysql.optionsFile })}</span>}
            <span className="server-status" data-testid="status-mysql" data-status={mysql.status}>
              {t(`status.${mysql.status}`)}
            </span>
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
          <ServerRow
            key={id}
            server={servers[id]}
            canAct={idle && install.serverFound}
            onForceStop={() => forceStop(id)}
            onShowLog={() => onShowLog(id)}
          />
        ))}
      </ul>

    </section>
  )
}
