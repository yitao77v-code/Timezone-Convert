# TimeShift

TimeShift 0.1.2 is a Chrome Manifest V3 extension that converts time expressions in a floating panel to your device's local timezone. Click the toolbar icon on a normal webpage, type or paste a time expression, and choose **Convert**.

Conversion runs entirely on your device using bundled chrono-node and Luxon code. It works offline, requires no account or API key, and sends no input text or conversion results to a server. Render and OpenAI are not used by the extension.

## Using TimeShift

Use an explicit date and source timezone for predictable results. For example, `October 27, 2026 at 3pm UTC` becomes `Oct 27, 2026, 11:00 PM` on a device in `Asia/Shanghai`. ISO timestamps with offsets are supported, for example `2026-10-27T15:00:00Z`.

The panel supports common date and time expressions and ranges. Unsupported or ambiguous expressions display a message asking for clearer input rather than using an AI fallback. Review the source timezone and any ambiguity warnings. Editing the input clears the previous result; choose **Convert** again to calculate the new result.

The toolbar panel cannot open on Chrome's protected internal pages or the Chrome Web Store. Open a normal webpage to use it.

## Build and verification

Install the locked dependencies with `pnpm install --frozen-lockfile`, then run:

```sh
pnpm run build
pnpm test
python3 scripts/package.py
```

The build bundles the parser and its dependencies into `offlineParser.js`. The tests cover timezone conversion, ambiguous inputs, local-only conversion, and extension behavior. The package script creates `dist/timeshift-chrome-store-v0.1.2.zip` using an allowlist of runtime files.

## Chrome Web Store package and privacy

The package includes the extension, locally bundled parser, icons, and embedded privacy page. Backend source, development dependencies, tests, Git metadata, and environment files are excluded. The manifest requests only `activeTab`, `scripting`, and `storage`, with no API host permissions. The extension remembers the panel position but does not persist input or conversion history.

The embedded policy is `privacy.html`. The public policy is [PRIVACY.md](https://github.com/yitao77v-code/Timezone-Convert/blob/main/PRIVACY.md).

## Legacy backend source

The repository retains `openai-proxy.mjs` and backend tests from the earlier server-based version for reference. They are not used or distributed in the 0.1.2 extension. Deploying a backend or configuring server credentials is not required to build or use the extension.

For support, use [GitHub issues](https://github.com/yitao77v-code/Timezone-Convert/issues) or email yitao77v@gmail.com. Do not include private text or credentials in public issues.
