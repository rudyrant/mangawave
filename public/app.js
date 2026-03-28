const historyKey = "mangawave-reading-history";
const bookmarkKey = "mangawave-bookmarks";

function currentLang() {
  return document.documentElement.lang === 'en' ? 'en' : 'ka';
}

function clientCopy(key, vars = {}) {
  const dictionary = {
    ka: {
      resume: 'გააგრძელე',
      latestAvailable: 'უახლესი ხელმისაწვდომი',
      bookmarkOnDevice: 'ამ მოწყობილობაზე შენახვა',
      bookmarkedOnDevice: 'ამ მოწყობილობაზე შენახულია',
      uploadSummary: '{{count}} გვერდი აიტვირთება ამ რიგით.',
      seriesStartHint: 'დაიწყე უახლესი ხელმისაწვდომი თავიდან.',
      seriesResumeHint: '{{chapter}}-დან გაგრძელება ამ მოწყობილობაზე.',
    },
    en: {
      resume: 'Resume',
      latestAvailable: 'Latest available',
      bookmarkOnDevice: 'Bookmark on this device',
      bookmarkedOnDevice: 'Bookmarked on this device',
      uploadSummary: '{{count}} page{{plural}} will upload in this order.',
      seriesStartHint: 'Start from the newest available chapter.',
      seriesResumeHint: 'Resume from {{chapter}} on this device.',
    },
  };
  const lang = currentLang();
  const template = (dictionary[lang] && dictionary[lang][key]) || dictionary.en[key] || key;
  const values = { ...vars };
  if (values.plural == null) values.plural = Number(values.count) === 1 ? '' : 's';
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, token) => String(values[token] ?? ''));
}

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    localStorage.removeItem(key);
    return [];
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

(function libraryFilters() {
  const search = document.querySelector("#library-search");
  const genre = document.querySelector("#library-genre");
  const cards = [...document.querySelectorAll(".searchable-series")];
  const empty = document.querySelector("#empty-library");
  if (!search || !genre || !cards.length) return;

  const update = () => {
    const query = search.value.trim().toLowerCase();
    const wantedGenre = genre.value;
    let visible = 0;
    cards.forEach((card) => {
      const haystack = card.dataset.search || "";
      const genres = (card.dataset.genres || "").split("|").filter(Boolean);
      const match = haystack.includes(query) && (wantedGenre === "All" || genres.includes(wantedGenre));
      card.classList.toggle("hidden", !match);
      if (match) visible += 1;
    });
    empty?.classList.toggle("hidden", visible !== 0);
  };

  search.addEventListener("input", update);
  genre.addEventListener("change", update);
})();

(function guestBookmarkButtons() {
  const buttons = [...document.querySelectorAll("[data-bookmark-mode='guest']")];
  if (!buttons.length) return;
  const bookmarks = readStore(bookmarkKey);

  const refresh = () => {
    buttons.forEach((button) => {
      const exists = bookmarks.some((entry) => entry.seriesSlug === button.dataset.bookmarkSeries);
      button.textContent = exists ? clientCopy('bookmarkedOnDevice') : clientCopy('bookmarkOnDevice');
    });
  };

  refresh();
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const seriesSlug = button.dataset.bookmarkSeries;
      const existingIndex = bookmarks.findIndex((entry) => entry.seriesSlug === seriesSlug);
      if (existingIndex >= 0) {
        bookmarks.splice(existingIndex, 1);
      } else {
        bookmarks.unshift({
          seriesSlug,
          chapterSlug: button.dataset.bookmarkChapter,
          chapterLabel: button.dataset.bookmarkLabel,
          updatedAt: new Date().toISOString(),
        });
      }
      writeStore(bookmarkKey, bookmarks);
      refresh();
    });
  });
})();

function getLatestHistoryBySeries() {
  const history = readStore(historyKey);
  return new Map(history.map((entry) => [entry.seriesSlug, entry]));
}

(function renderHistory() {
  const panel = document.querySelector("#history-panel");
  const library = window.__MW_LIBRARY__;
  if (!panel || !Array.isArray(library)) return;
  const history = readStore(historyKey);
  if (!history.length) return;
  panel.innerHTML = "";
  history.forEach((entry) => {
    const meta = library.find((item) => item.seriesSlug === entry.seriesSlug);
    if (!meta) return;
    const anchor = document.createElement("a");
    anchor.href = `/read/${entry.seriesSlug}/${entry.chapterSlug}`;
    anchor.className = "history-item";
    anchor.innerHTML = `
      <img src="${meta.coverImage}" alt="${meta.title}" />
      <div>
        <strong>${meta.title}</strong>
        <div class="muted">${clientCopy('resume')} ${entry.chapterLabel}</div>
        <div class="muted">${clientCopy('latestAvailable')}: ${meta.latestChapterLabel}</div>
      </div>
    `;
    panel.appendChild(anchor);
  });
})();

(function hydrateResumeCtasFromDeviceHistory() {
  const historyBySeries = getLatestHistoryBySeries();
  if (!historyBySeries.size) return;

  const seriesButton = document.querySelector('#series-continue-reading');
  const seriesHint = document.querySelector('#series-resume-hint');
  const seriesSlug = seriesHint?.dataset.seriesResumeSeries;
  const seriesEntry = seriesSlug ? historyBySeries.get(seriesSlug) : null;
  if (seriesButton && seriesHint && seriesEntry) {
    seriesButton.href = `/read/${seriesEntry.seriesSlug}/${seriesEntry.chapterSlug}`;
    seriesButton.textContent = `${clientCopy('resume')} ${seriesEntry.chapterLabel}`;
    seriesHint.textContent = clientCopy('seriesResumeHint', { chapter: seriesEntry.chapterLabel });
  }

  document.querySelectorAll('.searchable-series[data-series-slug]').forEach((card) => {
    const entry = historyBySeries.get(card.dataset.seriesSlug);
    const label = card.querySelector('.series-card-resume-label');
    if (!entry || !label) return;
    label.textContent = `${clientCopy('resume')} ${entry.chapterLabel}`;
    if (entry.chapterSlug) card.href = `/read/${entry.seriesSlug}/${entry.chapterSlug}`;
  });
})();

(function adminChapterUploadPreview() {
  const input = document.querySelector('input[name="pages"]');
  const preview = document.querySelector('#chapter-pages-preview');
  const summary = document.querySelector('#chapter-pages-summary');
  const list = document.querySelector('#chapter-pages-list');
  if (!input || !preview || !summary || !list) return;

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  input.addEventListener('change', () => {
    const files = [...(input.files || [])].sort((a, b) => collator.compare(a.name, b.name));
    if (!files.length) {
      preview.classList.add('hidden');
      summary.textContent = '';
      list.innerHTML = '';
      return;
    }

    preview.classList.remove('hidden');
    summary.textContent = clientCopy('uploadSummary', { count: files.length });
    list.innerHTML = files.map((file) => `<li>${file.name}</li>`).join('');
  });
})();

(function trackReader() {
  const reader = window.__MW_READER__;
  if (!reader) return;

  const pages = document.querySelector('#reader-pages');
  const progressBar = document.querySelector('#reader-progress-bar');
  const progressLabel = document.querySelector('#reader-progress-label');
  const updateProgress = () => {
    if (!pages || !progressBar || !progressLabel) return;
    const rect = pages.getBoundingClientRect();
    const viewport = window.innerHeight || document.documentElement.clientHeight || 1;
    const total = Math.max(rect.height - viewport, 1);
    const raw = (viewport - rect.top) / total;
    const percent = Math.max(0, Math.min(100, Math.round(raw * 100)));
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = `${percent}%`;
  };

  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  const history = readStore(historyKey).filter((entry) => entry.seriesSlug !== reader.seriesSlug);
  history.unshift({
    seriesSlug: reader.seriesSlug,
    chapterSlug: reader.chapterSlug,
    chapterLabel: reader.chapterLabel,
    updatedAt: new Date().toISOString(),
  });
  writeStore(historyKey, history.slice(0, 12));

  if (!reader.loggedIn) return;
  fetch("/api/progress", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": reader.csrfToken,
    },
    body: JSON.stringify({
      seriesSlug: reader.seriesSlug,
      chapterSlug: reader.chapterSlug,
      chapterLabel: reader.chapterLabel,
    }),
  }).catch(() => {});
})();
