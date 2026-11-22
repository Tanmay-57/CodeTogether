import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ERROR_CODES, ServerEvents } from '@codetogether/shared'
import { logger } from '../logger'

const CHUNK = 4000

export interface RunLimits {
  timeoutMs: number
  maxOutputBytes: number
}

type StreamName = 'stdout' | 'stderr' | 'system' | 'stdin'

interface Line {
  stream: StreamName
  text: string
}

interface Snapshot {
  runId: string
  running: boolean
  startedBy: string
  language: string
  lines: Line[]
  exitCode: number | null
  timedOut: boolean
}

interface ActiveRun {
  runId: string
  roomId: string
  startedBy: string
  language: string
  lines: Line[]
  outputBytes: number
  truncated: boolean
  timedOut: boolean
  stopped: boolean
  settled: boolean
  dir: string | null
  child: ChildProcess | null
}

interface PythonCommand {
  command: string
  prefix: string[]
}

export class CodeRunner {
  private readonly active = new Map<string, ActiveRun>()
  private readonly last = new Map<string, Snapshot>()
  private pythonCommand: PythonCommand | null | undefined
  private typeScriptMode: 'strip' | 'native' | 'no' | undefined

  constructor(
    private readonly limits: RunLimits,
    private readonly emit: (roomId: string, event: string, payload: unknown) => void,
  ) {}

  isRunning(roomId: string): boolean {
    return this.active.has(roomId)
  }

  replay(socket: { emit: (event: string, payload: unknown) => void }, roomId: string): void {
    const snap = this.last.get(roomId)
    if (!snap) return
    socket.emit(ServerEvents.CodeState, {
      runId: snap.runId,
      running: snap.running,
      startedBy: snap.startedBy,
      lines: snap.lines.map((line) => ({ stream: line.stream, text: line.text })),
    })
  }

  clearOutput(roomId: string): void {
    const run = this.active.get(roomId)
    if (run) {
      run.lines = []
      this.remember(run, true, null)
    } else {
      const snap = this.last.get(roomId)
      if (snap) snap.lines = []
    }
    this.emit(roomId, ServerEvents.CodeCleared, {})
  }

  async start(
    roomId: string,
    source: string,
    language: string,
    startedBy: string,
  ): Promise<{ ok: true } | { ok: false; code: typeof ERROR_CODES.RUN_IN_PROGRESS }> {
    if (this.active.has(roomId)) return { ok: false, code: ERROR_CODES.RUN_IN_PROGRESS }
    const run = this.begin(roomId, language || 'plaintext', startedBy)
    if (!source.trim()) {
      this.finish(run, null, 'Nothing to run.')
      return { ok: true }
    }
    if (language === 'typescript') {
      const mode = await this.resolveTypeScript()
      if (run.settled) return { ok: true }
      if (mode === 'no') {
        this.finish(run, null, "TypeScript cannot be run with this server's Node. Use JavaScript or Python.")
        return { ok: true }
      }
      return this.launchFile(run, source, 'main.ts', mode === 'strip' ? ['--experimental-strip-types'] : [])
    }
    if (language !== 'javascript' && language !== 'python') {
      this.finish(run, null, 'This language cannot be run. Use JavaScript or Python.')
      return { ok: true }
    }
    return this.launchFile(run, source, language === 'python' ? 'main.py' : 'main.js', [])
  }

  private async launchFile(
    run: ActiveRun,
    source: string,
    fileName: string,
    nodePrefix: string[],
  ): Promise<{ ok: true }> {
    try {
      const dir = await mkdtemp(join(tmpdir(), 'codetogether-run-'))
      run.dir = dir
      const filePath = join(dir, fileName)
      await writeFile(filePath, source, 'utf8')
      if (run.settled) {
        await rm(dir, { recursive: true, force: true })
        return { ok: true }
      }
      if (fileName.endsWith('.py')) {
        const python = await this.resolvePython()
        if (run.settled) {
          await rm(dir, { recursive: true, force: true })
          return { ok: true }
        }
        if (!python) {
          this.finish(run, null, 'Python is not available on the machine running the server.')
          return { ok: true }
        }
        this.launch(run, python.command, [...python.prefix, filePath], dir)
      } else {
        this.launch(run, process.execPath, [...nodePrefix, filePath], dir)
      }
      return { ok: true }
    } catch (error) {
      logger.warn({ roomId: run.roomId, language: run.language, err: error instanceof Error ? error.message : 'write failed' }, 'run failed to start')
      this.finish(run, null, 'The run could not be started.')
      return { ok: true }
    }
  }

  writeInput(roomId: string, text: string): { ok: true } | { ok: false; code: typeof ERROR_CODES.NO_ACTIVE_RUN } {
    const run = this.active.get(roomId)
    const stdin = run?.child?.stdin
    if (!run || run.settled || !stdin || !stdin.writable) return { ok: false, code: ERROR_CODES.NO_ACTIVE_RUN }
    const line = `${text.replace(/\r/g, '')}\n`
    this.push(run, 'stdin', line)
    try {
      stdin.write(line)
    } catch {
      return { ok: false, code: ERROR_CODES.NO_ACTIVE_RUN }
    }
    return { ok: true }
  }

  stop(roomId: string): void {
    const run = this.active.get(roomId)
    if (!run || run.settled) return
    run.stopped = true
    if (!run.child) {
      this.finish(run, null)
      return
    }
    this.kill(run)
  }

  clear(roomId: string): void {
    const run = this.active.get(roomId)
    if (run && !run.settled) {
      run.stopped = true
      if (run.child) this.kill(run)
      this.finish(run, null)
    }
    this.last.delete(roomId)
  }

  stopAll(): void {
    for (const roomId of [...this.active.keys()]) this.clear(roomId)
    this.last.clear()
  }

  private begin(roomId: string, language: string, startedBy: string): ActiveRun {
    const run: ActiveRun = {
      runId: randomUUID(),
      roomId,
      startedBy,
      language,
      lines: [],
      outputBytes: 0,
      truncated: false,
      timedOut: false,
      stopped: false,
      settled: false,
      dir: null,
      child: null,
    }
    this.active.set(roomId, run)
    this.emit(roomId, ServerEvents.CodeStarted, { runId: run.runId, language, startedBy })
    this.remember(run, true, null)
    return run
  }

  private launch(run: ActiveRun, command: string, args: string[], cwd: string): void {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      cwd,
      env: safeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    run.child = child
    child.stdin?.on('error', () => {})
    child.stdout?.on('data', (chunk: Buffer) => this.onOutput(run, 'stdout', chunk))
    child.stderr?.on('data', (chunk: Buffer) => this.onOutput(run, 'stderr', chunk))
    child.on('error', () => {
      if (!run.settled) this.finish(run, null, 'The run could not be started.')
    })
    child.on('close', (code) => this.finish(run, code))
  }

  private onOutput(run: ActiveRun, stream: 'stdout' | 'stderr', chunk: Buffer): void {
    if (run.settled || run.truncated) return
    const remaining = this.limits.maxOutputBytes - run.outputBytes
    if (remaining <= 0) {
      this.truncate(run)
      return
    }
    const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk
    run.outputBytes += slice.byteLength
    this.push(run, stream, slice.toString('utf8'))
    if (chunk.byteLength > remaining) this.truncate(run)
  }

  private truncate(run: ActiveRun): void {
    if (run.truncated || run.settled) return
    run.truncated = true
    this.push(run, 'system', 'Output stopped because it reached the size limit.')
    this.kill(run)
  }

  private push(run: ActiveRun, stream: StreamName, text: string): void {
    if (!text) return
    for (let index = 0; index < text.length; index += CHUNK) {
      const slice = text.slice(index, index + CHUNK)
      this.emit(run.roomId, ServerEvents.CodeOutput, { runId: run.runId, stream, text: slice })
      const last = run.lines[run.lines.length - 1]
      if (last && last.stream === stream && last.text.length + slice.length <= CHUNK) last.text += slice
      else run.lines.push({ stream, text: slice })
    }
    this.remember(run, !run.settled, null)
  }

  private finish(run: ActiveRun, code: number | null, system?: string): void {
    if (run.settled) return
    run.settled = true
    this.active.delete(run.roomId)
    if (run.dir) removeRunDir(run.dir)
    const text = system ?? (run.stopped ? 'Run stopped.' : `Exited with code ${code ?? 0}.`)
    this.push(run, 'system', text)
    this.emit(run.roomId, ServerEvents.CodeFinished, {
      runId: run.runId,
      exitCode: code,
      timedOut: run.timedOut,
    })
    this.remember(run, false, code)
    logger.info({ roomId: run.roomId, language: run.language, exitCode: code, timedOut: run.timedOut }, 'run finished')
  }

  private kill(run: ActiveRun): void {
    const child = run.child
    if (!child || child.killed || child.exitCode !== null) return
    child.kill()
  }

  private remember(run: ActiveRun, running: boolean, exitCode: number | null): void {
    this.last.set(run.roomId, {
      runId: run.runId,
      running,
      startedBy: run.startedBy,
      language: run.language,
      lines: run.lines.map((line) => ({ stream: line.stream, text: line.text })),
      exitCode,
      timedOut: run.timedOut,
    })
  }

  private async resolvePython(): Promise<PythonCommand | null> {
    if (this.pythonCommand !== undefined) return this.pythonCommand
    if (await commandWorks('python', ['--version'])) {
      this.pythonCommand = { command: 'python', prefix: [] }
      return this.pythonCommand
    }
    if (process.platform === 'win32' && await commandWorks('py', ['-3', '--version'])) {
      this.pythonCommand = { command: 'py', prefix: ['-3'] }
      return this.pythonCommand
    }
    this.pythonCommand = null
    return null
  }

  private async resolveTypeScript(): Promise<'strip' | 'native' | 'no'> {
    if (this.typeScriptMode) return this.typeScriptMode
    const sample = 'const value: number = 1'
    if (await commandWorks(process.execPath, ['--experimental-strip-types', '-e', sample])) {
      this.typeScriptMode = 'strip'
      return 'strip'
    }
    if (await commandWorks(process.execPath, ['-e', sample])) {
      this.typeScriptMode = 'native'
      return 'native'
    }
    this.typeScriptMode = 'no'
    return 'no'
  }
}

function safeEnv(): NodeJS.ProcessEnv {
  const keys = [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'LANG',
    'LC_ALL',
    'APPDATA',
    'LOCALAPPDATA',
  ]
  const env: NodeJS.ProcessEnv = {}
  for (const key of keys) {
    const value = process.env[key]
    if (value) env[key] = value
  }
  return env
}

function removeRunDir(dir: string): void {
  void rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }).catch((error: unknown) => {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'remove failed'
    logger.warn({ code }, 'run directory was not removed')
  })
}

function commandWorks(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', shell: false })
    const timer = setTimeout(() => {
      child.kill()
      resolve(false)
    }, 3000)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}
