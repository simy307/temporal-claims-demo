// Custom control bar for the demo videos.
//
// Why not just `<video controls>`? Two problems showed up when presenting live:
//   1. reveal.js's global keyboard handler only excludes <input>/<textarea> from hijacking
//      arrow keys — it does not exclude <video>, so a focused native scrubber never receives
//      seek shortcuts; the *slide* changes instead.
//   2. Native control hit-testing (drag/click on the browser's built-in scrubber) was unreliable
//      in this deck's layout — clicks on the native progress bar did not register at all.
// A small custom bar gives full control over both problems and bigger, more reliable click/drag
// targets for a projector demo. Videos have no audio track, so there is no mute/volume control.
(function () {
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  }

  function enhance(video) {
    const frame = video.closest('.demo-video-frame');
    if (!frame || frame.querySelector('.demo-video-controls')) return;

    video.removeAttribute('controls');
    video.setAttribute('tabindex', '0');

    const bar = document.createElement('div');
    bar.className = 'demo-video-controls';
    bar.innerHTML = `
      <button class="dvc-playpause" type="button" aria-label="Play">&#9654;</button>
      <span class="dvc-time">0:00</span>
      <div class="dvc-seek" role="slider" tabindex="0" aria-label="Seek"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="dvc-seek-fill"></div>
        <div class="dvc-seek-handle"></div>
      </div>
      <span class="dvc-duration">0:00</span>
      <button class="dvc-fullscreen" type="button" aria-label="Fullscreen">&#9974;</button>
    `;
    frame.appendChild(bar);

    const playBtn = bar.querySelector('.dvc-playpause');
    const timeEl = bar.querySelector('.dvc-time');
    const durEl = bar.querySelector('.dvc-duration');
    const seek = bar.querySelector('.dvc-seek');
    const seekFill = bar.querySelector('.dvc-seek-fill');
    const seekHandle = bar.querySelector('.dvc-seek-handle');
    const fsBtn = bar.querySelector('.dvc-fullscreen');

    function setPlayIcon() {
      playBtn.innerHTML = video.paused ? '&#9654;' : '&#10074;&#10074;';
      playBtn.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
    }

    function updateProgress() {
      if (!isFinite(video.duration) || video.duration === 0) return;
      const pct = (video.currentTime / video.duration) * 100;
      seekFill.style.width = pct + '%';
      seekHandle.style.left = pct + '%';
      seek.setAttribute('aria-valuenow', String(Math.round(pct)));
      timeEl.textContent = formatTime(video.currentTime);
    }

    playBtn.addEventListener('click', () => {
      if (video.paused) video.play();
      else video.pause();
    });
    // Clicking the video body itself also toggles play/pause, matching native <video> behavior.
    video.addEventListener('click', () => {
      if (video.paused) video.play();
      else video.pause();
    });
    video.addEventListener('play', setPlayIcon);
    video.addEventListener('pause', setPlayIcon);
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('loadedmetadata', () => {
      durEl.textContent = formatTime(video.duration);
      updateProgress();
    });

    function seekToClientX(clientX) {
      if (!isFinite(video.duration) || video.duration <= 0) return;
      const rect = seek.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      video.currentTime = frac * video.duration;
    }

    let dragging = false;
    seek.addEventListener('pointerdown', (e) => {
      dragging = true;
      seek.setPointerCapture(e.pointerId);
      seekToClientX(e.clientX);
    });
    seek.addEventListener('pointermove', (e) => {
      if (dragging) seekToClientX(e.clientX);
    });
    const stopDrag = (e) => {
      dragging = false;
      if (seek.hasPointerCapture(e.pointerId)) seek.releasePointerCapture(e.pointerId);
    };
    seek.addEventListener('pointerup', stopDrag);
    seek.addEventListener('pointercancel', stopDrag);

    seek.addEventListener('keydown', (e) => {
      const step = 5;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        video.currentTime = Math.min(video.duration, video.currentTime + step);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        video.currentTime = Math.max(0, video.currentTime - step);
        e.preventDefault();
      }
    });

    fsBtn.addEventListener('click', () => {
      if (video.requestFullscreen) video.requestFullscreen();
      else if (frame.requestFullscreen) frame.requestFullscreen();
    });

    // Never let keyboard input aimed at this control bar or the video escape to reveal.js's
    // document-level handler (which would otherwise change slides on arrow keys / space).
    [video, bar].forEach((el) => {
      el.addEventListener('keydown', (e) => e.stopPropagation());
    });

    setPlayIcon();
  }

  function enhanceAll() {
    document.querySelectorAll('.demo-video-frame video').forEach(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAll);
  } else {
    enhanceAll();
  }
})();
