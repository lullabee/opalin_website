// Background videos: play only while on screen, and loop past the near-black
// opening frames so the band never flashes dark.
const START = 0.6;

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

for (const video of document.querySelectorAll("[data-bg-video]")) {
  if (reduced) continue;

  const play = () => video.play().catch(() => {});

  video.addEventListener("loadedmetadata", () => {
    if (video.currentTime < START) video.currentTime = START;
  });
  video.addEventListener("ended", () => {
    video.currentTime = START;
    play();
  });

  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) play();
    else video.pause();
  }).observe(video);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) play();
  });
}
