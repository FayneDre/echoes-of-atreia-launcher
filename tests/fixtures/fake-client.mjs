// Stands in for aion.bin in the end-to-end tests (ECHOES_FAKE_CLIENT): writes the arguments it was given to client-args.json in the
// folder it was started in, which must be the client folder.
import { writeFileSync } from 'node:fs'

writeFileSync('client-args.json', JSON.stringify(process.argv.slice(2)))
