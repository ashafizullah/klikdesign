# Contributing to KlikDesign

Thanks for helping out! KlikDesign is maintained by one person, so a little coordination up front saves everyone time.

## Before you start

- **Bug fixes and small improvements**: open a pull request directly.
- **New features or larger changes**: open an issue first so we can agree on the approach before you write the code.
- Check the open issues and pull requests to avoid duplicate work.

## Submitting a change

1. Fork the repository and clone your fork.
2. Create a branch from `main`, e.g. `git checkout -b fix/canvas-snapping`.
3. Make your change and run the checks below.
4. Push the branch and open a pull request against `main`. Describe what changed and why, and add a screenshot or short clip for UI changes.

CI runs on every pull request. For a first-time contributor, GitHub waits for the maintainer to approve the run, so don't worry if it doesn't start right away.

## Development setup

Requires [Bun](https://bun.sh/) and stable Rust. On Linux, also install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

```sh
bun install
bun run tauri dev      # run the app
bun run dev            # UI only, in the browser with mocked IPC (src/dev/browserMock.ts)
bun run tauri build    # bundle
```

## Checks

These are the same checks CI runs. Please make sure they pass before opening a pull request:

```sh
bun run typecheck
bun run test
bun run build          # the Rust build embeds the frontend, so build it first

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## Guidelines

- **Keep pull requests focused**: one fix or feature per PR. Unrelated refactors are easier to review on their own.
- **UI text**: the app is available in English and Bahasa Indonesia. Add every new string to both `src/i18n/en.ts` and `src/i18n/id.ts`; the type check fails if a key is missing. If you can't write Indonesian, use the English text in `id.ts` and mention it in the PR.
- **Dependencies**: ask in an issue before adding a new dependency.
- **Commit messages**: a short summary in the imperative mood, e.g. `Fix text snapping on rotated layers`.
- **Versions and changelog**: leave `CHANGELOG.md` and version numbers alone; they are updated at release time. Describe user-facing changes in the PR instead.
- **Secrets**: never commit API keys or paste them into issues, logs or screenshots.

## Reporting bugs

Open an issue with:

- the KlikDesign version and your OS
- steps to reproduce
- what you expected and what happened
- relevant logs or screenshots, with API keys removed

## Security issues

Please don't report security problems in a public issue. Use **Report a vulnerability** on the repository's Security tab instead.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
