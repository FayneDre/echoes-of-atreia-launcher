import { useEffect, useRef, useState } from 'react'
import { SERVER_IDS, type LauncherState, type ServerId, type ServerState } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Icon } from './Icon'
import { ProblemText } from './ProblemText'
import { closeOnBackdropClick } from '../dialog'

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

/**
 * How MySQL is run (a Windows service, or a program with a my.ini), over the page: the row keeps the one line of the others. It changes
 * only while MySQL is down, since the way it was started is the way it is stopped.
 */
function MysqlDialog({ state, onClose }: { state: LauncherState; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const { mysql, activity } = state
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const canChange = activity === 'idle' && mysql.status !== 'ready' && mysql.status !== 'unknown' && mysql.status !== 'starting' && mysql.status !== 'stopping'
  return (
    <dialog
      ref={dialog}
      className="dialog mysql-dialog"
      aria-labelledby="mysql-dialog-title"
      data-testid="mysql-dialog"
      onClose={onClose}
      onClick={closeOnBackdropClick}
    >
      <h2 id="mysql-dialog-title">{t('server.mysql')}</h2>
      {mysql.optionsFile ? (
        <p className="mysql-how">{t('server.mysqlOptions', { file: mysql.optionsFile })}</p>
      ) : (
        mysql.serviceName && <p className="mysql-how">{t('server.mysqlService', { name: mysql.serviceName })}</p>
      )}
      {!canChange && <p className="muted">{t('server.mysqlChangeStopped')}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={!canChange} onClick={() => void window.launcher.chooseMysqlOptions()}>
          {t('action.mysqlOptions')}
        </button>
        {mysql.optionsFile && mysql.serviceName && (
          <button type="button" disabled={!canChange} onClick={() => void window.launcher.useMysqlService()}>
            {t('action.mysqlService')}
          </button>
        )}
        <button type="button" className="button-primary" onClick={() => dialog.current?.close()}>
          {t('action.close')}
        </button>
      </div>
    </dialog>
  )
}

/** MySQL on one line like the servers: its state and its start or stop; how it is run opens in a dialog. */
function MysqlRow({ state }: { state: LauncherState }): React.JSX.Element {
  const { t } = useI18n()
  const [choosing, setChoosing] = useState(false)
  const { mysql, activity } = state
  const mysqlIdle = activity === 'idle' && mysql.status !== 'starting' && mysql.status !== 'stopping'
  return (
    <li className="server-row" data-testid="server-mysql">
      <div className="server-line">
        <StatusDot status={mysql.status} />
        <span className="server-name server-name-fit" title={mysql.port !== null ? t('server.port', { port: mysql.port }) : undefined}>
          {t('server.mysql')}
        </span>
        {mysql.status !== 'unknown' && (
          <button
            type="button"
            className="small icon-button"
            aria-label={t('server.mysqlHow')}
            title={t('server.mysqlHow')}
            onClick={() => setChoosing(true)}
          >
            <Icon name="more" />
          </button>
        )}
        {/* beside its name, so the status and the button line up with the servers' */}
        <span className="server-spacer" />
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
            <Icon name={mysql.status === 'ready' ? 'stop' : 'play'} />
            {mysql.status === 'ready' ? t('action.mysqlStop') : t('action.mysqlStart')}
          </button>
        )}
        {/* no service and no my.ini: the one way to start it, in the start button's place, so nobody has to guess it is behind "…" */}
        {mysql.status === 'missing' && !mysql.serviceName && !mysql.optionsFile && (
          <button type="button" className="small" disabled={!mysqlIdle} onClick={() => void window.launcher.chooseMysqlOptions()}>
            {t('action.mysqlOptions')}
          </button>
        )}
      </div>
      <ProblemText problem={mysql.problem} />
      {choosing && <MysqlDialog state={state} onClose={() => setChoosing(false)} />}
    </li>
  )
}

export function ServersPanel({ state, onShowLog }: { state: LauncherState; onShowLog: (id: ServerId) => void }): React.JSX.Element {
  const { t } = useI18n()
  const { servers, activity, install } = state
  const idle = activity === 'idle'

  const forceStop = (id: ServerState['id']): void => {
    if (id !== 'game' || window.confirm(t('action.forceConfirm'))) {
      void window.launcher.forceStop(id)
    }
  }

  return (
    <section className="panel" aria-labelledby="servers-title">
      <h2 id="servers-title">{t('section.servers')}</h2>
      <ul className="server-list">
        <MysqlRow state={state} />
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
