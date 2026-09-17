# Contributing

Thanks for helping improve Delay Monitor.

Before opening a pull request:

1. Keep changes focused and explain the user-visible behavior.
2. Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`.
3. Add or update parser fixtures when changing platform output handling.
4. Check that logs, samples, traceroutes, and configuration values do not contain private network data or credentials.

Issues should include the operating system, Node.js version, the command being run, and a redacted reproduction. Please do not attach raw `data/` files or unredacted route output.
