const { spawn } = require('node:child_process')
const electron = require('electron')

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE

const child = spawn(electron, ['.'], {
  cwd: process.cwd(),
  env: environment,
  stdio: 'inherit',
})

child.on('exit', code => process.exit(code ?? 0))
child.on('error', error => {
  console.error(error)
  process.exit(1)
})
