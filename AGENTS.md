# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

# Project rules and documentation

- Read and follow the project constitution: `.specify/memory/constitution.md`.
- Start from `docs/README.md` and use its reading guide to open only the documents relevant to the task. Do not
  load the whole `docs/` tree.
- Treat `docs/` as a descriptive map. Verify important claims against current source before relying on them, and
  report contradictions.
- For parity or API work, consult the Web Admin (`../zappoint`) and Backend (`../zapzone-backend`) source. These
  paths are relative to this repository's root, not the terminal's working directory.
- Treat both repositories as read-only unless a developer explicitly authorizes a change.
- Before relying on either repository, confirm that it exists and is the intended Git repository. If it can't be
  found, ask the developer where it is. Don't guess, and don't silently use another repository.
- Never commit a developer's absolute path as shared configuration. Per-developer layouts are described in
  `docs/DEVELOPMENT_GUIDELINES.md` §1.
- Distinguish existing behaviour from approved requirements. Do not decide unresolved product questions; ask.
- Pick the workflow track (Full SDD, Lightweight SDD, or direct maintenance) from the constitution, based on the
  task's scope and risk.
