type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  if (configured && configured in order) return order[configured];
  return process.env.NODE_ENV === "test" ? 100 : order.info;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields });
  (level === "error" ? console.error : console.log)(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};
