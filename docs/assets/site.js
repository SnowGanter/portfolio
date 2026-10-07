(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const t = window.PortfolioI18n?.t || ((text) => text);

  function updateLanguageLinks() {
    for (const link of document.querySelectorAll('[data-language]')) {
      const destination = new URL(link.href, location.href);
      destination.search = location.search;
      destination.hash = location.hash;
      link.href = destination.pathname + destination.search + destination.hash;
    }
  }

  function setupNavigation() {
    updateLanguageLinks();
    window.addEventListener('popstate', updateLanguageLinks);
    window.addEventListener('hashchange', updateLanguageLinks);
    const header = document.querySelector('.site-header');
    if (header) {
      const toggle = header.querySelector('[data-nav-toggle]');
      const navigation = header.querySelector('.main-nav');
      if (toggle && navigation) {
        const compact = window.matchMedia('(max-width: 1000px)');
        const label = toggle.querySelector('[data-nav-label]');
        let open = false;
        const renderMenu = () => {
          navigation.hidden = compact.matches && !open;
          toggle.hidden = !compact.matches;
          toggle.setAttribute('aria-expanded', String(compact.matches && open));
          toggle.setAttribute('aria-label', t(open ? 'Закрыть меню' : 'Открыть меню'));
          // Keep the button width stable when expanded (especially in UK/RU).
          // The icon and accessible name communicate the close action.
          if (label) label.textContent = t('Меню');
          header.classList.toggle('is-menu-open', compact.matches && open);
        };
        toggle.addEventListener('click', () => { open = !open; renderMenu(); });
        header.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape' || !compact.matches || !open) return;
          event.preventDefault();
          open = false;
          renderMenu();
          toggle.focus({ preventScroll: true });
        });
        // Keep the complete static navigation when JavaScript is unavailable.
        // Closing at a breakpoint must not leave focus in a hidden menu.
        compact.addEventListener('change', () => {
          const active = document.activeElement;
          const restoreFocus = compact.matches && navigation.contains(active);
          const restoreDesktopFocus = !compact.matches && active === toggle;
          open = false;
          renderMenu();
          if (restoreFocus) toggle.focus({ preventScroll: true });
          if (restoreDesktopFocus) (navigation.querySelector('[aria-current="page"]') || navigation.querySelector('a'))?.focus({ preventScroll: true });
        });
        header.classList.add('nav-ready');
        renderMenu();
      }
      const measure = () => document.documentElement.style.setProperty('--header-height', Math.ceil(header.getBoundingClientRect().height) + 'px');
      measure();
      if ('ResizeObserver' in window) new ResizeObserver(measure).observe(header);
      else window.addEventListener('resize', measure);
    }
    for (const link of document.querySelectorAll('[data-to-top]')) link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.scrollTo({ top: 0, left: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      document.querySelector('.brand')?.focus({ preventScroll: true });
      if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
      updateLanguageLinks();
    });
  }

  function setupFilters() {
    // Etsy's shop controller combines categories with search, sorting and saved items.
    if (document.querySelector('[data-etsy-catalog]')) return;
    const buttons = Array.from(document.querySelectorAll("[data-filter]"));
    const cards = Array.from(document.querySelectorAll(".project-grid [data-category]"));
    if (!buttons.length) return;
    const empty = document.querySelector(".filter-empty");
    const total = document.querySelector("[data-visible-count]");
    const noun = document.querySelector("[data-count-noun]");

    const render = (category, updateHistory) => {
      const valid = buttons.some((button) => button.dataset.filter === category) ? category : "all";
      for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.filter === valid));
      for (const card of cards) {
        card.getAnimations().forEach((animation) => animation.cancel());
        const visible = valid === "all" || card.dataset.category === valid;
        card.hidden = !visible;
        if (visible && updateHistory && !reducedMotion.matches) {
          card.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
        }
        const link = new URL(card.href, location.href);
        link.searchParams.set("from", "etsy");
        link.searchParams.set("category", valid);
        card.href = link.pathname + link.search + link.hash;
      }
      const count = cards.filter((card) => !card.hidden).length;
      if (empty) empty.hidden = !cards.length || count > 0;
      if (total) total.textContent = count;
      if (noun) noun.textContent = document.documentElement.lang === 'en' ? (count === 1 ? 'project' : 'projects') :
        t(count % 100 >= 11 && count % 100 <= 14 ? "проектов" :
          count % 10 === 1 ? "проект" : count % 10 >= 2 && count % 10 <= 4 ? "проекта" : "проектов");
      if (updateHistory) {
        const next = new URL(location.href);
        if (valid === "all") next.searchParams.delete("category");
        else next.searchParams.set("category", valid);
        if (next.href !== location.href) history.pushState({ category: valid }, "", next);
      }
      updateLanguageLinks();
    };

    render(new URL(location.href).searchParams.get("category") || "all", false);
    for (const button of buttons) button.addEventListener("click", () => render(button.dataset.filter, true));
    for (const reset of document.querySelectorAll("[data-filter-reset]")) reset.addEventListener("click", () => render("all", true));
    window.addEventListener("popstate", () => render(new URL(location.href).searchParams.get("category") || "all", false));
  }

  function setupCaseReturn() {
    const current = new URL(location.href);
    let section = current.searchParams.get("from");
    let category = current.searchParams.get("category");
    if (!section && document.referrer) {
      try {
        const referrer = new URL(document.referrer);
        if (referrer.origin === location.origin) {
          section = referrer.pathname.replace(/\/index\.html$/, '/').split("/").filter(Boolean).pop()?.replace(/\.html$/, "");
          category = referrer.searchParams.get("category");
        }
      } catch {}
    }
    if (!["etsy", "amazon", "photoshop", "comfyui", "advertising"].includes(section)) return;
    const sectionLink = Array.from(document.querySelectorAll('.site-header .main-nav a')).find((link) => link.pathname.endsWith('/' + section + '/'));
    if (!sectionLink) return;
    const destination = new URL(sectionLink.pathname, location.origin);
    if (section === "etsy" && ["all", "wallpaper", "painting"].includes(category)) destination.searchParams.set("category", category);
    for (const link of document.querySelectorAll("[data-case-back]")) link.href = destination.pathname + destination.search + destination.hash;
    for (const link of document.querySelectorAll("[data-case-next]")) {
      const next = new URL(link.href, location.href);
      if (section === "etsy" && ["all", "wallpaper", "painting"].includes(category)) next.searchParams.set("category", category);
      link.href = next.pathname + next.search;
    }
  }

  function setupVideos() {
    const videos = Array.from(document.querySelectorAll("video[loop]"));
    if (!videos.length) return;
    const states = new Map();

    const updateButton = (video, paused) => {
      const button = video.closest("[data-process-video]")?.querySelector("[data-video-toggle]");
      if (!button) return;
      button.textContent = paused ? "▶" : "Ⅱ";
      button.setAttribute("aria-label", t(paused ? "Воспроизвести видео" : "Приостановить видео"));
      button.setAttribute("aria-pressed", String(paused));
    };

    const pause = (video) => {
      video.pause();
      updateButton(video, true);
    };

    const tryPlay = async (video, fromUser = false) => {
      const state = states.get(video);
      if (!state || (!fromUser && (!state.visible || reducedMotion.matches)) || document.hidden || state.userPaused) {
        pause(video);
        return;
      }
      try {
        video.muted = true;
        if (fromUser && video.error) video.load();
        await video.play();
        if (document.hidden || state.userPaused || (!fromUser && (!state.visible || reducedMotion.matches))) {
          pause(video);
          return;
        }
        video.controls = false;
        updateButton(video, false);
        const frame = video.closest("[data-process-video]");
        frame?.classList.remove("video-blocked", "video-error");
        const caption = frame?.querySelector(".video-caption");
        if (caption && state.caption) caption.textContent = state.caption;
      } catch {
        video.controls = true;
        video.closest("[data-process-video]")?.classList.add("video-blocked");
        updateButton(video, true);
      }
    };

    for (const video of videos) {
      const frame = video.closest("[data-process-video]");
      const state = { visible: false, userPaused: false, caption: frame?.querySelector(".video-caption")?.textContent };
      frame?.classList.add("is-enhanced");
      states.set(video, state);
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute("playsinline", "");
      video.controls = true;
      pause(video);
      video.addEventListener("playing", () => updateButton(video, false));
      video.addEventListener("pause", () => updateButton(video, true));
      video.addEventListener("error", () => {
        video.controls = true;
        video.closest("[data-process-video]")?.classList.add("video-error");
        const caption = video.closest("[data-process-video]")?.querySelector(".video-caption");
        if (caption) caption.textContent = t("Видео недоступно. Описание и материалы проекта сохранены.");
      });
      video.closest("[data-process-video]")?.querySelector("[data-video-toggle]")?.addEventListener("click", () => {
        if (!video.paused) {
          state.userPaused = true;
          pause(video);
        } else {
          state.userPaused = false;
          tryPlay(video, true);
        }
      });
    }

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const video = entry.target.querySelector("video[loop]");
          if (!video) continue;
          const state = states.get(video);
          state.visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
          if (state.visible) tryPlay(video);
          else pause(video);
        }
      }, { threshold: [0, 0.2, 0.6] });
      for (const video of videos) observer.observe(video.closest("[data-process-video]") || video);
    } else {
      for (const video of videos) {
        video.controls = true;
        states.get(video).visible = false;
      }
    }

    document.addEventListener("visibilitychange", () => {
      for (const video of videos) {
        const state = states.get(video);
        if (document.hidden) pause(video);
        else if (state.visible && !state.userPaused) tryPlay(video);
      }
    });
    reducedMotion.addEventListener("change", () => {
      for (const video of videos) {
        const state = states.get(video);
        if (reducedMotion.matches) pause(video);
        else if (state.visible && !state.userPaused && !document.hidden) tryPlay(video);
      }
    });
  }

  function setupViewer() {
    const dialog = document.querySelector("#lightbox");
    const stage = document.querySelector("#lightbox-stage");
    let image = document.querySelector("#lightbox-image");
    if (!dialog || !stage || !image) return;

    const frameLinks = Array.from(document.querySelectorAll("[data-lightbox-image]"));
    // Amazon repeats the same photograph in Brand Story, A+ and comparison.
    // Keep every opener, but browse each source just once in the gallery.
    const frames = document.querySelector('[data-amazon-page]')
      ? frameLinks.filter((frame,index,list) => list.findIndex(item => item.dataset.lightboxImage === frame.dataset.lightboxImage) === index)
      : frameLinks;
    const title = dialog.querySelector("#lightbox-title");
    const caption = dialog.querySelector("#lightbox-caption");
    const counter = dialog.querySelector("#lightbox-count");
    const bottomCounter = dialog.querySelector("#viewer-count");
    const loader = dialog.querySelector("#zoom-loader");
    const errorPanel = dialog.querySelector("#zoom-error");
    const readout = dialog.querySelector("#zoom-readout");
    const fitButton = dialog.querySelector("[data-fit]");
    const oneButton = dialog.querySelector("[data-one]");
    const closeButton = dialog.querySelector("[data-close]");
    const previousButton = dialog.querySelector("[data-prev]");
    const nextButton = dialog.querySelector("[data-next]");
    const zoomButtons = Array.from(dialog.querySelectorAll("[data-fit], [data-one], [data-minus], [data-plus]"));
    let activeIndex = 0;
    let activeFrame = null;
    let opener = null;
    let requestToken = 0;
    let fitScale = 1;
    let scale = 1;
    let minimumScale = 0.05;
    let maximumScale = 6;
    let imageX = 0;
    let imageY = 0;
    let dragging = false;
    let gesture = null;
    let moved = false;
    let multiTouch = false;
    let lastTouchTap = 0;
    let lastTouchZoom = 0;
    const pointers = new Map();
    const clamp = (number, low, high) => Math.min(Math.max(number, low), high);

    function currentFrame() { return frames[activeIndex]; }

    function updateReadout() {
      const focusedControl = document.activeElement;
      const actual = Math.abs(scale - 1) < 0.015;
      const realDesign = currentFrame()?.dataset.realOriginal === "true";
      readout.value = Math.abs(scale - fitScale) < Math.max(0.015, fitScale * 0.015)
        ? "Fit" : actual ? (realDesign ? "1:1" : t("1:1 файл")) :
          Math.round(scale / Math.max(fitScale, 0.001) * 100) + t("% от Fit");
      oneButton.disabled = !realDesign;
      fitButton.disabled = Math.abs(scale - fitScale) < fitScale * .001;
      dialog.querySelector("[data-minus]").disabled = scale <= minimumScale * 1.001;
      dialog.querySelector("[data-plus]").disabled = scale >= maximumScale * .999;
      if (zoomButtons.includes(focusedControl) && focusedControl.disabled) stage.focus({ preventScroll: true });
      oneButton.title = t(realDesign
        ? "Один пиксель оригинала соответствует одному CSS-пикселю"
        : "Для кадра нет подтверждённого оригинала дизайна высокого разрешения");
    }

    function constrain() {
      const bounds = stage.getBoundingClientRect();
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      imageX = width <= bounds.width ? (bounds.width - width) / 2 : clamp(imageX, bounds.width - width, 0);
      imageY = height <= bounds.height ? (bounds.height - height) / 2 : clamp(imageY, bounds.height - height, 0);
    }

    function paint() {
      if (!image.naturalWidth || !image.naturalHeight) return;
      constrain();
      image.style.width = image.naturalWidth + "px";
      image.style.height = image.naturalHeight + "px";
      image.style.transform = "translate3d(" + imageX + "px," + imageY + "px,0) scale(" + scale + ")";
      updateReadout();
    }

    function calculateFit(preserveZoom) {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const bounds = stage.getBoundingClientRect();
      const oldScale = scale;
      const wasFit = Math.abs(oldScale - fitScale) < Math.max(0.015, fitScale * 0.015);
      fitScale = Math.min(Math.max(1, bounds.width - 24) / image.naturalWidth,
        Math.max(1, bounds.height - 24) / image.naturalHeight);
      minimumScale = Math.min(0.05, fitScale);
      maximumScale = currentFrame()?.dataset.realOriginal === "true" ? Math.max(6, fitScale) : Math.max(1, fitScale * 3);
      scale = preserveZoom && !wasFit ? clamp(oldScale, minimumScale, maximumScale) : fitScale;
      imageX = (bounds.width - image.naturalWidth * scale) / 2;
      imageY = (bounds.height - image.naturalHeight * scale) / 2;
      paint();
    }

    function fitImage() {
      if (!image.naturalWidth) return;
      scale = fitScale;
      const bounds = stage.getBoundingClientRect();
      imageX = (bounds.width - image.naturalWidth * scale) / 2;
      imageY = (bounds.height - image.naturalHeight * scale) / 2;
      paint();
    }

    function zoomTo(nextScale, pointX, pointY) {
      if (!image.naturalWidth) return;
      const bounds = stage.getBoundingClientRect();
      const x = pointX == null ? bounds.width / 2 : pointX;
      const y = pointY == null ? bounds.height / 2 : pointY;
      const next = clamp(nextScale, minimumScale, maximumScale);
      const sourceX = (x - imageX) / scale;
      const sourceY = (y - imageY) / scale;
      imageX = x - sourceX * next;
      imageY = y - sourceY * next;
      scale = next;
      paint();
    }

    function setFrame(index) {
      if (!frames.length) return;
      activeIndex = (index + frames.length) % frames.length;
      activeFrame = currentFrame();
      const token = ++requestToken;
      pointers.clear();
      gesture = null;
      dragging = moved = multiTouch = false;
      lastTouchTap = 0;
      stage.classList.remove("is-dragging");
      stage.setAttribute("aria-busy", "true");
      zoomButtons.forEach((button) => button.disabled = true);
      readout.value = "—";
      loader.hidden = false;
      errorPanel.hidden = true;
      image.style.visibility = "hidden";
      image.removeAttribute("src");
      title.textContent = activeFrame.dataset.lightboxTitle || t("Проект");
      caption.textContent = activeFrame.dataset.lightboxCaption || "";
      const count = (activeIndex + 1) + " / " + frames.length;
      counter.textContent = count;
      bottomCounter.textContent = count;
      previousButton.disabled = frames.length < 2;
      nextButton.disabled = frames.length < 2;
      const request = new Image();
      request.id = "lightbox-image";
      request.draggable = false;
      request.alt = activeFrame.querySelector("img")?.alt || title.textContent;
      request.onload = () => {
        if (token !== requestToken || !dialog.open) return;
        request.onload = request.onerror = null;
        image.replaceWith(request);
        image = request;
        loader.hidden = true;
        stage.setAttribute("aria-busy", "false");
        calculateFit(false);
        if (!reducedMotion.matches) image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
      };
      request.onerror = () => {
        if (token !== requestToken || !dialog.open) return;
        loader.hidden = true;
        stage.setAttribute("aria-busy", "false");
        errorPanel.hidden = false;
      };
      request.src = activeFrame.dataset.lightboxImage;
    }

    function open(frame, trigger = frame) {
      opener = trigger;
      activeIndex = Math.max(0, frames.findIndex(item => item.dataset.lightboxImage === frame.dataset.lightboxImage));
      if (!dialog.open) dialog.showModal();
      setFrame(activeIndex);
      closeButton.focus({ preventScroll: true });
    }

    for (const frame of frameLinks) {
      frame.addEventListener("click", (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        open(frame);
      });
    }
    for (const trigger of document.querySelectorAll('[data-open-frame]')) {
      trigger.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const frame = frameLinks[Number(trigger.dataset.openFrame)];
        if (!frame) return;
        event.preventDefault();
        open(frame, trigger);
      });
    }
    closeButton.addEventListener("click", () => dialog.close());
    previousButton.addEventListener("click", () => setFrame(activeIndex - 1));
    nextButton.addEventListener("click", () => setFrame(activeIndex + 1));
    fitButton.addEventListener("click", fitImage);
    oneButton.addEventListener("click", () => {
      if (activeFrame?.dataset.realOriginal === "true") zoomTo(1);
    });
    dialog.querySelector("[data-minus]").addEventListener("click", () => zoomTo(scale / 1.22));
    dialog.querySelector("[data-plus]").addEventListener("click", () => zoomTo(scale * 1.22));
    dialog.querySelector("[data-retry]").addEventListener("click", () => setFrame(activeIndex));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => {
      ++requestToken;
      image.removeAttribute("src");
      image.style.transform = "";
      image.style.visibility = "visible";
      pointers.clear();
      gesture = null;
      dragging = false;
      stage.classList.remove("is-dragging");
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    });
    document.addEventListener("keydown", (event) => {
      if (!dialog.open) return;
      if (event.key === "ArrowRight") { event.preventDefault(); setFrame(activeIndex + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); setFrame(activeIndex - 1); }
      else if (event.key === "0") { event.preventDefault(); fitImage(); }
      else if (event.key === "1" && activeFrame?.dataset.realOriginal === "true") { event.preventDefault(); zoomTo(1); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(scale * 1.22); }
      else if (event.key === "-") { event.preventDefault(); zoomTo(scale / 1.22); }
    });

    stage.addEventListener("wheel", (event) => {
      event.preventDefault();
      const bounds = stage.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      zoomTo(scale * Math.exp(-clamp(delta, -200, 200) * .002), event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });

    stage.addEventListener("pointerdown", (event) => {
      if (!image.naturalWidth) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });
      try { stage.setPointerCapture(event.pointerId); } catch {}
      moved = false;
      if (pointers.size === 1) {
        const point = pointers.get(event.pointerId);
        gesture = { type: "pan", startX: point.x, startY: point.y, imageX, imageY };
        dragging = false;
      } else if (pointers.size === 2) {
        multiTouch = true;
        const points = Array.from(pointers.values());
        const bounds = stage.getBoundingClientRect();
        const midX = (points[0].x + points[1].x) / 2 - bounds.left;
        const midY = (points[0].y + points[1].y) / 2 - bounds.top;
        gesture = { type: "pinch", startDistance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
          startScale: scale, midX, midY, imageX, imageY };
        stage.classList.add("is-dragging");
      }
    });
    stage.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });
      if (gesture.type === "pan" && pointers.size === 1) {
        const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
        if (distance > 5) { moved = true; dragging = true; stage.classList.add("is-dragging"); }
        if (dragging) {
          imageX = gesture.imageX + event.clientX - gesture.startX;
          imageY = gesture.imageY + event.clientY - gesture.startY;
          paint();
        }
      } else if (gesture.type === "pinch" && pointers.size >= 2) {
        moved = true;
        const points = Array.from(pointers.values()).slice(0, 2);
        const bounds = stage.getBoundingClientRect();
        const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
        const x = (points[0].x + points[1].x) / 2 - bounds.left;
        const y = (points[0].y + points[1].y) / 2 - bounds.top;
        const next = clamp(gesture.startScale * distance / gesture.startDistance, minimumScale, maximumScale);
        const sourceX = (gesture.midX - gesture.imageX) / gesture.startScale;
        const sourceY = (gesture.midY - gesture.imageY) / gesture.startScale;
        scale = next;
        imageX = x - sourceX * scale;
        imageY = y - sourceY * scale;
        paint();
      }
    });

    function toggleDoubleTap(x, y) {
      const bounds = stage.getBoundingClientRect();
      if (Math.abs(scale - fitScale) < Math.max(.015, fitScale * .015)) zoomTo(Math.min(maximumScale, Math.max(1, fitScale * 2)), x - bounds.left, y - bounds.top);
      else fitImage();
      lastTouchZoom = performance.now();
    }

    function finishPointer(event) {
      const point = pointers.get(event.pointerId);
      if (event.type === "pointerup" && !moved && !multiTouch && point?.pointerType === "touch" && pointers.size === 1) {
        const now = performance.now();
        if (now - lastTouchTap < 330) { toggleDoubleTap(event.clientX, event.clientY); lastTouchTap = 0; }
        else lastTouchTap = now;
      }
      pointers.delete(event.pointerId);
      if (pointers.size === 1) {
        const remaining = Array.from(pointers.values())[0];
        gesture = { type: "pan", startX: remaining.x, startY: remaining.y, imageX, imageY };
        dragging = false;
        moved = false;
      } else if (pointers.size === 0) {
        gesture = null;
        dragging = false;
        moved = false;
        multiTouch = false;
        stage.classList.remove("is-dragging");
      }
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    }
    stage.addEventListener("pointerup", finishPointer);
    stage.addEventListener("pointercancel", (event) => {
      lastTouchTap = 0;
      finishPointer(event);
    });
    stage.addEventListener("dblclick", (event) => {
      event.preventDefault();
      if (performance.now() - lastTouchZoom < 500) return;
      toggleDoubleTap(event.clientX, event.clientY);
    });

    window.addEventListener("resize", () => {
      if (dialog.open && image.naturalWidth) calculateFit(true);
    });
    window.addEventListener("orientationchange", () => {
      if (dialog.open && image.naturalWidth) window.requestAnimationFrame(() => calculateFit(true));
    });
  }

  setupNavigation();
  setupFilters();
  setupCaseReturn();
  setupVideos();
  setupViewer();
})();
