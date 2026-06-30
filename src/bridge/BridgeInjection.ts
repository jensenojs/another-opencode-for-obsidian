import { BRIDGE_MESSAGES, BRIDGE_NAMESPACE, BRIDGE_VERSION } from "./BridgeProtocol";

// Iframe-side hook installer. It captures OpenCode Web UI actions and emits
// local bridge messages; future live Web UI actions should arrive here as typed
// adapter commands from the context layer.
export function createBridgeScript(): string {
  return `
<script data-another-opencode-for-obsidian-bridge>
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
      name: 'session-review-line',
      eventTargetSelector: '[data-line], [data-alt-line]',
      containerSelector: '[data-slot="session-review-accordion-item"], [data-file]',
      attribute: 'data-file'
    },
    {
      name: 'file-tab-line',
      eventTargetSelector: '[data-line], [data-alt-line]',
      containerSelector: '[data-slot="tabs-content"]',
      fileTabPath: true
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
  function extractVaultPathFromFileUrlValue(value) {
    if (typeof value !== 'string') return null;
    var marker = 'file://';
    var index = value.indexOf(marker);
    if (index === -1) return null;
    var encodedPath = value.slice(index + marker.length);
    if (!encodedPath) return null;
    try {
      return cleanVaultPath(decodeURIComponent(encodedPath));
    } catch (_error) {
      return null;
    }
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
  function pathFromFileTabPanel(path, selector) {
    var panel = closestFromPath(path, selector);
    if (!panel) return null;
    return (
      extractVaultPathFromFileUrlValue(panel.getAttribute('id')) ||
      extractVaultPathFromFileUrlValue(panel.getAttribute('aria-labelledby'))
    );
  }
  function pathFromRule(path, rule) {
    if (rule.eventTargetSelector && !closestFromPath(path, rule.eventTargetSelector)) {
      return null;
    }
    if (rule.fileTabPath) {
      return pathFromFileTabPanel(path, rule.containerSelector);
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
  function isNativeCommentControl(path) {
    return Boolean(
      closestFromPath(
        path,
        'button[aria-label="评论"], button[aria-label="Comment"], textarea, input, [slot="gutter-utility-slot"], [slot^="annotation-"]'
      )
    );
  }
  function vaultFileClickFromEvent(e) {
    var path = eventPath(e);
    if (isNativeCommentControl(path)) return null;
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
    var cursor = value ? 'pointer' : '';
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
    return e.type === 'click' && e.button === 0;
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
      var promptContextGetter = null;
      var promptContextActivationEntries = Object.create(null);
      var promptContextLastFingerprint = null;
      var promptContextLastItems = [];
      var promptContextPollTimer = null;
      var keyboardCatalogGetter = null;
      var keyboardLastFingerprint = null;
      var keyboardPollTimer = null;
      var keyboardPolicyRevision = 0;
      var keyboardPolicy = Object.create(null);
  function clonePromptContextItem(item) {
    if (!item || typeof item !== 'object') return item;
    var clone = {};
    for (var key in item) clone[key] = item[key];
    if (item.selection) {
      clone.selection = {};
      for (var selectionKey in item.selection) clone.selection[selectionKey] = item.selection[selectionKey];
    }
    return clone;
  }
  function checksumPromptContextComment(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  function promptContextItemKey(item) {
    if (!item || item.type !== 'file') return item && item.type ? item.type : '';
    var selection = item.selection || {};
    var key = item.type + ':' + item.path + ':' + selection.startLine + ':' + selection.endLine;
    if (item.commentID) return key + ':c=' + item.commentID;
    var comment = typeof item.comment === 'string' ? item.comment.trim() : '';
    if (!comment) return key;
    return key + ':c=' + checksumPromptContextComment(comment).slice(0, 8);
  }
    function promptContextItems() {
      if (!promptContextGetter) return [];
      var context = promptContextGetter();
      if (!context || typeof context.items !== 'function') return [];
      return context.items().map(clonePromptContextItem);
    }
    function promptContextCommentKey(item) {
      if (!item || item.type !== 'file' || !item.commentID || !item.comment) return null;
      return item.path + '\\n' + item.commentID;
    }
    function classifyPromptContextChange(previousItems, nextItems) {
      var previousComments = Object.create(null);
      var nextComments = Object.create(null);
      for (var i = 0; i < previousItems.length; i += 1) {
        var previousKey = promptContextCommentKey(previousItems[i]);
        if (previousKey) previousComments[previousKey] = true;
      }
      for (var j = 0; j < nextItems.length; j += 1) {
        var nextKey = promptContextCommentKey(nextItems[j]);
        if (nextKey) nextComments[nextKey] = true;
      }
      for (var added in nextComments) {
        if (!previousComments[added]) return 'opencode-comment-add';
      }
      for (var removed in previousComments) {
        if (!nextComments[removed]) return 'opencode-comment-delete';
      }
      if (previousItems.length > 0 && nextItems.length === 0) return 'opencode-submit-clear';
      return 'unknown';
    }
  function findPromptContextItemByKey(key) {
    var items = promptContextItems();
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].key === key) return items[i];
    }
    return null;
  }
  function findPromptContextComment(path, commentID) {
    var items = promptContextItems();
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      if (item.type === 'file' && item.path === path && item.commentID === commentID) return item;
    }
    return null;
  }
  function promptContextPortUnavailable(reason, message) {
    post(messages.promptContextUnavailable, {
      reason: reason,
      message: message || undefined
    });
  }
  function getPromptContextStore() {
    if (!promptContextGetter) return null;
    var context = promptContextGetter();
    if (!context || typeof context.items !== 'function') return null;
    return context;
  }
    function emitPromptContextChanged(origin, transactionId) {
      var items = promptContextItems();
      promptContextLastItems = items.map(clonePromptContextItem);
      promptContextLastFingerprint = promptContextFingerprint();
      post(messages.promptContextChanged, {
        origin: origin || 'unknown',
        items: items,
        transactionId: transactionId || undefined
      });
    }
  function promptContextFingerprint() {
    try {
      return JSON.stringify(promptContextItems());
    } catch (_error) {
      return '';
    }
  }
    function startPromptContextPolling() {
      if (promptContextPollTimer) return;
      promptContextLastItems = promptContextItems();
      promptContextLastFingerprint = promptContextFingerprint();
      promptContextPollTimer = window.setInterval(function() {
        if (!promptContextGetter) return;
        var next = promptContextFingerprint();
        if (next === promptContextLastFingerprint) return;
        var previousItems = promptContextLastItems.map(clonePromptContextItem);
        var nextItems = promptContextItems();
        promptContextLastFingerprint = next;
        promptContextLastItems = nextItems.map(clonePromptContextItem);
        emitPromptContextChanged(classifyPromptContextChange(previousItems, nextItems));
      }, 500);
    }
    function runPromptContextCommand(command) {
      var context = getPromptContextStore();
      if (!context) {
        return { ok: false, error: 'prompt context port is not loaded' };
      }
    if (command.action === 'items') {
      return { ok: true, result: promptContextItems(), items: promptContextItems() };
    }
    if (command.action === 'add') {
      var item = clonePromptContextItem(command.item);
      var key = promptContextItemKey(item);
      var existing = findPromptContextItemByKey(key);
      if (existing) {
        var existingEntry = promptContextActivationEntries[key];
        if (existingEntry && existingEntry.projectionId === command.projectionId) {
          return {
            ok: true,
            result: { status: 'already-owned', key: key, item: existing, projectionId: command.projectionId },
            items: promptContextItems()
          };
        }
        return {
          ok: true,
          result: {
            status: 'conflict',
            key: key,
            existing: existing,
            reason: existingEntry ? 'key-owned-by-other-projection' : 'key-owned-by-opencode'
          },
          items: promptContextItems()
        };
      }
      context.add(item);
      var inserted = findPromptContextItemByKey(key) || Object.assign({ key: key }, item);
      promptContextActivationEntries[key] = {
        projectionId: command.projectionId,
        clickAction: command.clickAction || { type: 'none' }
      };
      emitPromptContextChanged('bridge-sync', command.transactionId);
      return {
        ok: true,
        result: { status: 'inserted', key: key, item: inserted },
        items: promptContextItems()
      };
    }
    if (command.action === 'remove') {
      var removed = findPromptContextItemByKey(command.key);
      context.remove(command.key);
      delete promptContextActivationEntries[command.key];
      emitPromptContextChanged('bridge-sync', command.transactionId);
      return {
        ok: true,
        result: removed ? { status: 'removed', key: command.key, item: removed } : { status: 'missing', key: command.key },
        items: promptContextItems()
      };
    }
    if (command.action === 'removeComment') {
      var comment = findPromptContextComment(command.path, command.commentID);
      if (comment) delete promptContextActivationEntries[comment.key];
      context.removeComment(command.path, command.commentID);
      emitPromptContextChanged('bridge-sync', command.transactionId);
      return {
        ok: true,
        result: comment ? { status: 'removed', key: comment.key, item: comment } : { status: 'missing', key: '' },
        items: promptContextItems()
      };
    }
    if (command.action === 'updateComment') {
      var previous = findPromptContextComment(command.path, command.commentID);
      context.updateComment(command.path, command.commentID, command.next || {});
      var updated = findPromptContextComment(command.path, command.commentID);
      if (!previous || !updated) {
        return {
          ok: true,
          result: { status: 'missing', path: command.path, commentID: command.commentID },
          items: promptContextItems()
        };
      }
      var entry = promptContextActivationEntries[previous.key];
      if (entry) {
        delete promptContextActivationEntries[previous.key];
        promptContextActivationEntries[updated.key] = entry;
      }
      emitPromptContextChanged('bridge-sync', command.transactionId);
      return {
        ok: true,
        result: { status: 'updated', key: updated.key, previous: previous, item: updated },
        items: promptContextItems()
      };
    }
    if (command.action === 'replaceComments') {
      context.replaceComments(command.items || []);
      emitPromptContextChanged('bridge-sync', command.transactionId);
      return {
        ok: true,
        result: { status: 'replaced', keys: promptContextItems().map(function(item) { return item.key; }) },
        items: promptContextItems()
      };
      }
      return { ok: false, error: 'unknown prompt context command' };
    }
    function directPromptContextCommand(action, payload) {
      var command = Object.assign(
        {
          action: action,
          transactionId: 'direct:' + Date.now() + ':' + Math.random().toString(36).slice(2)
        },
        payload || {}
      );
      return runPromptContextCommand(command);
    }
    window.__anotherOpenCodeForObsidianPromptContext = {
      items: function() {
        return promptContextItems();
      },
      add: function(item, projectionId, clickAction) {
        return directPromptContextCommand('add', {
          item: item,
          projectionId: projectionId || 'direct',
          clickAction: clickAction || { type: 'none' }
        }).result;
      },
      remove: function(key) {
        return directPromptContextCommand('remove', { key: key }).result;
      },
      removeComment: function(path, commentID) {
        return directPromptContextCommand('removeComment', { path: path, commentID: commentID }).result;
      },
      updateComment: function(path, commentID, next) {
        return directPromptContextCommand('updateComment', {
          path: path,
          commentID: commentID,
          next: next || {}
        }).result;
      },
      replaceComments: function(items) {
        return directPromptContextCommand('replaceComments', { items: items || [] }).result;
      }
    };
    window.__anotherOpenCodeForObsidianInstallPromptContextPort = function(getContext) {
      promptContextGetter = typeof getContext === 'function' ? getContext : null;
      if (!promptContextGetter) {
        promptContextPortUnavailable('port-not-loaded', 'Prompt context getter was not callable');
      return;
    }
    post(messages.promptContextReady, {
      available: true,
      itemCount: promptContextItems().length
    });
    emitPromptContextChanged('bridge-sync');
    startPromptContextPolling();
  };
    window.__anotherOpenCodeForObsidianPromptContextHooks = {
        activated: function(item) {
          var key = item && item.key ? item.key : promptContextItemKey(item);
          var entry = promptContextActivationEntries[key];
        post(messages.promptContextActivated, {
          key: key,
          item: clonePromptContextItem(item)
        });
        return !(entry && entry.clickAction && entry.clickAction.type === 'obsidian-open');
      },
    removed: function(item) {
      var key = item && item.key ? item.key : promptContextItemKey(item);
      delete promptContextActivationEntries[key];
      post(messages.promptContextRemoved, {
        key: key,
        origin: 'card-close',
        item: clonePromptContextItem(item)
      });
        return true;
      }
    };
    function cloneKeyboardCatalogItem(item) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
        return null;
      }
      var clone = { id: item.id };
      if (typeof item.title === 'string') clone.title = item.title;
      if (typeof item.description === 'string') clone.description = item.description;
      if (typeof item.category === 'string') clone.category = item.category;
      if (typeof item.keybind === 'string') clone.keybind = item.keybind;
      if (typeof item.disabled === 'boolean') clone.disabled = item.disabled;
      if (typeof item.hidden === 'boolean') clone.hidden = item.hidden;
      return clone;
    }
    function keyboardPortUnavailable(reason, message) {
      post(messages.keyboardUnavailable, {
        reason: reason,
        message: message || undefined
      });
    }
    function keyboardCatalogItemsFrom(value) {
      var raw = typeof value === 'function' ? value() : value;
      if (!Array.isArray(raw)) return [];
      var items = [];
      for (var i = 0; i < raw.length; i += 1) {
        var item = cloneKeyboardCatalogItem(raw[i]);
        if (item) items.push(item);
      }
      return items;
    }
    function keyboardCatalogSnapshot() {
      if (!keyboardCatalogGetter) return null;
      var port = keyboardCatalogGetter();
      if (!port || typeof port !== 'object') return null;
      return {
        available: true,
        options: keyboardCatalogItemsFrom(port.options),
        catalog: keyboardCatalogItemsFrom(port.catalog)
      };
    }
    function keyboardCatalogFingerprint() {
      try {
        return JSON.stringify(keyboardCatalogSnapshot());
      } catch (_error) {
        return '';
      }
    }
    function emitKeyboardCatalogChanged() {
      var snapshot = keyboardCatalogSnapshot();
      if (!snapshot) {
        keyboardPortUnavailable('port-not-loaded', 'Keyboard command catalog port is not loaded');
        return;
      }
      post(messages.keyboardCatalogChanged, snapshot);
    }
    function startKeyboardCatalogPolling() {
      if (keyboardPollTimer) return;
      keyboardLastFingerprint = keyboardCatalogFingerprint();
      keyboardPollTimer = window.setInterval(function() {
        if (!keyboardCatalogGetter) return;
        var next = keyboardCatalogFingerprint();
        if (next === keyboardLastFingerprint) return;
        keyboardLastFingerprint = next;
        emitKeyboardCatalogChanged();
      }, 1000);
    }
    window.__anotherOpenCodeForObsidianInstallKeyboardPort = function(getCatalog) {
      keyboardCatalogGetter = typeof getCatalog === 'function' ? getCatalog : null;
      if (!keyboardCatalogGetter) {
        keyboardPortUnavailable('port-not-loaded', 'Keyboard catalog getter was not callable');
        return;
      }
      var snapshot = keyboardCatalogSnapshot();
      if (!snapshot) {
        keyboardPortUnavailable('port-not-loaded', 'Keyboard command catalog was not callable');
        return;
      }
      post(messages.keyboardReady, snapshot);
      emitKeyboardCatalogChanged();
      startKeyboardCatalogPolling();
    };
    function isNormalizedKeyboardSignature(value) {
      if (typeof value !== 'string' || !value) return false;
      return /^[a-z0-9._-]+(?:\\+[a-z0-9._-]+)*$/.test(value);
    }
    function applyKeyboardPolicyUpdate(payload) {
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.entries)) return;
      if (typeof payload.revision !== 'number' || payload.revision < keyboardPolicyRevision) return;
      var next = Object.create(null);
      for (var i = 0; i < payload.entries.length; i += 1) {
        var entry = payload.entries[i];
        if (!entry || typeof entry !== 'object') continue;
        if (!isNormalizedKeyboardSignature(entry.signature)) continue;
        if (entry.owner !== 'obsidian' && entry.owner !== 'opencode') continue;
        if (entry.commandId !== undefined && typeof entry.commandId !== 'string') continue;
        next[entry.signature] = {
          signature: entry.signature,
          owner: entry.owner,
          commandId: entry.commandId,
          display: typeof entry.display === 'string' ? entry.display : entry.signature
        };
      }
      keyboardPolicyRevision = payload.revision;
      keyboardPolicy = next;
    }
    function normalizeKeyboardKey(value) {
      if (typeof value !== 'string') return '';
      if (value === ',') return 'comma';
      if (value === '+') return 'plus';
      if (value === ' ') return 'space';
      if (value === 'Esc') return 'escape';
      return value.toLowerCase();
    }
    function keyboardSignatureFromEvent(event) {
      var key = normalizeKeyboardKey(event.key);
      if (!key || key === 'control' || key === 'ctrl' || key === 'meta' || key === 'shift' || key === 'alt') {
        return null;
      }
      var parts = [];
      if (event.ctrlKey) parts.push('ctrl');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      if (event.metaKey) parts.push('meta');
      parts.push(key);
      return parts.join('+');
    }
    function keyboardMessageHandler(event) {
      var data = event.data;
      if (!data || data.ns !== ns || data.version !== version || data.type !== messages.keyboardPolicyUpdate) return;
      applyKeyboardPolicyUpdate(data.payload);
    }
    function keyboardHandler(event) {
      if (event.defaultPrevented) return;
      var signature = keyboardSignatureFromEvent(event);
      if (!signature) return;
      var entry = keyboardPolicy[signature];
      if (!entry || entry.owner !== 'obsidian' || !entry.commandId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      post(messages.keyboardDispatch, {
        signature: signature,
        commandId: entry.commandId,
        display: entry.display || signature
      });
    }
    function promptContextCommandHandler(event) {
      var data = event.data;
      if (!data || data.ns !== ns || data.version !== version || data.type !== messages.promptContextCommand) return;
      var command = data.payload;
    if (!command || typeof command.transactionId !== 'string' || typeof command.action !== 'string') return;
    try {
      var result = runPromptContextCommand(command);
      post(messages.promptContextCommandResult, {
        transactionId: command.transactionId,
        action: command.action,
        ok: !!result.ok,
        result: result.result,
        items: result.items,
        error: result.error
      });
    } catch (error) {
      post(messages.promptContextCommandResult, {
        transactionId: command.transactionId,
        action: command.action,
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    }
    }
    window.addEventListener('message', promptContextCommandHandler, true);
    window.addEventListener('message', keyboardMessageHandler, true);
    window.setTimeout(function() {
      if (!promptContextGetter) promptContextPortUnavailable('port-not-loaded', 'Prompt context port did not load');
    }, 5000);
    window.setTimeout(function() {
      if (!keyboardCatalogGetter) keyboardPortUnavailable('port-not-loaded', 'Keyboard command catalog port did not load');
    }, 5000);
    post(messages.proxyLoaded);
    document.addEventListener('pointermove', vaultFileHoverHandler, true);
    document.addEventListener('pointerleave', hideHoverIndicator, true);
    document.addEventListener('click', vaultFileClickHandler, true);
    document.addEventListener('contextmenu', vaultFileClickHandler, true);
    window.addEventListener('keydown', keyboardHandler, true);
    document.addEventListener('keydown', keyboardHandler, true);
  })();
  </script>
  `;
}
