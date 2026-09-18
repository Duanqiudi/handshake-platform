# Reference Personal Agent

This is the local-only first slice of the future personal Agent. It owns a synthetic local profile,
applies a disclosure policy, evaluates a candidate from disclosed capsules only, and can construct a
schema-valid HSP `PROPOSAL`. It is deliberately not a Tauri app, production signer, or real-model
integration yet.

The included evaluator is deterministic (`rules-0.1`), so experiment results are repeatable. A real
model will later implement the same `CompatibilityEvaluator` interface; it must only receive the
`DisclosedCapsule`, never `privateMemory`.

Run the synthetic experiment:

```bash
pnpm --filter @handshake/reference-agent build
pnpm --filter @handshake/reference-agent start examples/professional-collaboration.json
```

The CLI prints its permitted disclosed capsule and assessment. It does not write data, contact a
model provider, call the Gateway, or expose private notes/contact details.

See [phase-3-experiment.md](../../docs/architecture/phase-3-experiment.md) for the experiment
hypothesis, metrics, and explicit non-goals.
