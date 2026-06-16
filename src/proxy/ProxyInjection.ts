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
  function post(type, payload) {
    window.parent.postMessage({ ns: ns, version: version, type: type, payload: payload }, '*');
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
