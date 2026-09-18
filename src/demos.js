import sealed from "./demos/sealed.json";

const STORE = "opalin.demos";

const form = document.querySelector("[data-gate]");
const input = form.querySelector('input[type="password"]');
const error = form.querySelector("[data-error]");
const mosaic = document.querySelector("[data-mosaic]");

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function unseal(password) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bytes(sealed.salt),
      iterations: sealed.iterations,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(sealed.iv) },
    key,
    bytes(sealed.data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function render({ clips }) {
  form.hidden = true;
  mosaic.hidden = false;
  mosaic.replaceChildren(
    ...clips.map((clip) => {
      const figure = document.createElement("figure");
      if (clip.span) figure.dataset.span = clip.span;

      const video = document.createElement("video");
      video.src = clip.src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = "metadata";

      const caption = document.createElement("figcaption");
      caption.textContent = clip.caption;

      figure.append(video, caption);
      return figure;
    }),
  );
}

const cached = sessionStorage.getItem(STORE);
if (cached) render(JSON.parse(cached));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  try {
    const manifest = await unseal(input.value);
    sessionStorage.setItem(STORE, JSON.stringify(manifest));
    render(manifest);
  } catch {
    error.textContent = "Wrong password.";
    input.select();
  }
});
