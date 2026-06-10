# opalin_website

## Private media vault

This repository now includes a password-gated page at `secret.html`.

### Default password

The current password is:

`opalin-private`

Change it before publishing.

In `secret.html`, replace `SECRET_HASH` with the SHA-256 hash of your own password.

You can generate the hash in your browser console:

```js
const pwd = 'your-new-password';
const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
console.log(hash);
```

### Analytics for secret page visits

The page includes event hooks for:

- `secret_unlock_success`
- `secret_unlock_failed`
- `secret_media_view`
- `secret_media_play`

Supported out of the box:

- Plausible (`window.plausible`)
- GA4 (`window.gtag`)

To enable analytics, uncomment and configure one of the snippets in `secret.html`.

### Add your media

Use `secret-media.json` as the media list source. The secret page reads this file and renders each item.

1. Upload media files into `assets/secret-media/` or host them on Cloudinary / R2.
2. Update `secret-media.json` entries (`type`, `title`, `src`, `poster`, `description`).
3. Deploy. The vault will display your new media automatically.

### Recommended upload stack (best balance of speed + simplicity)

1. Cloudinary for hosting and transcoding videos/images.
2. Keep your metadata in `secret-media.json` for editorial control.
3. Keep only key local backup files in `assets/secret-media/`.

If you want direct browser uploads without committing media to git, Cloudinary unsigned upload presets are the simplest next step.