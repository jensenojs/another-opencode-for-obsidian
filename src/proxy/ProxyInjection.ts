import { BRIDGE_MESSAGES, BRIDGE_NAMESPACE, BRIDGE_VERSION } from "../bridge/BridgeProtocol";
import type { WebViewAppearance, WebViewTheme } from "../types";

const HEAD_OPEN_TAG = /<head(\s[^>]*)?>/i;

function createBridgeScript(): string {
  return `
<script data-opencode-obsidian-bridge>
(function() {
  var ns = ${JSON.stringify(BRIDGE_NAMESPACE)};
  var version = ${JSON.stringify(BRIDGE_VERSION)};
  var messages = ${JSON.stringify(BRIDGE_MESSAGES)};
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
      eventTargetSelector: '[data-line], [data-alt-line], [data-column-number], [data-column-content], [data-content]',
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
      eventTargetSelector: '[data-line], [data-alt-line], [data-column-number], [data-column-content], [data-content]',
      containerSelector: '[data-slot="accordion-item"]',
      directorySelector: '[data-slot="session-turn-diff-directory"]',
      filenameSelector: '[data-slot="session-turn-diff-filename"]'
    },
    {
      name: 'tool-file-line',
      eventTargetSelector: '[data-line], [data-alt-line], [data-column-number], [data-column-content], [data-content]',
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
        path = path.replace(/^\\/+/, '');
      }
      path = path.replace(/\\/+/g, '/').replace(/^\\/|\\/$/g, '');
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
      var lineElement = closestFromPath(path, '[data-line], [data-alt-line], [data-column-number]');
      if (!lineElement) return null;
      var raw =
        lineElement.getAttribute('data-line') ||
        lineElement.getAttribute('data-alt-line') ||
        lineElement.getAttribute('data-column-number');
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
      hoverIndicator.setAttribute('data-opencode-obsidian-vault-hover', '');
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
      document.documentElement.style.cursor = value ? 'pointer' : '';
      if (document.body) document.body.style.cursor = value ? 'pointer' : '';
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
    function vaultFileClickHandler(e) {
      if (e.defaultPrevented || e.button !== 0) return;
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
    window.addEventListener('keydown', toggleHandler, true);
    document.addEventListener('keydown', toggleHandler, true);
  })();
</script>
`;
}

function createObsidianAppearanceStyle(): string {
  return `
  <style data-opencode-obsidian-appearance>
  html,
  body {
    background: var(
      --opencode-obsidian-page-background,
      var(--opencode-obsidian-background-primary, transparent)
    ) !important;
  }

  #root {
    background: transparent !important;
  }

    html,
    body {
  min-height: 100%;
}

  body {
    position: relative;
    isolation: isolate;
  }

  /* Maintenance guard: earlier experiments projected a parent-window background
     plane into the iframe with negative offsets. That couples paint to Obsidian
     layout timing and brings back resize/focus artifacts. This layer is the
     iframe document's own viewport background; parent geometry is diagnostics
     evidence only. */
  body::before {
    content: "";
    display: none;
    position: fixed;
    left: 0;
    top: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    background-image: var(--opencode-obsidian-workspace-background-image, none);
    background-position: var(--opencode-obsidian-workspace-background-position, center);
    background-size: var(--opencode-obsidian-workspace-background-size, cover);
    background-repeat: var(--opencode-obsidian-workspace-background-repeat, no-repeat);
    background-blend-mode: var(--opencode-obsidian-workspace-background-blend-mode, overlay);
    opacity: var(--opencode-obsidian-workspace-background-opacity, 0);
    filter: var(--opencode-obsidian-workspace-background-filter, none);
    z-index: 0;
  }

  html[data-opencode-obsidian-workspace-background="enabled"] body::before {
    display: block;
  }

    #root {
      position: relative;
      min-height: 100dvh;
      z-index: 1;
    }

    /*
     * When Obsidian appearance paints a workspace/background image inside the
     * iframe, CSS backdrop-filter is unsafe: it asks Chromium/Electron to sample
     * pixels behind each element, and that sampling has flashed the parent
     * Markdown editor during iframe scroll. Disable the capability for the whole
     * iframe only while the workspace background image is active, so selector
     * changes in OpenCode cannot reintroduce the same artifact.
     */
    html[data-opencode-obsidian-appearance="obsidian"][data-opencode-obsidian-workspace-background="enabled"] *,
    html[data-opencode-obsidian-appearance="obsidian"][data-opencode-obsidian-workspace-background="enabled"] *::before,
    html[data-opencode-obsidian-appearance="obsidian"][data-opencode-obsidian-workspace-background="enabled"] *::after {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    html[data-opencode-obsidian-appearance="obsidian"][data-opencode-obsidian-workspace-background="enabled"] dialog::backdrop {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    </style>
  `;
}

export function injectOpenCodeWebUiProxyHtml(
  html: string,
  appearance: WebViewAppearance,
  theme: WebViewTheme | null
): string {
  return injectIntoHead(html, createBridgeScript() + getAppearanceInjection(appearance, theme));
}

function injectIntoHead(html: string, injection: string): string {
  return html.replace(HEAD_OPEN_TAG, (head) => head + injection);
}

function getAppearanceInjection(appearance: WebViewAppearance, theme: WebViewTheme | null): string {
  if (appearance !== "obsidian") {
    return "";
  }

  return createObsidianAppearanceStyle() + createThemeInjection(theme);
}

function createThemeInjection(theme: WebViewTheme | null): string {
  if (!theme) {
    return "";
  }

  const safeTheme: WebViewTheme = {
    colorScheme: theme.colorScheme,
    variables: {},
  };
  for (const [name, value] of Object.entries(theme.variables)) {
    if (isAllowedThemeVariable(name) && typeof value === "string" && value.length > 0) {
      safeTheme.variables[name] = value;
    }
  }

  const payload = JSON.stringify(safeTheme);

  return `
  <script data-opencode-obsidian-theme>
  (function() {
    var theme = ${payload};
    var themeStyleId = 'opencode-theme';
      var observedThemeAttribute = null;
      var observedThemeStyleTextLength = null;
      var lastPointerPoint = null;
      var themeApplyCount = 0;
      var parentThemeUpdateCount = 0;
      var openCodeThemeMutationCount = 0;
        var bodyElementMutationCount = 0;
        var bodyMutationDiagnosticCount = 0;
        var bodyMutationObserverStarted = false;
        var pendingBodyMutationDiagnostics = null;
        var appliedThemeVariableNames = [];
        var appliedAliasVariableNames = [];
        function applyTheme() {
          themeApplyCount += 1;
          var root = document.documentElement;
          root.dataset.opencodeObsidianAppearance = 'obsidian';
          root.dataset.colorScheme = theme.colorScheme;
          root.dataset.opencodeObsidianWorkspaceBackground =
            theme.variables['--opencode-obsidian-workspace-background-state'] || 'disabled';
        root.style.colorScheme = theme.colorScheme;
        replaceRootVariables(root, theme.variables, appliedThemeVariableNames);
          appliedThemeVariableNames = Object.keys(theme.variables);
          appliedAliasVariableNames = replaceOpenCodeV2Aliases(root, appliedAliasVariableNames);
        }
        function replaceRootVariables(root, variables, previousNames) {
          previousNames.forEach(function(name) {
            if (!Object.prototype.hasOwnProperty.call(variables, name)) {
              root.style.removeProperty(name);
            }
          });
          Object.keys(variables).forEach(function(name) {
            root.style.setProperty(name, variables[name], 'important');
          });
        }
        function isThemePayload(value) {
          if (!value || typeof value !== 'object') return false;
          if (value.colorScheme !== 'light' && value.colorScheme !== 'dark') return false;
        if (!value.variables || typeof value.variables !== 'object' || Array.isArray(value.variables)) return false;
          return Object.keys(value.variables).every(function(name) {
            return /^--[-_a-zA-Z0-9]+$/.test(name) &&
              !/^--opencode-obsidian-editor-background-/.test(name) &&
              typeof value.variables[name] === 'string' &&
              value.variables[name].length > 0;
          });
      }
      function replaceTheme(nextTheme, reason) {
        if (!isThemePayload(nextTheme)) return;
        parentThemeUpdateCount += 1;
        theme = nextTheme;
        Object.keys(theme.variables).forEach(rememberDiagnosticVariable);
        applyTheme();
        readOpenCodeThemeState();
        postThemeDiagnostics(reason);
        scheduleThemeDiagnostics(reason + '-settled');
      }
      window.addEventListener('message', function(event) {
        if (event.source !== window.parent) return;
        var message = event.data;
        if (!message ||
          message.ns !== ${JSON.stringify(BRIDGE_NAMESPACE)} ||
          message.version !== ${JSON.stringify(BRIDGE_VERSION)} ||
          message.type !== ${JSON.stringify(BRIDGE_MESSAGES.themeUpdate)}
        ) {
          return;
        }
        replaceTheme(message.payload, 'parent-theme-update');
      });
      function readOpenCodeThemeState() {
        var themeStyle = document.getElementById(themeStyleId);
        observedThemeAttribute = document.documentElement.getAttribute('data-theme');
        observedThemeStyleTextLength = themeStyle ? themeStyle.textContent.length : null;
      }
      var diagnosticVariableNames = Array.from(new Set(Object.keys(theme.variables).concat([
        '--background-base',
        '--background-weak',
        '--background-strong',
        '--background-stronger',
        '--v2-background-bg-base',
        '--v2-background-bg-deep',
        '--background-bg-base',
        '--background-bg-layer-01',
        '--surface-raised-base',
        '--input-base',
        '--text-text-base',
        '--border-border-base'
      ])));
        function rememberDiagnosticVariable(name) {
          if (diagnosticVariableNames.indexOf(name) === -1) {
            diagnosticVariableNames.push(name);
          }
        }
        function replaceOpenCodeV2Aliases(root, previousAliases) {
          var nextAliases = [];
          var style = getComputedStyle(root);
          for (var index = 0; index < style.length; index++) {
            var name = typeof style.item === 'function' ? style.item(index) : style[index];
            if (typeof name !== 'string' || name.indexOf('--v2-') !== 0) {
              continue;
            }
            var alias = '--' + name.slice('--v2-'.length);
            if (nextAliases.indexOf(alias) === -1) {
              nextAliases.push(alias);
            }
            root.style.setProperty(alias, 'var(' + name + ')', 'important');
            rememberDiagnosticVariable(name);
            rememberDiagnosticVariable(alias);
          }
          previousAliases.forEach(function(name) {
            if (nextAliases.indexOf(name) === -1) {
              root.style.removeProperty(name);
            }
          });
          return nextAliases;
        }
      function isTransparentColor(color) {
      return color === '' ||
        color === 'transparent' ||
        color === 'rgba(0, 0, 0, 0)' ||
        /rgba\\([^)]*,\\s*0\\)/.test(color) ||
        /\\/\\s*0\\)?$/.test(color);
    }
      function isVisibleBackground(style) {
        var color = style.backgroundColor || '';
        var image = style.backgroundImage || '';
        var hasOpaqueColor = !isTransparentColor(color);
        return hasOpaqueColor || image !== 'none';
      }
      function backdropFilterValues(style) {
        if (!style) {
          return { backdropFilter: '', webkitBackdropFilter: '' };
        }
        return {
          backdropFilter: (style.backdropFilter || style.getPropertyValue('backdrop-filter') || '').trim(),
          webkitBackdropFilter: (
            style.webkitBackdropFilter ||
            style.getPropertyValue('-webkit-backdrop-filter') ||
            ''
          ).trim()
        };
      }
      function isActiveBackdropFilter(value) {
        var normalized = (value || '').trim().toLowerCase();
        return normalized !== '' &&
          normalized !== 'none' &&
          normalized !== 'initial' &&
          normalized !== 'inherit' &&
          normalized !== 'unset' &&
          normalized !== 'revert' &&
          normalized !== 'revert-layer';
      }
      function hasActiveBackdropFilter(values) {
        return isActiveBackdropFilter(values.backdropFilter) ||
          isActiveBackdropFilter(values.webkitBackdropFilter);
      }
      function describeElement(element) {
        if (!element) return null;
        var style = getComputedStyle(element);
        var rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      className: typeof element.className === 'string' ? element.className.slice(0, 180) : null,
        dataComponent: element.getAttribute('data-component'),
          dataSlot: element.getAttribute('data-slot'),
          dataDockSurface: element.getAttribute('data-dock-surface'),
          dataVariant: element.getAttribute('data-variant'),
          dataOrientation: element.getAttribute('data-orientation'),
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        color: style.color,
        opacity: style.opacity,
        position: style.position,
          zIndex: style.zIndex,
          tokenValues: pickElementTokens(style),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
            area: Math.round(rect.width * rect.height)
        };
        }
        function describeElementAtPoint(element) {
          var sample = describeElement(element);
          if (!sample || !element) return sample;
          var rect = element.getBoundingClientRect();
          sample.rect = {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
          sample.parentChain = collectParentChain(element, 4);
          return sample;
        }
        function describeNode(node) {
          if (!node) return null;
          if (node.nodeType === Node.ELEMENT_NODE) {
            return describeElement(node);
          }
          return {
            nodeType: node.nodeType,
            nodeName: node.nodeName,
            textLength: typeof node.textContent === 'string' ? node.textContent.length : null,
            parentElement: describeElement(node.parentElement)
          };
        }
        function collectSelectionDiagnostics() {
          var selection = window.getSelection ? window.getSelection() : null;
          if (!selection) return null;
          return {
            type: selection.type,
            isCollapsed: selection.isCollapsed,
            rangeCount: selection.rangeCount,
            textLength: selection.toString().length,
            anchorNode: describeNode(selection.anchorNode),
            focusNode: describeNode(selection.focusNode)
          };
        }
        function rememberPointerPoint(event) {
          var target = event.target instanceof Element ? event.target : null;
          lastPointerPoint = {
            type: event.type,
            x: Math.round(event.clientX),
            y: Math.round(event.clientY),
            pageX: Math.round(event.pageX),
            pageY: Math.round(event.pageY),
            screenX: Math.round(event.screenX),
            screenY: Math.round(event.screenY),
            button: event.button,
            buttons: event.buttons,
            pointerType: event.pointerType || null,
            isPrimary: typeof event.isPrimary === 'boolean' ? event.isPrimary : null,
            timeStamp: Math.round(event.timeStamp),
            target: describeElementAtPoint(target)
          };
        }
        function elementContainsPoint(element, point) {
          if (!element || !point) return false;
          var rect = element.getBoundingClientRect();
          return rect.width > 0 &&
            rect.height > 0 &&
            point.x >= rect.left &&
            point.x <= rect.right &&
            point.y >= rect.top &&
            point.y <= rect.bottom;
        }
        function collectElementsFromPoint(point) {
          if (!point) return [];
          if (typeof document.elementsFromPoint === 'function') {
            return document.elementsFromPoint(point.x, point.y);
          }
          var element = document.elementFromPoint(point.x, point.y);
          return element ? [element] : [];
        }
        function collectContainingElements(point) {
          if (!point || !document.body) return [];
          return allInspectableElements()
            .filter(function(element) {
              var style = getComputedStyle(element);
              return elementContainsPoint(element, point) &&
                style.visibility !== 'hidden' &&
                style.display !== 'none';
            })
            .map(function(element) {
              var rect = element.getBoundingClientRect();
              return { element: element, area: rect.width * rect.height };
            })
            .sort(function(left, right) {
              return left.area - right.area;
            })
            .slice(0, 40)
            .map(function(item) {
              return describeElementAtPoint(item.element);
            });
        }
        function collectVisibleLayersAtPoint(point) {
          if (!point || !document.body) return [];
          return allInspectableElements()
            .filter(function(element) {
              var style = getComputedStyle(element);
              return elementContainsPoint(element, point) &&
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                (isVisibleBackground(style) || style.boxShadow !== 'none' || style.opacity !== '1');
            })
            .map(function(element) {
              var rect = element.getBoundingClientRect();
              return { element: element, area: rect.width * rect.height };
            })
            .sort(function(left, right) {
              return left.area - right.area;
            })
            .slice(0, 40)
            .map(function(item) {
              return describeElementAtPoint(item.element);
            });
        }
        function collectPseudoBackgroundsAtPoint(elements) {
          var result = [];
          elements.forEach(function(element) {
            ['::before', '::after'].forEach(function(pseudoElement) {
              var sample = describePseudoElement(element, pseudoElement);
              if (!sample) return;
              var visibleContent = sample.content && sample.content !== 'none' && sample.content !== 'normal';
              var hasBackground = !isTransparentColor(sample.backgroundColor || '') ||
                (sample.backgroundImage && sample.backgroundImage !== 'none');
              if (visibleContent && hasBackground) {
                result.push({
                  owner: describeElementAtPoint(element),
                  pseudoElement: pseudoElement,
                  background: sample
                });
              }
            });
          });
          return result.slice(0, 24);
        }
        function collectPointDiagnostics() {
          if (!lastPointerPoint) {
            return {
              point: null,
              elementsFromPoint: [],
              containingElements: [],
              visibleLayers: [],
              pseudoBackgrounds: [],
              activeElement: describeElement(document.activeElement),
              selection: collectSelectionDiagnostics()
            };
          }
          var point = {
            type: lastPointerPoint.type,
            x: lastPointerPoint.x,
            y: lastPointerPoint.y,
            pageX: lastPointerPoint.pageX,
            pageY: lastPointerPoint.pageY,
            screenX: lastPointerPoint.screenX,
            screenY: lastPointerPoint.screenY,
            button: lastPointerPoint.button,
            buttons: lastPointerPoint.buttons,
            pointerType: lastPointerPoint.pointerType,
            isPrimary: lastPointerPoint.isPrimary,
            timeStamp: lastPointerPoint.timeStamp,
            target: lastPointerPoint.target
          };
          var pointElements = collectElementsFromPoint(point);
          return {
            point: point,
            elementsFromPoint: pointElements.slice(0, 32).map(describeElementAtPoint),
            containingElements: collectContainingElements(point),
            visibleLayers: collectVisibleLayersAtPoint(point),
            pseudoBackgrounds: collectPseudoBackgroundsAtPoint(pointElements),
            activeElement: describeElementAtPoint(document.activeElement),
            selection: collectSelectionDiagnostics()
          };
        }
        function pickElementTokens(style) {
        return [
          '--background-base',
          '--background-weak',
          '--background-strong',
          '--background-stronger',
          '--surface-raised-stronger-non-alpha',
          '--surface-stronger-non-alpha',
          '--v2-background-bg-base',
          '--v2-background-bg-layer-01',
          '--v2-background-bg-layer-02',
          '--v2-background-bg-layer-03',
          '--v2-background-bg-layer-04'
        ].reduce(function(result, name) {
          result[name] = style.getPropertyValue(name).trim();
          return result;
        }, {});
      }
      function collectParentChain(element, limit) {
        var result = [];
        var current = element ? element.parentElement : null;
        while (current && result.length < limit) {
          result.push(describeElement(current));
          current = current.parentElement;
        }
        return result;
      }
      function allInspectableElements() {
        var elements = [];
        if (document.documentElement) elements.push(document.documentElement);
        if (document.body) elements.push(document.body);
        var root = document.getElementById('root');
        if (root && elements.indexOf(root) === -1) elements.push(root);
        if (document.body) {
          Array.prototype.forEach.call(document.body.querySelectorAll('*'), function(element) {
            if (elements.indexOf(element) === -1) {
              elements.push(element);
            }
          });
        }
        return elements;
      }
      function describePseudoElement(element, pseudoElement) {
      if (!element) return null;
      var style = getComputedStyle(element, pseudoElement);
        return {
          pseudoElement: pseudoElement,
          content: style.content,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          backgroundPosition: style.backgroundPosition,
          backgroundSize: style.backgroundSize,
          backgroundRepeat: style.backgroundRepeat,
          backgroundBlendMode: style.backgroundBlendMode,
          left: style.left,
          top: style.top,
          width: style.width,
            height: style.height,
            opacity: style.opacity,
            filter: style.filter,
            zIndex: style.zIndex
        };
      }
      function describeBackdropFilterTarget(element, pseudoElement) {
        if (!element) return null;
        var style = pseudoElement ? getComputedStyle(element, pseudoElement) : getComputedStyle(element);
        var values = backdropFilterValues(style);
        if (!hasActiveBackdropFilter(values)) {
          return null;
        }
        var rect = element.getBoundingClientRect();
        return {
          owner: describeElement(element),
          pseudoElement: pseudoElement || null,
          backdropFilter: values.backdropFilter || null,
          webkitBackdropFilter: values.webkitBackdropFilter || null,
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          area: Math.round(rect.width * rect.height)
        };
      }
      function rootVariables() {
        var style = getComputedStyle(document.documentElement);
        return diagnosticVariableNames.reduce(function(result, name) {
          result[name] = style.getPropertyValue(name).trim();
          return result;
        }, {});
      }
      function rootInlineVariables() {
        var style = document.documentElement.style;
        return diagnosticVariableNames.reduce(function(result, name) {
          result[name] = style.getPropertyValue(name).trim();
          return result;
        }, {});
      }
      function collectInjectionState() {
        return {
          bridgeScriptCount: document.querySelectorAll('script[data-opencode-obsidian-bridge]').length,
          appearanceStyleCount: document.querySelectorAll('style[data-opencode-obsidian-appearance]').length,
          themeScriptCount: document.querySelectorAll('script[data-opencode-obsidian-theme]').length,
          themeApplyCount: themeApplyCount,
          parentThemeUpdateCount: parentThemeUpdateCount,
          openCodeThemeMutationCount: openCodeThemeMutationCount,
          bodyElementMutationCount: bodyElementMutationCount,
          bodyMutationDiagnosticCount: bodyMutationDiagnosticCount,
          bodyMutationObserverStarted: bodyMutationObserverStarted,
          pendingBodyMutationDiagnostics: pendingBodyMutationDiagnostics !== null
        };
      }
  function collectVisibleBackgrounds() {
    if (!document.body) {
      return [];
    }
      var minArea = Math.max(2000, window.innerWidth * window.innerHeight * 0.04);
      return allInspectableElements()
      .map(function(element) {
        var style = getComputedStyle(element);
        var rect = element.getBoundingClientRect();
        return { element: element, style: style, rect: rect, area: rect.width * rect.height };
      })
      .filter(function(item) {
        return item.area >= minArea && isVisibleBackground(item.style);
      })
      .sort(function(left, right) {
        return right.area - left.area;
      })
      .slice(0, 12)
        .map(function(item) {
          return describeElement(item.element);
        });
    }
    function collectSurfaceSamples() {
      if (!document.body) {
        return [];
      }
        var minArea = Math.max(360, window.innerWidth * window.innerHeight * 0.008);
        return allInspectableElements()
        .map(function(element) {
          var style = getComputedStyle(element);
          var rect = element.getBoundingClientRect();
          return { element: element, style: style, rect: rect, area: rect.width * rect.height };
        })
        .filter(function(item) {
          return item.area >= minArea &&
            item.rect.width > 0 &&
            item.rect.height > 0 &&
            item.style.visibility !== 'hidden' &&
            item.style.display !== 'none' &&
            (isVisibleBackground(item.style) ||
              item.style.boxShadow !== 'none' ||
                item.element.getAttribute('data-component') ||
                item.element.getAttribute('data-slot') ||
                item.element.getAttribute('data-dock-surface'));
        })
        .sort(function(left, right) {
          return right.area - left.area;
        })
        .slice(0, 32)
          .map(function(item) {
            return describeElement(item.element);
          });
      }
      function collectLargeElementSamples() {
        if (!document.body) {
          return [];
        }
        var minArea = Math.max(2000, window.innerWidth * window.innerHeight * 0.08);
        return allInspectableElements()
          .map(function(element) {
            var style = getComputedStyle(element);
            var rect = element.getBoundingClientRect();
            return { element: element, style: style, rect: rect, area: rect.width * rect.height };
          })
          .filter(function(item) {
            return item.area >= minArea &&
              item.rect.width > 0 &&
              item.rect.height > 0 &&
              item.style.visibility !== 'hidden' &&
              item.style.display !== 'none';
          })
          .sort(function(left, right) {
            return right.area - left.area;
          })
          .slice(0, 16)
          .map(function(item) {
            var sample = describeElement(item.element);
            sample.parentChain = collectParentChain(item.element, 4);
            return sample;
          });
      }
      function collectPseudoBackgrounds() {
      if (!document.body) {
        return [];
      }
      var minArea = Math.max(1200, window.innerWidth * window.innerHeight * 0.02);
      var result = [];
      Array.prototype.slice.call(document.body.querySelectorAll('*')).forEach(function(element) {
        var rect = element.getBoundingClientRect();
        if (rect.width * rect.height < minArea) return;
        ['::before', '::after'].forEach(function(pseudoElement) {
          var sample = describePseudoElement(element, pseudoElement);
          if (!sample) return;
          var visibleContent = sample.content && sample.content !== 'none' && sample.content !== 'normal';
          var hasBackground = !isTransparentColor(sample.backgroundColor || '') ||
            (sample.backgroundImage && sample.backgroundImage !== 'none');
          if (visibleContent && hasBackground) {
            result.push({
              owner: describeElement(element),
              pseudoElement: pseudoElement,
              background: sample
            });
          }
        });
      });
        return result.slice(0, 16);
      }
      function collectBackdropFilterSamples() {
        if (!document.body) {
          return [];
        }
        var result = [];
        allInspectableElements().forEach(function(element) {
          var elementSample = describeBackdropFilterTarget(element, null);
          if (elementSample) {
            result.push(elementSample);
          }
          ['::before', '::after'].forEach(function(pseudoElement) {
            var pseudoSample = describeBackdropFilterTarget(element, pseudoElement);
            if (pseudoSample) {
              result.push(pseudoSample);
            }
          });
        });
        return result.slice(0, 24);
      }
      function postThemeDiagnostics(reason) {
        try {
          var payload = {
            reason: reason,
            url: location.href,
            viewport: { width: window.innerWidth, height: window.innerHeight },
              observedOpenCodeTheme: {
                dataTheme: observedThemeAttribute,
                styleTextLength: observedThemeStyleTextLength
              },
                sourceBoundary: sourceBoundary(),
              variables: rootVariables(),
            inlineVariables: rootInlineVariables(),
            injectionState: collectInjectionState(),
            roots: [
              describeElement(document.documentElement),
              describeElement(document.body),
              describeElement(document.getElementById('root'))
            ],
            appearanceBackground: describePseudoElement(document.body, '::before'),
            appearanceImageBackground: describePseudoElement(document.body, '::after'),
            visibleBackgrounds: collectVisibleBackgrounds(),
              surfaceSamples: collectSurfaceSamples(),
                largeElementSamples: collectLargeElementSamples(),
                iframePointDiagnostics: collectPointDiagnostics(),
                pseudoBackgrounds: collectPseudoBackgrounds(),
                backdropFilterSamples: collectBackdropFilterSamples()
              };
          window.parent.postMessage({
            ns: ${JSON.stringify(BRIDGE_NAMESPACE)},
            version: ${JSON.stringify(BRIDGE_VERSION)},
            type: ${JSON.stringify(BRIDGE_MESSAGES.themeDiagnostics)},
            payload: payload
          }, '*');
        } catch (error) {
          window.parent.postMessage({
            ns: ${JSON.stringify(BRIDGE_NAMESPACE)},
            version: ${JSON.stringify(BRIDGE_VERSION)},
            type: ${JSON.stringify(BRIDGE_MESSAGES.themeDiagnostics)},
            payload: {
              reason: reason,
              url: location.href,
              error: error instanceof Error ? error.message : String(error)
            }
          }, '*');
        }
      }
        function scheduleThemeDiagnostics(reason) {
        setTimeout(function() {
          readOpenCodeThemeState();
          postThemeDiagnostics(reason);
        }, 120);
      }
        function scheduleSettledThemeDiagnostics(reason, delay) {
          setTimeout(function() {
            readOpenCodeThemeState();
            postThemeDiagnostics(reason);
          }, delay);
        }
            function observeOpenCodeThemeMutations() {
          var root = document.documentElement;
        var observer = new MutationObserver(function(mutations) {
          var shouldApply = false;
          mutations.forEach(function(mutation) {
            if (
              mutation.type === 'attributes' &&
            mutation.target === root &&
            mutation.attributeName === 'data-theme'
          ) {
            shouldApply = true;
          }
          if (
            mutation.type === 'childList' &&
            Array.prototype.some.call(mutation.addedNodes, function(node) {
              return node instanceof HTMLElement && node.id === themeStyleId;
            })
          ) {
            shouldApply = true;
          }
          if (
            mutation.type === 'characterData' &&
            mutation.target.parentElement &&
            mutation.target.parentElement.id === themeStyleId
          ) {
            shouldApply = true;
          }
            if (
              mutation.type === 'childList' &&
              mutation.target instanceof HTMLElement &&
              mutation.target.id === themeStyleId
            ) {
              shouldApply = true;
            }
          });
          if (shouldApply) {
            openCodeThemeMutationCount += 1;
            applyTheme();
            readOpenCodeThemeState();
            scheduleThemeDiagnostics('opencode-theme-mutated');
          }
        });
          observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
          observer.observe(document.head, { childList: true, subtree: true, characterData: true });
        }
          function sourceBoundary() {
            var style = getComputedStyle(document.documentElement);
            var workspaceBackgroundState = style.getPropertyValue(
              '--opencode-obsidian-workspace-background-state'
            ).trim();
            var workspaceBackgroundContract = style.getPropertyValue(
              '--opencode-obsidian-workspace-background-contract'
            ).trim();
              var paintedBackgroundImage = style.getPropertyValue(
                '--opencode-obsidian-workspace-background-image'
              ).trim();
              return {
                contract: 'obsidian-workspace-background-v1',
                workspaceBackgroundContract: workspaceBackgroundContract || null,
                workspaceBackgroundState: workspaceBackgroundState || null,
                activeEditorProjected: false,
                paintedBackgroundImage: paintedBackgroundImage || null
              };
            }
          function scheduleBodyMutationDiagnostics() {
            if (pendingBodyMutationDiagnostics !== null) {
              return;
            }
            pendingBodyMutationDiagnostics = setTimeout(function() {
              pendingBodyMutationDiagnostics = null;
              bodyMutationDiagnosticCount += 1;
              readOpenCodeThemeState();
              postThemeDiagnostics('body-mutated');
              scheduleSettledThemeDiagnostics('body-settled-600', 600);
            }, 80);
          }
          function observeBodyMutations() {
            if (bodyMutationObserverStarted || !document.body) {
              return;
            }
            bodyMutationObserverStarted = true;
            var observer = new MutationObserver(function(mutations) {
              var hasElementMutation = mutations.some(function(mutation) {
                return Array.prototype.some.call(mutation.addedNodes, function(node) {
                  return node instanceof HTMLElement;
                }) || Array.prototype.some.call(mutation.removedNodes, function(node) {
                  return node instanceof HTMLElement;
                });
              });
              if (hasElementMutation) {
                bodyElementMutationCount += 1;
                scheduleBodyMutationDiagnostics();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
      applyTheme();
      readOpenCodeThemeState();
        postThemeDiagnostics('after-apply');
      scheduleThemeDiagnostics('initial');
      scheduleSettledThemeDiagnostics('settled-600', 600);
        scheduleSettledThemeDiagnostics('settled-1500', 1500);
            observeOpenCodeThemeMutations();
              observeBodyMutations();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
              applyTheme();
              readOpenCodeThemeState();
              observeBodyMutations();
              scheduleThemeDiagnostics('dom-content-loaded');
              scheduleSettledThemeDiagnostics('dom-settled-900', 900);
            }, { once: true });
        }
        window.addEventListener('load', function() {
            applyTheme();
            readOpenCodeThemeState();
            observeBodyMutations();
            scheduleThemeDiagnostics('load');
        scheduleSettledThemeDiagnostics('load-settled-900', 900);
      }, { once: true });
  })();
  </script>
  `;
}

function isAllowedThemeVariable(name: string): boolean {
  return /^--[-_a-zA-Z0-9]+$/.test(name) && !/^--opencode-obsidian-editor-background-/.test(name);
}
