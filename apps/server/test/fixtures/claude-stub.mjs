#!/usr/bin/env node
// Fake `claude` CLI for runner tests: consumes stdin, then emits a canned
// stream-json transcript. STUB_EXIT forces a nonzero exit after partial output.

process.stdin.resume()
process.stdin.on('end', () => {
  const emit = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`)
  emit({ type: 'system', subtype: 'init', session_id: 'sess-stub', model: 'stub' })
  emit({
    type: 'assistant',
    session_id: 'sess-stub',
    message: { content: [{ type: 'text', text: 'Triaging the issue.' }] },
  })
  if (process.env.STUB_EXIT) {
    process.stderr.write('stub blew up\n')
    process.exit(Number(process.env.STUB_EXIT))
  }
  emit({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: 'sess-stub',
    total_cost_usd: 0.12,
    result: `Done.\nISSUEOPS_RESULT: ${JSON.stringify({
      status: 'done',
      pr_url: 'https://github.com/acme/demo/pull/9',
      summary: 'fixed the crash',
    })}`,
  })
  process.exit(0)
})
