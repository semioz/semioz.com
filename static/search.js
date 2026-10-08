(() => {
  const dialog = document.querySelector("[data-search-dialog]");
  const input = dialog.querySelector("[data-search-input]");
  const results = dialog.querySelector("[data-search-results]");
  const status = dialog.querySelector("[data-search-status]");
  let articles;
  let loading;

  const render = () => {
    const terms = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = articles.filter((article) => terms.every((term) => article.searchable.includes(term)));
    results.replaceChildren();
    for (const article of matches) {
      const link = document.createElement("a");
      link.href = article.url;
      const title = document.createElement("strong");
      title.textContent = article.title;
      link.append(title);
      if (article.description) {
        const description = document.createElement("span");
        description.textContent = article.description;
        link.append(description);
      }
      results.append(link);
    }
    status.textContent = matches.length ? `${matches.length} article${matches.length === 1 ? "" : "s"}` : "No articles found.";
  };

  const open = async () => {
    if (dialog.open) return;
    dialog.showModal();
    input.focus();
    if (articles) return render();
    status.textContent = "Loading articles…";
    try {
      loading ??= fetch("/search-index.json").then((response) => {
        if (!response.ok) throw new Error(`Search index: ${response.status}`);
        return response.json();
      });
      articles = (await loading).map((article) => ({
        ...article,
        searchable: `${article.title} ${article.description} ${article.text}`.toLowerCase(),
      }));
      render();
    } catch (error) {
      loading = null;
      status.textContent = "Search unavailable. Close and reopen to retry.";
      console.error(error);
    }
  };

  document.querySelector("[data-search-toggle]").addEventListener("click", open);
  dialog.querySelector("[data-search-close]").addEventListener("click", () => dialog.close());
  input.addEventListener("input", () => { if (articles) render(); });
  document.addEventListener("keydown", (event) => {
    if (!event.isComposing && !event.repeat && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (dialog.open) dialog.close();
      else open();
    }
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
      return;
    }
    const links = [...results.querySelectorAll("a")];
    if (!links.length) return;
    if (event.key === "Enter" && event.target === input) {
      event.preventDefault();
      links[0].click();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const current = links.indexOf(document.activeElement);
      if (current === -1 && event.target !== input) return;
      event.preventDefault();
      const next = current === -1 ? (event.key === "ArrowDown" ? 0 : links.length - 1) :
        (current + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
      links[next].focus();
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
})();
