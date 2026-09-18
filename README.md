# opalin.ai

Static site. Vite, no framework. three.js is the only dependency.

## Start

```
bun install
bun run dev        # localhost:5173
bun run build
bun run check:fk   # verifies the hero replay against the recording, keep it green
```

`bunx prettier --write .` formats everything, with the same defaults Zed uses.

## Endpoints

A route is a directory with an `index.html`. Discovery walks nested directories, so a new
route is just a new folder. Shared markup lives in `src/site/*.html`, inlined at build time
by an `<!-- @name -->` comment.

| route                                  | indexed | notes                            |
| -------------------------------------- | ------- | -------------------------------- |
| `/`                                    | yes     | the whole pitch, one page        |
| `/careers/`                            | yes     | index of open roles              |
| `/careers/teleoperator/`               | yes     | Redwood City, CA and Quebec City |
| `/careers/robotics-software-engineer/` | yes     | Paris                            |
| `/careers/applied-ai-engineer/`        | yes     | Paris                            |
| `/demos-caf9786e1b15275d/`             | no      | password-gated mosaic, `noindex` |
| `/blog/`                               | no      | scaffold only, unlinked          |

Served from `public/`: `/robots.txt`, `/sitemap.xml`, `/favicon.svg`. `/og.png` is
referenced by the social meta on every page but has not been captured yet.

The demos route is deliberately not in `robots.txt` - a `Disallow` line would publish the
URL it is meant to hide.

Adding a role: new folder under `careers/`, a card on `/careers/`, a line in
`public/sitemap.xml`.

## Adding videos

```
cp clip.mp4 public/demos/                       # 1. the file
$EDITOR content/demos.json                      # 2. src, caption, optional span
DEMOS_PASSWORD=goodrobot bun run seal:demos     # 3. re-encrypt
```

`content/demos.json` is plaintext and never ships. Sealing encrypts it into
`src/demos/sealed.json` (PBKDF2 -> AES-GCM, the password is the key), and only that blob is
bundled - so clip URLs and captions are absent from the build, not just hidden behind a
check. Re-seal after every edit. A new `DEMOS_PASSWORD` rotates the password.

The clips themselves are plain files. Anyone who learns a clip URL can fetch it without the
password.
