type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_TAG: Record<Level, string> = { debug: 'DBG', info: 'INF', warn: 'WRN', error: 'ERR' };

let minLevel: Level = 'info';

function emit(level: Level, scope: string, msg: string): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(`${ts} ${LEVEL_TAG[level]} [${scope}] ${msg}\n`);
}

export const log = {
  setLevel(level: Level) { minLevel = level; },

  debug(scope: string, msg: string) { emit('debug', scope, msg); },
  info(scope: string, msg: string) { emit('info', scope, msg); },
  warn(scope: string, msg: string) { emit('warn', scope, msg); },
  error(scope: string, msg: string) { emit('error', scope, msg); },
};
