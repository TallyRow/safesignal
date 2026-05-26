/**
 * Public runtime entrypoint for the frontend logging package.
 *
 * This is the ONLY module consumers may import at runtime. Internal modules
 * (`src/internal/**`, `src/pipeline/**`, `src/transport/**` implementation
 * details, `src/api/**` types only — see below) MUST NOT be re-exported from
 * here, and the `package.json` `exports` map restricts public access to this
 * file and `./testing` only.
 *
 * As tasks T016–T035 land, this file will re-export:
 *   - createLogger, configureLogging, getRootLogger          (T016, T018)
 *   - ConsoleTransport, NoopTransport                        (T011, T018)
 *   - createRedactor, scrubUrl                               (T032, T035)
 *   - Public types per contracts/public-api.md               (T005, T018)
 *
 * Nothing else may be added without a SemVer-aware contract update; the
 * public surface is locked by tests/contract/public-api.contract.test.ts
 * (T019) and tests/contract/declarations-surface.test.ts (T013).
 */
export {};
