# TimeShift

This unpacked Chrome extension converts time expressions in a floating panel.

## OpenAI recognition

The extension does not embed `OPENAI_API_KEY` in browser-readable files. Start the local proxy before using AI recognition:

```bash
/Users/taoyi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node openai-proxy.mjs
```

The proxy reads `OPENAI_API_KEY` from `.env.local` and listens on `http://127.0.0.1:8787`. Common timezone expressions are parsed locally with `chrono-node` and converted with `Luxon`; OpenAI is used as the fallback for ambiguous or complex text. The fallback model defaults to `gpt-4.1-nano` for lower latency. Override it with `OPENAI_MODEL` if needed.

If the panel shows a quota or billing error, update billing/quota for the selected OpenAI Platform project and retry.
