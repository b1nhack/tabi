(() => {
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 5;
    const STEP = 1.25;
    // ~20% per standard 120-delta wheel notch.
    const WHEEL_FACTOR = 0.0015;
    // Pointer travel (px) after which a click on the backdrop is considered a drag.
    const DRAG_THRESHOLD = 6;

    const labels = {
        open: document.getElementById('mermaid-zoom-open').textContent.trim(),
        in: document.getElementById('mermaid-zoom-in').textContent.trim(),
        out: document.getElementById('mermaid-zoom-out').textContent.trim(),
        close: document.getElementById('mermaid-zoom-close').textContent.trim(),
    };

    let lightbox = null;
    let stage = null;
    let content = null;
    let closeButton = null;
    let scaleLabel = null;
    let svgClone = null;
    let scale = 1;
    let baseWidth = 0;
    let baseHeight = 0;
    let lastFocused = null;
    // Backdrop clicks that follow a drag must not close the lightbox.
    let dragDistance = 0;
    let pointers = new Map();
    let pinchDistance = 0;
    let pinchMidpoint = null;

    // Keeps the content point under (anchorX, anchorY) stable while zooming.
    const zoomAround = (nextScale, anchorX, anchorY) => {
        if (!svgClone) return;
        const previous = scale;
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
        // A zoom step that crosses 100% lands exactly on it.
        scale = (previous - 1) * (next - 1) < 0 || next === 1 ? 1 : next;
        if (scale === previous) return;
        const rect = stage.getBoundingClientRect();
        const x = anchorX - rect.left;
        const y = anchorY - rect.top;
        const ratio = scale / previous;
        const contentX = stage.scrollLeft + x;
        const contentY = stage.scrollTop + y;
        applyScale();
        stage.scrollLeft = contentX * ratio - x;
        stage.scrollTop = contentY * ratio - y;
    };

    const zoomCenter = (nextScale) => {
        const rect = stage.getBoundingClientRect();
        zoomAround(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };

    const applyScale = () => {
        svgClone.style.width = `${Math.round(baseWidth * scale)}px`;
        svgClone.style.height = `${Math.round(baseHeight * scale)}px`;
        scaleLabel.textContent = `${Math.round(scale * 100)}%`;
    };

    // 100% is the size at which the whole diagram fits the viewport.
    const computeFit = () => {
        const viewBox = svgClone.viewBox.baseVal;
        let width = viewBox.width;
        let height = viewBox.height;
        if (!width || !height) {
            const rect = svgClone.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
        }
        const style = getComputedStyle(stage);
        const availableWidth = stage.clientWidth
            - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const availableHeight = stage.clientHeight
            - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const fit = Math.min(availableWidth / (width || 1), availableHeight / (height || 1));
        baseWidth = width * fit;
        baseHeight = height * fit;
    };

    const closeLightbox = () => {
        lightbox.classList.remove('open');
        document.documentElement.style.overflow = '';
        content.replaceChildren();
        svgClone = null;
        if (lastFocused) {
            // Focus the diagram container rather than its zoom button: the
            // button only reveals on hover, and a keyboard-restored focus
            // would keep it stuck visible after closing.
            (lastFocused.closest('.mermaid-container') || lastFocused).focus();
        }
    };

    const openLightbox = (svg) => {
        if (!lightbox) buildLightbox();
        lastFocused = document.activeElement;
        // Mermaid v12 keeps the <pre> and injects the <svg> inside it; the
        // dark-mode inversion flag lives on the container, not the <svg>.
        content.classList.toggle('invertible-mermaid', Boolean(svg.closest('.invertible-mermaid')));
        svgClone = svg.cloneNode(true);
        svgClone.removeAttribute('style');
        svgClone.removeAttribute('width');
        svgClone.removeAttribute('height');
        content.replaceChildren(svgClone);
        lightbox.classList.add('open');
        document.documentElement.style.overflow = 'hidden';
        computeFit();
        scale = 1;
        applyScale();
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
        closeButton.focus();
    };

    const controlButton = (className, label, text, action) => {
        const button = document.createElement('div');
        button.className = className;
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        if (text) button.textContent = text;
        button.addEventListener('click', action);
        button.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                action();
            }
        });
        return button;
    };

    const pinchStart = () => {
        const [first, second] = [...pointers.values()];
        pinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
        pinchMidpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    };

    // Two-finger pinch: zoom around the midpoint, panning along with it.
    const pinchMove = () => {
        const [first, second] = [...pointers.values()];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        if (!pinchDistance || !distance) {
            pinchStart();
            return;
        }
        stage.scrollLeft -= midpoint.x - pinchMidpoint.x;
        stage.scrollTop -= midpoint.y - pinchMidpoint.y;
        dragDistance += Math.hypot(midpoint.x - pinchMidpoint.x, midpoint.y - pinchMidpoint.y);
        zoomAround(scale * (distance / pinchDistance), midpoint.x, midpoint.y);
        pinchDistance = distance;
        pinchMidpoint = midpoint;
    };

    const buildLightbox = () => {
        lightbox = document.createElement('div');
        lightbox.className = 'mermaid-lightbox';
        lightbox.setAttribute('role', 'dialog');
        lightbox.setAttribute('aria-modal', 'true');
        lightbox.setAttribute('aria-label', labels.open);

        closeButton = controlButton('mermaid-lightbox-close', labels.close, '', closeLightbox);
        closeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">'
            + '<path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>';

        stage = document.createElement('div');
        stage.className = 'mermaid-lightbox-stage';
        content = document.createElement('div');
        content.className = 'mermaid-lightbox-content';
        stage.append(content);
        lightbox.addEventListener('click', (event) => {
            // Clicks on the dimmed backdrop, not the panel, dismiss the lightbox.
            if (event.target === lightbox && dragDistance < DRAG_THRESHOLD) {
                closeLightbox();
            }
        });

        stage.addEventListener('pointerdown', (event) => {
            // Synthetic events (automation) carry unknown pointerIds; not fatal.
            try {
                stage.setPointerCapture(event.pointerId);
            } catch {}
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            dragDistance = 0;
            pinchDistance = 0;
            pinchMidpoint = null;
            if (pointers.size === 2) pinchStart();
        });

        stage.addEventListener('pointermove', (event) => {
            const previous = pointers.get(event.pointerId);
            if (!previous) return;
            const current = { x: event.clientX, y: event.clientY };
            pointers.set(event.pointerId, current);
            if (pointers.size === 1) {
                stage.scrollLeft -= current.x - previous.x;
                stage.scrollTop -= current.y - previous.y;
                dragDistance += Math.hypot(current.x - previous.x, current.y - previous.y);
            } else if (pointers.size === 2) {
                pinchMove();
            }
        });

        const releasePointer = (event) => {
            pointers.delete(event.pointerId);
            pinchDistance = 0;
            pinchMidpoint = null;
        };
        stage.addEventListener('pointerup', releasePointer);
        stage.addEventListener('pointercancel', releasePointer);

        // Wheel zooms anchored at the pointer; dragging pans. DOM_DELTA_LINE
        // (Firefox mouse wheels) is normalized to pixels.
        stage.addEventListener('wheel', (event) => {
            event.preventDefault();
            const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
            zoomAround(scale * Math.exp(-delta * WHEEL_FACTOR), event.clientX, event.clientY);
        }, { passive: false });

        const controls = document.createElement('div');
        controls.className = 'mermaid-lightbox-controls';
        scaleLabel = document.createElement('span');
        scaleLabel.className = 'mermaid-lightbox-scale';
        controls.append(
            controlButton('mermaid-lightbox-zoom', labels.out, '−', () => zoomCenter(scale / STEP)),
            scaleLabel,
            controlButton('mermaid-lightbox-zoom', labels.in, '+', () => zoomCenter(scale * STEP)),
        );

        const panel = document.createElement('div');
        panel.className = 'mermaid-lightbox-panel';
        panel.append(stage, closeButton, controls);
        lightbox.append(panel);
        document.body.append(lightbox);

        document.addEventListener('keydown', (event) => {
            if (!lightbox.classList.contains('open')) return;
            if (event.key === 'Escape') closeLightbox();
            if (event.key === '+' || event.key === '=') zoomCenter(scale * STEP);
            if (event.key === '-') zoomCenter(scale / STEP);
        });

        window.addEventListener('resize', () => {
            if (!svgClone || !lightbox.classList.contains('open')) return;
            computeFit();
            applyScale();
        });
    };

    const addZoomButton = (container) => {
        // Focusable for the post-close focus restoration, which must not land
        // on the hover-only button itself.
        container.setAttribute('tabindex', '-1');
        const open = () => {
            const svg = container.querySelector('svg');
            if (svg) openLightbox(svg);
        };
        container.append(controlButton('mermaid-zoom-button', labels.open, '', open));
    };

    const containers = document.querySelectorAll('.mermaid-container');
    if (containers.length === 0) return;

    // Zola renders component bodies through markdown, so a blank line followed
    // by indented lines becomes a highlighted code block embedded in the
    // diagram source. Mermaid reads the element's HTML and fails to parse it:
    // replace any embedded markup with the plain text it wraps.
    // Zola renders component bodies through markdown, so a blank line
    // followed by indented lines leaks the rest of the diagram out of the
    // body as highlighted markup, entity-encoded by Zola (and mangled
    // further by HTML minifiers). Mermaid does not decode entities and
    // treats `;` as a statement separator, dropping a trailing one which
    // loses quoted code in sequence diagram text. Repair the leaked markup
    // and entity layers, and escape a trailing `;` so diagrams render
    // verbatim; a `;` followed by content keeps its separator semantics,
    // and other diagram types never display one.
    const prepareDiagramSource = (pre) => {
        let text = pre.textContent;
        if (/(?:class="?giallo|data-lang=|<(?:p|pre|div|code)\b)|&(?:amp|lt|gt);/.test(text)) {
            const decoder = document.createElement('textarea');
            decoder.innerHTML = text.replace(/<\/?(?:p|pre|div|code|span)\b[^>]*>/g, '');
            text = decoder.value;
        }
        if (/^\s*sequenceDiagram\b/m.test(text)) {
            text = text.replace(/(\S.*?[^#\d]);[ \t]*$/gm, '$1#59;');
        }
        pre.textContent = text;
    };

    for (const container of containers) {
        const pre = container.querySelector('pre.mermaid');
        if (pre) prepareDiagramSource(pre);

        if (container.querySelector('svg')) {
            addZoomButton(container);
            continue;
        }
        const observer = new MutationObserver(() => {
            if (!container.querySelector('svg')) return;
            observer.disconnect();
            addZoomButton(container);
        });
        observer.observe(container, { childList: true, subtree: true });
    }
})();
