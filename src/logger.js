// Minimal structured logger. No external dependency.
// Emits one JSON object per line to stdout (info/warn/debug) or stderr (error).
// Verbosity is controlled by LOG_LEVEL (debug|info|warn|error, default info).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase().trim()] ?? LEVELS.info;

function emit(level, component, message, extra) {
  if (LEVELS[level] < threshold) return;
  const entry = {
    t: new Date().toISOString(),
    level,
    component,
    msg: message,
  };
  if (extra && typeof extra === "object" && Object.keys(extra).length) {
    Object.assign(entry, extra);
  }
  const line = JSON.stringify(entry);
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (component, message, extra) => emit("debug", component, message, extra),
  info: (component, message, extra) => emit("info", component, message, extra),
  warn: (component, message, extra) => emit("warn", component, message, extra),
  error: (component, message, extra) => emit("error", component, message, extra),
};
