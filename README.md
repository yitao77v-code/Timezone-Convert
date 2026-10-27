# TimeShift

A Chrome Manifest V3 extension that converts time expressions in a floating panel. Click the toolbar icon, enter text, and choose Convert. Text is sent only after that click; the interface describes the data and providers before sending.

## Backend

The deployed service is https://timeshift-api.onrender.com. Set OPENAI_API_KEY in the server environment, install the locked dependencies with pnpm install --frozen-lockfile, then run node openai-proxy.mjs. The service listens on PORT (default 8787).

Common expressions are parsed on the server with chrono-node and converted with Luxon. Ambiguous or unsupported expressions use OpenAI's Responses API. The default is gpt-5.6-luna with reasoning disabled and response storage disabled. Explicitly configured retired gpt-4.1-nano aliases are migrated to gpt-5.6-luna. Other OPENAI_MODEL values are preserved. See https://developers.openai.com/api/docs/deprecations for the retirement and recommended replacement.

Never put API keys in the extension package. The backend does not persist request text in application storage; service-provider retention is described in PRIVACY.md.

## Verification

Run node --test. Coverage includes timezone offsets, daylight saving boundaries, ambiguous inputs, explicit-send privacy behavior, cancellation, stale responses, and timeouts.

## Chrome Web Store package

Run python3 scripts/package.py. Only runtime extension files and the embedded privacy page are packaged. Server code, dependencies, tests, git metadata, and environment files are excluded.

The embedded privacy page is privacy.html. The public policy is https://github.com/yitao77v-code/Timezone-Convert/blob/main/PRIVACY.md.
