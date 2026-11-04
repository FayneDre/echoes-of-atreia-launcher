import { connect } from 'node:net'

/**
 * Whether something accepts connections on a port. A connection is tried rather than the system's table of listening sockets read, because
 * that table is not reliable here: on a French Windows `netstat` prints wrong states, and MySQL's socket did not appear in it at all.
 *
 * Callers stop probing as soon as the answer is yes: every successful probe is a connection the server sees, and the game server rejects
 * a source that opens 20 in 10 seconds.
 */
export function isPortOpen(port: number, host = '127.0.0.1', timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host })
    let settled = false
    const finish = (open: boolean): void => {
      if (!settled) {
        settled = true
        socket.destroy()
        resolve(open)
      }
    }
    socket.setTimeout(timeoutMs, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}
