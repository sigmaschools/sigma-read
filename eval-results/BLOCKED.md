# Voice eval blocked, 7 Nov 2026

The check run (`--configs=today --kids=theo --articles=bee-dance`) failed on the first API call:

```
today theo/bee-dance r0: error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011CgpLvndrDxv3yBP7osmNQ"}
```

`EVAL_ANTHROPIC_API_KEY` is set in the session, but its value is only 31 characters long and does not start with the usual Anthropic key prefix. A real Anthropic API key is over 100 characters long, so the value in the cloud environment is not a whole key (it looks truncated, or a placeholder was pasted).

Fix: paste the full key from https://console.anthropic.com/settings/keys into the `EVAL_ANTHROPIC_API_KEY` variable of the Default cloud environment, then start the run again in a new session. Baseline and candidate runs were not attempted.

The folder `2026-11-07T22-19-07-731Z-voice/` holds the failed check run.

## Second attempt, ~22:24Z

A second scheduled run hit the same thing: `EVAL_ANTHROPIC_API_KEY` is still 31 characters with no key prefix, and the check run failed the same way:

```
today theo/bee-dance r0: error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011CgpML2DK14BBNEzLuapeV"}
```

The folder `2026-11-07T22-24-22-925Z-voice/` holds that check run. Baseline and candidate runs were not attempted. The environment value has not been fixed yet, so running the routine again will fail until the full key is pasted.
