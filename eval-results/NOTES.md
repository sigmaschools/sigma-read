# Notes, voice eval run 7 Nov 2026 (~22:28Z)

- The key worked this time (earlier runs were blocked by a truncated key; that BLOCKED.md is removed).
- `2026-11-07T22-28-22-736Z-voice` is the one-conversation smoke test (today, theo/bee-dance), not a result.
- `2026-11-07T22-28-51-310Z-voice` is the baseline: today vs before, 2 runs, judge claude-fable-5-1 (default).
- `2026-11-07T22-35-05-039Z-voice` is the candidates run: today, sigma-sonnet-low, sigma-opus-low, sigma-fable-low, 2 runs, judge claude-opus-5-5.
- The script warned that the judge (claude-opus-5-5) is also a candidate (sigma-opus-low), so that comparison is not fully independent.
- No config was dropped, no API errors, no code fixes needed.
