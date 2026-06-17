import { BRIDGE_MESSAGES, BRIDGE_NAMESPACE, BRIDGE_VERSION } from "../bridge/BridgeProtocol";

export interface BridgeInjectionOptions {
  webUiVaultNavigationPrimaryClick?: boolean;
}

export function createBridgeScript(options: BridgeInjectionOptions = {}): string {
  const webUiVaultNavigationPrimaryClick = options.webUiVaultNavigationPrimaryClick !== false;
  return `
<script data-another-opencode-for-obsidian-bridge>
(function() {
  var ns = ${JSON.stringify(BRIDGE_NAMESPACE)};
  var version = ${JSON.stringify(BRIDGE_VERSION)};
  var messages = ${JSON.stringify(BRIDGE_MESSAGES)};
  var vaultNavigationPrimaryClick = ${JSON.stringify(webUiVaultNavigationPrimaryClick)};
  var vaultHoverInsetX = 3;
  var vaultHoverInsetY = 2;
  var vaultHoverRadius = 5;
  var vaultHoverHiddenScale = 0.98;
  var vaultHoverTransition = 'opacity 120ms ease, transform 120ms ease';
  var vaultHoverBackground = 'rgba(214, 166, 79, 0.14)';
  var vaultHoverShadow =
    'inset 0 0 0 1px rgba(214, 166, 79, 0.36), 0 0 0 3px rgba(214, 166, 79, 0.08)';
  function post(type, payload) {
    window.parent.postMessage({ ns: ns, version: version, type: type, payload: payload }, '*');
  }
  var vaultFileClickRules = [
    {
      name: 'session-review-file',
      eventTargetSelector: '[data-slot="session-review-trigger-content"], [data-slot="session-review-file-info"], [data-slot="session-review-view-button"]',
      containerSelector: '[data-slot="session-review-accordion-item"], [data-file]',
      attribute: 'data-file'
    },
    {
      name: 'session-review-slots',
      eventTargetSelector: '[data-slot="session-review-directory"], [data-slot="session-review-filename"]',
      containerSelector: '[data-slot="session-review-file-name-container"]',
      directorySelector: '[data-slot="session-review-directory"]',
      filenameSelector: '[data-slot="session-review-filename"]'
    },
    {
      name: 'tool-file-slots',
      eventTargetSelector: '[data-slot="apply-patch-trigger-content"], [data-slot="apply-patch-file-info"], [data-slot="apply-patch-directory"], [data-slot="apply-patch-filename"]',
      containerSelector: '[data-slot="apply-patch-trigger-content"]',
      directorySelector: '[data-slot="apply-patch-directory"]',
      filenameSelector: '[data-slot="apply-patch-filename"]'
    },
    {
      name: 'message-title-slots',
      eventTargetSelector: '[data-component="edit-trigger"], [data-component="write-trigger"], [data-slot="message-part-title-area"], [data-slot="message-part-directory"], [data-slot="message-part-title-filename"]',
      containerSelector: '[data-slot="message-part-title-area"]',
      directorySelector: '[data-slot="message-part-directory"]',
      filenameSelector: '[data-slot="message-part-title-filename"]'
    },
    {
      name: 'session-review-line',
      eventTargetSelector: '[data-line], [data-alt-line]',
      containerSelector: '[data-slot="session-review-accordion-item"], [data-file]',
      attribute: 'data-file'
    },
    {
      name: 'session-turn-diff-slots',
      eventTargetSelector: '[data-slot="session-turn-diff-trigger"], [data-slot="session-turn-diff-path"], [data-slot="session-turn-diff-directory"], [data-slot="session-turn-diff-filename"]',
      containerSelector: '[data-slot="accordion-item"]',
      directorySelector: '[data-slot="session-turn-diff-directory"]',
      filenameSelector: '[data-slot="session-turn-diff-filename"]'
    },
    {
      name: 'session-turn-diff-line',
      eventTargetSelector: '[data-line], [data-alt-line]',
      containerSelector: '[data-slot="accordion-item"]',
      directorySelector: '[data-slot="session-turn-diff-directory"]',
      filenameSelector: '[data-slot="session-turn-diff-filename"]'
    },
    {
      name: 'tool-file-line',
      eventTargetSelector: '[data-line], [data-alt-line]',
      containerSelector: '[data-slot="accordion-item"]',
      directorySelector: '[data-slot="apply-patch-directory"]',
      filenameSelector: '[data-slot="apply-patch-filename"]'
    },
    {
      name: 'basic-tool-path-text',
      eventTargetSelector: '[data-component="tool-trigger"], [data-slot="basic-tool-tool-trigger-content"], [data-slot="basic-tool-tool-subtitle"], [data-slot="basic-tool-tool-arg"]',
      containerSelector: '[data-component="tool-trigger"]',
      textSelector: '[data-slot="basic-tool-tool-subtitle"]',
      textPath: true
    },
    {
      name: 'tool-loaded-file',
      eventTargetSelector: '[data-component="tool-loaded-file"]',
      containerSelector: '[data-component="tool-loaded-file"]',
      textPath: true
    }
  ];
  var absoluteFilesystemRootPattern = /^\\/(?:Users|home|private|tmp|var|Volumes|Applications|System|Library|bin|sbin|usr|etc|opt|dev|proc|run)(?:\\/|$)/;
  function cleanVaultPath(value) {
    if (typeof value !== 'string') return null;
    var path = value.replace(/[\u202A-\u202E\u2066-\u2069]/g, '').trim();
    if (!path || path.length > 2048) return null;
    if (/[\\u0000\\r\\n]/.test(path)) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
    if (path.indexOf('\\\\') !== -1) return null;
    if (path.charAt(0) === '/') {
      if (absoluteFilesystemRootPattern.test(path)) return null;
      while (path.charAt(0) === '/') {
        path = path.slice(1);
      }
    }
    path = path.split('/').filter(Boolean).join('/');
    if (!path) return null;
    if (path.indexOf('..') !== -1 && path.split('/').indexOf('..') !== -1) return null;
    return path.indexOf('./') === 0 ? path.slice(2) : path;
  }
  function extractVaultPathFromText(value) {
    if (typeof value !== 'string') return null;
    var direct = cleanVaultPath(value);
    if (direct && /\\.(?:md|markdown|canvas)(?:#|$)/i.test(direct)) return direct;
    var text = value.replace(/[\u202A-\u202E\u2066-\u2069]/g, ' ').trim();
    var match = text.match(/(?:^|\\s)(\\/?(?:[^\\s/]+\\/)*[^\\s/]+\\.(?:md|markdown|canvas)(?:#[^\\s]+)?)/i);
    return match ? cleanVaultPath(match[1]) : null;
  }
  function eventPath(e) {
    if (typeof e.composedPath === 'function') {
      return e.composedPath();
    }
    return e.target ? [e.target] : [];
  }
  function closestFromPath(path, selector) {
    for (var i = 0; i < path.length; i += 1) {
      var node = path[i];
      if (!(node instanceof Element)) continue;
      if (node.matches(selector)) return node;
      var closest = node.closest(selector);
      if (closest) return closest;
    }
    return null;
  }
  function attributeFromPath(path, selector, attribute) {
    for (var i = 0; i < path.length; i += 1) {
      var node = path[i];
      if (!(node instanceof Element)) continue;
      var candidates = [];
      if (node.matches(selector)) candidates.push(node);
      var closest = node.closest(selector);
      if (closest && candidates.indexOf(closest) === -1) candidates.push(closest);
      for (var j = 0; j < candidates.length; j += 1) {
        var value = cleanVaultPath(candidates[j].getAttribute(attribute));
        if (value) return value;
      }
    }
    return null;
  }
  function textContentOf(container, selector) {
    var element = container.querySelector(selector);
    return element ? element.textContent || '' : '';
  }
  function pathFromRule(path, rule) {
    if (rule.eventTargetSelector && !closestFromPath(path, rule.eventTargetSelector)) {
      return null;
    }
    if (rule.attribute) {
      return attributeFromPath(path, rule.containerSelector, rule.attribute);
    }
    var container = closestFromPath(path, rule.containerSelector);
    if (!container) return null;
    if (rule.textPath) {
      if (rule.textSelector) {
        return extractVaultPathFromText(textContentOf(container, rule.textSelector));
      }
      var textTarget = closestFromPath(path, rule.eventTargetSelector);
      return (
        extractVaultPathFromText(textTarget ? textTarget.textContent || '' : '') ||
        extractVaultPathFromText(container.textContent || '')
      );
    }
    var filename = cleanVaultPath(textContentOf(container, rule.filenameSelector));
    if (!filename) return null;
    var directory = cleanVaultPath(textContentOf(container, rule.directorySelector));
    return directory ? cleanVaultPath(directory + '/' + filename) : filename;
  }
  function lineNumberFromPath(path) {
    var lineElement = closestFromPath(path, '[data-line], [data-alt-line]');
    if (!lineElement) return null;
    var raw =
      lineElement.getAttribute('data-line') ||
      lineElement.getAttribute('data-alt-line');
    var line = parseInt(raw || '', 10);
    return Number.isFinite(line) && line > 0 ? line : null;
  }
  function cleanObsidianWikilink(value) {
    if (typeof value !== 'string') return null;
    var link = value.replace(/[\u202A-\u202E\u2066-\u2069]/g, '').trim();
    if (!link || link.length > 2048) return null;
    if (/[\\u0000\\r\\n]/.test(link)) return null;
    if (!/^!?\\[\\[[\\s\\S]+\\]\\]$/.test(link)) return null;
    return link.charAt(0) === '!' ? link.slice(1) : link;
  }
  function wikilinkAtTextOffset(text, offset) {
    if (typeof text !== 'string') return null;
    var safeOffset = Math.max(0, Math.min(text.length, offset));
    var start = text.lastIndexOf('[[', safeOffset);
    if (start === -1) return null;
    var end = text.indexOf(']]', start + 2);
    if (end === -1 || safeOffset < start || safeOffset > end + 2) return null;
    var nestedStart = text.indexOf('[[', start + 2);
    if (nestedStart !== -1 && nestedStart < end) return null;
    var path = cleanObsidianWikilink(text.slice(start, end + 2));
    return path ? { path: path, start: start, end: end + 2 } : null;
  }
  function vaultPathAtTextOffset(text, offset) {
    if (typeof text !== 'string') return null;
    var safeOffset = Math.max(0, Math.min(text.length, offset));
    var normalized = text.replace(/[\u202A-\u202E\u2066-\u2069]/g, ' ');
    var pattern = /(^|[\\s"'“‘\\(\\[\\{<*])([^\\r\\n\\t"'“”‘’<>\\[\\]\\{\\}]+?\\.(?:md|markdown|canvas)(?:#[^\\s"'“”‘’<>\\[\\]\\{\\}\\(\\),，。；;：:]+)?)/gi;
    var match;
    while ((match = pattern.exec(normalized)) !== null) {
      var prefix = match[1] || '';
      var raw = match[2] || '';
      var start = match.index + prefix.length;
      var listPrefix = raw.match(/^\\s*(?:[-*•]|\\d+[.)])\\s+/);
      if (listPrefix) {
        start += listPrefix[0].length;
        raw = raw.slice(listPrefix[0].length);
      }
      var end = start + raw.length;
      if (safeOffset >= start && safeOffset < end) {
        var path = cleanVaultPath(raw);
        return path ? { path: path, start: start, end: end } : null;
      }
    }
    return null;
  }
  function textPositionFromPoint(e) {
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return null;
    if (typeof document.caretPositionFromPoint === 'function') {
      var position = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (position && position.offsetNode) {
        return { node: position.offsetNode, offset: position.offset };
      }
    }
    if (typeof document.caretRangeFromPoint === 'function') {
      var range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range && range.startContainer) {
        return { node: range.startContainer, offset: range.startOffset };
      }
    }
    return null;
  }
  function rectFromElement(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    var rect = element.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }
  function rectFromTextRange(node, start, end) {
    if (!node || typeof document.createRange !== 'function') return null;
    var range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    var rects = range.getClientRects ? range.getClientRects() : [];
    for (var i = 0; i < rects.length; i += 1) {
      if (rects[i].width > 0 && rects[i].height > 0) return rects[i];
    }
    var rect = range.getBoundingClientRect ? range.getBoundingClientRect() : null;
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }
  function pathFromMarkdownClick(e, path) {
    if (!closestFromPath(path, '[data-component="markdown"]')) return null;
    var position = textPositionFromPoint(e);
    if (!position || !position.node || position.node.nodeType !== 3) return null;
    var text = position.node.nodeValue || '';
    var match = wikilinkAtTextOffset(text, position.offset) || vaultPathAtTextOffset(text, position.offset);
    if (!match) return null;
    return {
      path: match.path,
      line: null,
      rect: rectFromTextRange(position.node, match.start, match.end)
    };
  }
  function vaultFileClickFromEvent(e) {
    var path = eventPath(e);
    for (var i = 0; i < vaultFileClickRules.length; i += 1) {
      var rule = vaultFileClickRules[i];
      var filePath = pathFromRule(path, rule);
      if (filePath) {
        var hoverElement =
          (rule.eventTargetSelector && closestFromPath(path, rule.eventTargetSelector)) ||
          closestFromPath(path, rule.containerSelector);
        return { path: filePath, line: lineNumberFromPath(path), rect: rectFromElement(hoverElement) };
      }
    }
    return pathFromMarkdownClick(e, path);
  }
  var hoverIndicator = null;
  function ensureHoverIndicator() {
    if (hoverIndicator) return hoverIndicator;
    hoverIndicator = document.createElement('div');
    hoverIndicator.setAttribute('data-another-opencode-for-obsidian-vault-hover', '');
    hoverIndicator.style.position = 'fixed';
    hoverIndicator.style.pointerEvents = 'none';
    hoverIndicator.style.zIndex = '2147483647';
    hoverIndicator.style.borderRadius = vaultHoverRadius + 'px';
    hoverIndicator.style.opacity = '0';
    hoverIndicator.style.transform = 'translate3d(0, 0, 0) scale(' + vaultHoverHiddenScale + ')';
    hoverIndicator.style.transition = vaultHoverTransition;
    hoverIndicator.style.background = vaultHoverBackground;
    hoverIndicator.style.boxShadow = vaultHoverShadow;
    document.documentElement.appendChild(hoverIndicator);
    return hoverIndicator;
  }
  function setPointerCursor(value) {
    var cursor = value ? (vaultNavigationPrimaryClick ? 'pointer' : 'context-menu') : '';
    document.documentElement.style.cursor = cursor;
    if (document.body) document.body.style.cursor = cursor;
  }
  function showHoverIndicator(rect) {
    setPointerCursor(true);
    if (!rect) {
      if (hoverIndicator) hoverIndicator.style.opacity = '0';
      return;
    }
    var indicator = ensureHoverIndicator();
    indicator.style.left = Math.max(0, rect.left - vaultHoverInsetX) + 'px';
    indicator.style.top = Math.max(0, rect.top - vaultHoverInsetY) + 'px';
    indicator.style.width = Math.max(1, rect.width + vaultHoverInsetX * 2) + 'px';
    indicator.style.height = Math.max(1, rect.height + vaultHoverInsetY * 2) + 'px';
    indicator.style.opacity = '1';
    indicator.style.transform = 'translate3d(0, 0, 0) scale(1)';
  }
  function hideHoverIndicator() {
    setPointerCursor(false);
    if (!hoverIndicator) return;
    hoverIndicator.style.opacity = '0';
    hoverIndicator.style.transform = 'translate3d(0, 0, 0) scale(' + vaultHoverHiddenScale + ')';
  }
  function vaultFileHoverHandler(e) {
    if (e.defaultPrevented) return;
    var hover = vaultFileClickFromEvent(e);
    if (!hover) {
      hideHoverIndicator();
      return;
    }
    showHoverIndicator(hover.rect);
  }
  function shouldNavigateVaultFileForEvent(e) {
    if (e.defaultPrevented) return false;
    if (vaultNavigationPrimaryClick) {
      return e.type === 'click' && e.button === 0;
    }
    return e.type === 'contextmenu';
  }
  function vaultFileClickHandler(e) {
    if (!shouldNavigateVaultFileForEvent(e)) return;
    var click = vaultFileClickFromEvent(e);
    if (!click) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var payload = click.line ? { path: click.path, line: click.line } : { path: click.path };
    post(messages.vaultFileOpen, payload);
  }
  post(messages.proxyLoaded);
  function toggleHandler(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      post(messages.viewToggle);
    }
  }
  document.addEventListener('pointermove', vaultFileHoverHandler, true);
  document.addEventListener('pointerleave', hideHoverIndicator, true);
  document.addEventListener('click', vaultFileClickHandler, true);
  document.addEventListener('contextmenu', vaultFileClickHandler, true);
  window.addEventListener('keydown', toggleHandler, true);
  document.addEventListener('keydown', toggleHandler, true);
})();
</script>
`;
}
