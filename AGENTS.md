# Agent instructions — boolala.boo

Before changing the procedural generator (`src/core/**`), always:

1. Read `feedback/likes/*.json` + glance at matching `.png` — what the user likes.
2. Read `feedback/dislikes/*.json` + matching `.png` — what to avoid / fix.
3. Infer patterns (mouths too flat, limbs too thin, too symmetric, etc.) and apply targeted improvements.
4. After addressing a specific dislike, set `"processed": true` in that dislike's JSON so it is marked as handled (UI shows «опрацьований»).

Do not delete dislike entries — keep history for future sessions.

Likes/dislikes are written automatically when the user taps ♥ / 👎 in the detail view (dev server middleware `POST /__feedback`).

Face features live in `src/core/face/**` (2D particle pipeline, not mesh).
