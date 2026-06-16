# Obsidian Background Ownership Analysis

Date: 2026-06-14

Repo: `/Users/oujinsai/Projects/another-opencode-for-obsidian`

Related repo: `/Users/oujinsai/Projects/obsidian-editor-background`

This document is self-contained. It explains the visual problem, the frontend concepts needed to reason about it, the relevant local code paths, the A/B/C/D attempts, why the attempts did not produce a clean result, and what should happen next.

It is written for a reader who does not have frontend development experience.

## Executive Summary

The user enabled an Obsidian background-image plugin and wants OpenCode Web UI to feel like part of the same Obsidian workspace.

The user does not need mathematical perfection. The user can accept some cropping, edge loss, and mild difference between panes. The user cannot accept black blocks, flickering local brightness, click-dependent changes, resize black frames, or selector-by-selector compensation.

The visible failure is not only a color mismatch. It is a mismatch between several rendering layers:

- the Background plugin draws an image inside editor surfaces;
- Obsidian and CodeMirror draw focus, active-line, selection, metadata, split, tab, and workspace chrome layers;
- OpenCode runs inside an iframe with its own document, body, root, surfaces, and compositor layer;
- clicking the iframe changes focus state in the parent Obsidian workspace and can trigger repaint or recomposition;
- transparent and semi-transparent layers reveal different pixels depending on what sits below them.

The important distinction is:

- Background plugin owns the background image variables and editor pseudo-elements.
- It does not own the final pixels of the whole workspace.

That distinction is the reason the problem is hard.

The current Background plugin paints the image on `.markdown-reading-view::before` and `.cm-editor::before`. Each editor surface owns its own `background-size: cover` calculation. OpenCode pane is not inside that editor surface. If OpenCode wants the image, it has to copy, project, or reveal it. Each option has a different failure mode.

The attempts produced these results:

- A, material-only: stable, but OpenCode becomes a large dark/material pane and cuts away too much of the image.
- B, independent full image: equivalent to D in the current code path; visually pleasant but each pane crops the image independently.
- C, active editor projection: closer to image continuity, but still exposes parent workspace/editor layers and tends toward compensation code.
- D, iframe-owned body CSS background: best subjective transparency, but left and right panes crop the same image differently, so the boundary remains visible.

Under the current constraints, there is no clean solution inside `another-opencode-for-obsidian` that satisfies all goals:

- do not modify the user vault;
- do not patch `/Users/oujinsai/Projects/obsidian-editor-background`;
- do not modify upstream OpenCode components;
- do not rely on transparent iframe compositing;
- do not hide specific Obsidian/CodeMirror selectors as compensation;
- do not accept black blocks or flickering local overlays;
- preserve the meaning of the user's full background image.

The clean architectural direction is to move the background owner upward:

The background image should be drawn once behind the whole Obsidian workspace/window. Editor, side panes, and OpenCode should all be semi-transparent material above that single background. OpenCode should not copy or project the image.

That experiment belongs in the Background plugin or in a dedicated workspace-level background integration. It does not belong in `another-opencode-for-obsidian`.

The immediate recommendation for `another-opencode-for-obsidian`:

- Stop trying to make C the production model.
- Delete active-editor projection logic from production.
- Choose one product stance:
  - Stable default A: no image in iframe, only Obsidian material.
  - Optional visual D: iframe paints one image layer as a best-effort visual mode, explicitly not guaranteed to be continuous.
- Keep diagnostics that explain parent editor layers, but do not patch those layers.
- Write a separate experiment for workspace-level background ownership in `obsidian-editor-background`.

## Scope

This document answers these questions:

- What exactly is being rendered on screen?
- Why does clicking inside OpenCode affect the apparent brightness of the main editor?
- Why does a local region flicker or change color?
- Why is this not fixed by copying a color from Obsidian sidebars?
- What do A, B, C, and D mean?
- Why did each attempt fail or fall short?
- Where is the correct implementation boundary?
- What code should be kept, deleted, or downgraded?
- What should be tested next?

This document does not implement the next solution.

This document does not claim that the current code is clean. The current working tree contains experimental changes from A, C, D, and a chrome-color attempt. The code should be cleaned after the decision is made.

## Vocabulary

### Pixel

A pixel is the final color on the screen.

When a UI is opaque, the final pixel is usually easy to understand: the topmost element paints a color, and that color is what the user sees.

When a UI is transparent or semi-transparent, the final pixel is a mixture of several layers.

For example:

```text
 final pixel
 = background image pixel
 + dark overlay alpha
 + editor active line alpha
 + text antialiasing
 + selection overlay
 + iframe document background
 + OpenCode local surface
```

This is why a small change in focus can make a region look like the background changed. The background image may be unchanged. The overlay above it changed.

### Background image

The background image is the user's picture, currently set by the Background plugin through CSS custom properties:

```text
--obsidian-editor-background-image
--obsidian-editor-background-opacity
--obsidian-editor-background-bluriness
--obsidian-editor-background-position
```

These variables are written on `document.body` by the Background plugin.

### Background owner

The background owner is the component that decides where the image is painted and which rectangle is used as the image's coordinate system.

This is not the same as “who sets the image URL.”

The Background plugin sets the image URL. But its current CSS paints the image inside editor surfaces. Therefore the current background owner, in the visual sense, is each editor surface.

### Final-pixel owner

The final-pixel owner is the layer that actually determines the visible screen color at a location.

There can be several logical owners before the final pixel:

- Background plugin owns an image pseudo-element.
- CodeMirror owns active-line and selection layers.
- Obsidian owns workspace chrome and active leaf classes.
- OpenCode owns its iframe document and internal UI surfaces.
- Electron/Chromium owns composition between parent window and iframe.

The user sees the result after all of these layers combine.

### Surface

A surface is a UI panel, card, editor, input area, tab, dock, or other visible region. It often has a background color, alpha, border, shadow, or blur.

In this problem, surfaces matter because semi-transparent surfaces allow the background image or lower layers to show through.

### Material

Material means a semi-transparent UI surface derived from theme colors. It is not a literal CSS standard term here. It means:

```text
background = color-mix(theme-color, transparent)
border = theme border with alpha
text = theme text
```

A material surface can feel native to Obsidian without copying the background image.

### `cover`

`background-size: cover` means the image is scaled so that it covers the entire element rectangle while preserving aspect ratio. If the element's aspect ratio differs from the image, part of the image is cropped.

Reference: MDN says `background-size` controls the size of an element's background image and can constrain it to the available space: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-size

The important consequence:

Two different rectangles using `cover` on the same image will usually show different crops.

### Pseudo-element

`::before` and `::after` are pseudo-elements. CSS can paint them as if they were child layers of an element.

The Background plugin uses `::before` to paint the image inside editors.

### Stacking context

A stacking context is a local z-order world. Children inside one stacking context are ordered relative to each other, then the whole context is treated as one unit by the parent.

Reference: MDN describes stacking contexts as atomic units in their parent stacking context: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context

This matters because moving a background layer behind all content without interfering with clicks is a z-index and stacking-context problem.

### Iframe

An iframe is a nested browsing context. It embeds another HTML page inside the current page.

Reference: MDN describes `<iframe>` as embedding another HTML page in a nested browsing context: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe

This matters because OpenCode Web UI runs inside an iframe. Its `html`, `body`, CSS variables, DOM, layout, and compositor layer are separate from the Obsidian parent document.

### Transparent iframe compositing

Transparent iframe compositing means the iframe document background is transparent and the user sees pixels from the parent window behind it.

This can look attractive. It is also fragile in Electron/Chromium. Focus changes, resizing, or compositor updates can produce black frames, stale pixels, or brightness changes.

This project already observed those symptoms.

## User-Visible Symptoms

The user observed these symptoms across several screenshots and reloads:

- The right OpenCode pane can become a large black or dark block.
- The boundary between left editor and right OpenCode pane can show a dark vertical band.
- The image can appear continuous in some areas but broken in other areas.
- Clicking different OpenCode regions can change the brightness of the main editor.
- Dragging width can introduce black frames or dark regions.
- Some local rectangles in the editor appear darker or lighter than neighboring background.
- The effect is local, not global.
- Similar local contrast can appear even in Obsidian's own sidebars or properties panels.

The key observation:

The background image itself is not necessarily changing. Local overlays above it are changing.

## What Is Actually on Screen

A useful mental model is to imagine the screen as a stack of transparent sheets.

### Left editor area

The left editor area is roughly:

```text
Obsidian window base
workspace layout layers
Background plugin editor ::before image
editor content container background
CodeMirror text
CodeMirror active line
selection
metadata/properties surfaces
callouts/tables/code block surfaces
scrollbar
tab/header/status bar chrome
```

The user's eye sees the result after these layers combine.

### Right OpenCode area

The right OpenCode area is roughly:

```text
Obsidian window base
workspace leaf and split layers
iframe element rectangle
iframe document html/body
OpenCode #root
OpenCode route/session container
OpenCode panels, tabs, composer, input, buttons
OpenCode text and border layers
```

If the iframe paints its own background, parent pixels behind it do not matter.

If the iframe is transparent, parent pixels matter but compositor stability becomes a problem.

If the iframe copies the background image, it has to choose a coordinate system.

## Why Clicking OpenCode Can Affect the Main Editor

Clicking inside OpenCode changes focus.

That focus change can affect Obsidian parent state even if OpenCode does not intentionally mutate the editor.

The likely chain:

```text
User clicks inside iframe
→ browser focuses iframe
→ Obsidian active element / active leaf state can change
→ editor leaf gains or loses mod-active / focus classes
→ CodeMirror changes focus-sensitive layers
→ active line, selection, current block, tab header, and theme surfaces repaint
→ local alpha over the background image changes
→ the user sees a local brightness change
```

Another possible chain:

```text
User clicks inside iframe
→ Chromium activates or recomposes iframe layer
→ transparent or semi-transparent areas are resampled
→ stale or black compositor pixels can appear
→ user sees flicker or black frame
```

The important point:

OpenCode does not need to call “change editor background” for this to happen. Focus and compositor state are enough.

## Why the Effect Is Local

The effect is local because the changed layer is local.

Examples:

- `.cm-line.cm-active` only covers the current line.
- Selection only covers selected text.
- A property panel background covers only the property area.
- A table row background covers one row.
- A tab header active state covers one tab.
- A split handle covers a narrow vertical strip.
- OpenCode composer covers the bottom input region.

When these local layers change, only the pixels under those rectangles change.

That is why the user sees local rectangles or bands instead of a whole-window change.

## Why “Background Belongs to Background Plugin” Is True but Incomplete

The Background plugin owns these facts:

```text
image URL
opacity setting
blur setting
position setting
CSS variables written to document.body
CSS rules that paint editor pseudo-elements
```

It does not own:

```text
Obsidian focus classes
CodeMirror active line
CodeMirror selection
workspace split handles
tab header active state
iframe document background
OpenCode internal surfaces
Electron compositor behavior
```

Therefore the Background plugin owns the image input and editor image layer. It does not own every final pixel that the user sees.

This is the central misunderstanding that caused repeated failed attempts.

## Current Background Plugin Implementation

The external Background plugin is at:

```text
/Users/oujinsai/Projects/obsidian-editor-background
```

### Variable writing

File:

```text
/Users/oujinsai/Projects/obsidian-editor-background/src/Plugin.ts
```

Current behavior:

```ts
doc.body.style.setProperty('--obsidian-editor-background-image', `url('${this.settings.imageUrl}')`);
doc.body.style.setProperty('--obsidian-editor-background-opacity', `${this.settings.opacity}`);
doc.body.style.setProperty('--obsidian-editor-background-bluriness', `blur(${this.settings.bluriness})`);
doc.body.style.setProperty('--obsidian-editor-background-input-contrast', this.settings.inputContrast ? '#ffffff17' : 'none');
doc.body.style.setProperty('--obsidian-editor-background-line-padding', this.settings.inputContrast ? '1rem' : '0');
doc.body.style.setProperty('--obsidian-editor-background-position', this.settings.position);
```

This runs on layout ready and on window open.

The variables are written to `doc.body`.

### Editor image painting

File:

```text
/Users/oujinsai/Projects/obsidian-editor-background/styles.css
```

Current behavior:

```css
.markdown-reading-view:before,
.cm-editor:before {
  content: "";
  background-blend-mode: overlay;
  background-repeat: no-repeat;
  background-position: var(--obsidian-editor-background-position);
  background-size: cover;
  width: 100%;
  height: 100%;
  position: absolute;
  background-image: var(--obsidian-editor-background-image);
  opacity: var(--obsidian-editor-background-opacity);
  filter: var(--obsidian-editor-background-bluriness);
}
```

This means:

- every reading/source editor surface can paint its own image;
- `cover` is calculated against that editor surface;
- a side pane or iframe is not part of that editor surface.

### Commented workspace-level direction

The same CSS file contains a commented experiment:

```css
/* This sets the background for the whole app, seen with a positive z-index. However, the z-index disrupts interactions.
.horizontal-main-container:before {
  content: "";
  background-blend-mode: overlay;
  background-repeat: no-repeat;
  background-position: var(--obsidian-editor-background-position);
  background-size: cover;
  width: 100%;
  height: 100%;
  position: absolute;
  background-image: var(--obsidian-editor-background-image);
  opacity: var(--obsidian-editor-background-opacity);
  filter: var(--obsidian-editor-background-bluriness);
}
...
*/
```

This comment is important.

It shows that the plugin author already considered painting the whole app/workspace. The stated problem was z-index disrupting interactions.

That is the correct class of problem for a global background owner:

- choose the correct container;
- create a non-interactive background layer;
- place it behind content;
- avoid intercepting pointer events;
- avoid being hidden by opaque workspace layers;
- avoid breaking Obsidian layout.

This is a Background plugin problem, not an OpenCode iframe problem.

## Current another-opencode-for-obsidian Theme Path

Relevant local files:

```text
src/theme/WebViewTheme.ts
src/theme/EditorBackdrop.ts
src/proxy/ProxyInjection.ts
src/ui/OpenCodeView.ts
scripts/harness/themeReport.ts
tests/theme/EditorBackdrop.test.ts
tests/proxy/ProxyInjection.test.ts
tests/harness/themeReport.test.ts
```

### Theme capture

File:

```text
src/theme/WebViewTheme.ts
```

Main function:

```ts
captureObsidianWebViewTheme(source)
```

This function reads Obsidian CSS variables from a source element and creates an OpenCode theme payload.

The payload contains:

- Obsidian source variables;
- OpenCode v2 token overrides;
- legacy OpenCode token aliases.

It currently includes Background plugin variables:

```ts
"--obsidian-editor-background-image"
"--obsidian-editor-background-opacity"
"--obsidian-editor-background-bluriness"
"--obsidian-editor-background-position"
```

These variables are useful for diagnostics. They become dangerous if the iframe treats them as a production instruction to paint the editor image.

### Backdrop state

File:

```text
src/theme/EditorBackdrop.ts
```

This file has carried several meanings during the experiments:

- read editor background snapshot;
- decide whether iframe should paint a background image;
- compute projection;
- report diagnostics.

The clean future role should be narrower:

- keep `readEditorBackdropSnapshot()` only as diagnostics;
- do not produce iframe image paint variables in stable mode;
- if D is kept as optional mode, keep a separate simple “body CSS background” path;
- delete active editor projection from production.

### Proxy injection

File:

```text
src/proxy/ProxyInjection.ts
```

This file injects:

- bridge script;
- Obsidian appearance CSS;
- theme update script;
- diagnostics collector.

When image experiments were active, this file installed iframe `body::before` background layers and reported source-boundary contracts.

The stable A path should not install an image pseudo-element in iframe.

The optional D path should install exactly one iframe `body::before` layer and mark it explicitly as best-effort.

### Runtime view

File:

```text
src/ui/OpenCodeView.ts
```

Relevant behavior:

- creates the iframe;
- syncs theme payload to iframe;
- records theme sync history;
- samples parent Obsidian layers;
- captures runtime diagnostics.

The diagnostics are useful. They should remain.

The dangerous part is treating parent editor geometry as something OpenCode should fix. Parent editor local layers should be explained, not patched.

### Harness

File:

```text
scripts/harness/themeReport.ts
```

The harness has accumulated checks for:

- runtime theme variables;
- iframe roots;
- host pane pseudo-elements;
- transparent compositing;
- source boundary contract;
- editor layer diagnostics;
- large element samples.

It is useful as a detector, but it should not encode a false product promise.

If the product promise is A:

- harness should fail if iframe paints editor image.
- harness should fail if iframe uses transparent compositing.
- harness should fail if host pane paints a pseudo-background.
- harness should not check image continuity.

If the product promise is D:

- harness should check exactly one iframe image layer.
- harness should not claim left/right continuity.
- harness should not require active editor projection.

## A/B/C/D Definitions

This section gives precise definitions.

### A: Material-only

Implementation:

- OpenCode iframe does not paint the Background plugin image.
- OpenCode iframe uses Obsidian stable colors and alpha surfaces.
- The iframe document has an explicit base background.
- OpenCode panels, composer, dialogs, and controls use theme-derived material.

Expected advantage:

- stable;
- no image crop mismatch;
- no projection math;
- no editor selector compensation;
- no transparent iframe compositor reliance.

Observed result:

- right pane becomes a large dark/material block;
- background image meaning is cut off too much;
- user does not accept it as satisfying the original visual goal.

Structural reason:

OpenCode iframe owns an opaque or semi-opaque document surface. Even if it uses Obsidian colors, it does not reveal the user's background image.

### B: Each pane independently paints the same full image

Implementation:

- left editor paints image through Background plugin;
- OpenCode iframe paints the same image in its own rectangle;
- each uses `background-size: cover`.

Expected advantage:

- image appears in right pane;
- transparent visual atmosphere is preserved;
- simple implementation.

Observed result:

- the two sides show different crops;
- the boundary reveals mismatch;
- dragging pane width changes the crop and can make the mismatch more visible.

Structural reason:

`cover` depends on the element rectangle. The editor rectangle and iframe rectangle are different.

This is effectively the same visual model as D unless the implementation differs in minor naming.

### C: Active editor projection

Implementation:

- read active editor rectangle;
- read iframe rectangle;
- read image dimensions;
- read editor background position;
- compute the background size and offset that would make iframe show the corresponding part of the active editor image coordinate system;
- paint that computed image inside iframe.

Expected advantage:

- can reduce left/right crop mismatch;
- keeps image inside iframe, so no transparent iframe compositing is needed.

Observed result:

- image alignment improves in some cases;
- local dark bands and boundaries remain;
- focus/click changes still expose parent editor and workspace layers;
- the implementation naturally wants more special cases.

Structural reason:

C only synchronizes the image layer. It cannot synchronize:

- CodeMirror active line;
- selections;
- editor current block backgrounds;
- properties panel backgrounds;
- split handles;
- tab/header active state;
- workspace chrome;
- parent-window theme overlay layers.

Trying to hide those layers inside `another-opencode-for-obsidian` becomes selector compensation.

### D: Iframe-owned body CSS background

Implementation:

- iframe document installs `body::before`;
- `body::before` paints the Background plugin image using the original body variables;
- `background-size: cover`;
- `background-repeat: no-repeat`;
- no active editor projection.

Expected advantage:

- simple;
- transparent visual direction is closest to the user's preference;
- avoids C projection complexity.

Observed result:

- visually best among the OpenCode-only image paths;
- still has crop mismatch at the boundary;
- cannot honestly be called continuous.

Structural reason:

D has two independent image owners:

- editor surface;
- iframe document.

They share image URL but not coordinate system.

## Why Copying Obsidian Sidebar or Header Color Did Not Solve It

The chrome-color attempt changed the iframe page background to a color close to Obsidian workspace chrome.

It did not solve the user's original problem.

Reason:

- the user wants the background image to retain meaning;
- a copied color is still a solid/semi-solid pane;
- it does not reveal the image;
- it does not remove local editor overlays;
- it only changes the shade of the right block.

The diagnostic after that attempt showed:

```text
backdropState: none
paintedBackgroundImage: null
html/body background: rgb(29, 32, 33)
OpenCode large elements mostly transparent
```

That means OpenCode was no longer painting a background image. The visible block was the iframe document base color. It was not pure black, but it still covered the image.

## Why Obsidian Sidebars Can Also Have Local Differences

The user observed that even Obsidian's own sidebars can create local differences.

That is expected in a transparent theme.

Sidebars are their own surfaces. They may use:

- `--background-primary`;
- `--background-secondary`;
- `--background-modifier-hover`;
- active item backgrounds;
- tab/header backgrounds;
- border layers;
- status bar backgrounds;
- hover or focus states.

Even if these are native Obsidian elements, they still sit above the background image.

Therefore native Obsidian sidebars can also darken or tint the image locally.

That does not mean the Background plugin is broken. It means the final image is mixed with UI material.

The difference is product expectation:

- user accepts native Obsidian sidebars because they belong to Obsidian;
- user expects OpenCode to feel similarly native;
- OpenCode currently feels like a foreign large pane because its iframe document creates a separate surface.

## Why There Is No Clean OpenCode-Only Solution Under Current Constraints

The constraints are:

- do not modify the vault;
- do not patch Background plugin;
- do not modify upstream OpenCode components;
- do not rely on transparent iframe compositing;
- do not add selector compensation for Obsidian/CodeMirror local layers;
- preserve the user's background image meaning;
- avoid black blocks and flickering.

OpenCode-only options are exhausted:

### Option 1: Do not paint the image

This is A.

It is stable, but it hides the image.

### Option 2: Paint the image independently

This is B/D.

It looks good, but it crops differently from the editor.

### Option 3: Project from active editor

This is C.

It reduces image mismatch, but cannot control parent local layers.

### Option 4: Make iframe transparent

This exposes the parent pixels.

It can look closest to the desired result when it works.

But previous observations showed black frames, stale layers, and click-dependent brightness changes.

It also crosses into compositor behavior that is not controlled by the plugin's CSS tokens alone.

### Option 5: Patch specific selectors

Examples:

- hide `.cm-active`;
- hide selection layer;
- hide table row background;
- hide split handle;
- make workspace gap transparent;
- override tab/header local state.

This is explicitly rejected.

It also grows without bound, because every theme, plugin, and editor feature can introduce another local overlay.

Therefore the clean OpenCode-only solution does not exist under the current constraints.

## The Correct Clean Model

The clean model is:

```text
One workspace-level background image
→ editor material on top
→ side pane material on top
→ OpenCode iframe material on top
```

In this model:

- the image is painted once;
- the image coordinate system is the workspace/window;
- OpenCode does not copy or project the image;
- editor and sidebar surfaces are local materials;
- local overlays still exist, but they are honest UI layers above a shared background.

This is how the user's mental model wants the UI to work.

The current Background plugin does not implement this model. It implements:

```text
editor surface 1 paints image
editor surface 2 paints image
OpenCode optionally paints image
sidebars/chrome paint their own backgrounds
```

That is why the visual result is fragmented.

## What a Workspace-Level Background Experiment Would Test

The experiment belongs in:

```text
/Users/oujinsai/Projects/obsidian-editor-background
```

The experiment should be minimal.

Goal:

```text
Paint one background image behind the Obsidian workspace.
Do not change OpenCode iframe to copy or project the image.
Make editor and OpenCode panes material above that image.
Check whether clicking OpenCode still causes main editor local brightness flicker.
```

Candidate containers to inspect:

- `.horizontal-main-container`
- `.workspace`
- `.workspace-split.mod-root`
- `.app-container`
- document body fixed pseudo-layer

The experiment should not begin by choosing one selector permanently.

It should first instrument and inspect:

- which container spans the intended viewport;
- which container is below panes but above app background;
- whether `pointer-events: none` preserves interaction;
- whether z-index can place the layer without covering content;
- whether existing opaque surfaces hide it;
- whether multiple Obsidian windows require per-document setup.

Potential CSS shape:

```css
.some-workspace-background-owner::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: var(--obsidian-editor-background-image);
  background-position: var(--obsidian-editor-background-position);
  background-size: cover;
  background-repeat: no-repeat;
  opacity: var(--obsidian-editor-background-opacity);
  filter: var(--obsidian-editor-background-bluriness);
}
```

This is only a shape, not a final answer.

The hard part is the stacking position:

- too low: hidden by Obsidian surfaces;
- too high: covers UI;
- wrong stacking context: z-index no longer behaves globally;
- missing `pointer-events: none`: interactions break;
- wrong container: background does not span all panes or scrolls unexpectedly.

This is why the commented Background plugin code said z-index disrupted interactions.

## What Should Happen to another-opencode-for-obsidian Code

There are two possible product decisions.

### Decision A: stable Obsidian material only

This is the safest default.

Expected code shape:

- `EditorBackdrop.ts` does not output iframe image paint variables.
- `ProxyInjection.ts` does not install `body::before` image layer.
- `WebViewTheme.ts` maps stable Obsidian variables to OpenCode tokens.
- `OpenCodeView.ts` may keep editor backdrop diagnostics.
- harness checks absence of image painting.

Pros:

- stable;
- simple;
- maintainable;
- no background geometry code;
- no selector compensation.

Cons:

- visually does not satisfy the user's full background-image preference.

### Decision D: optional best-effort visual mode

This is closer to user preference but must be labeled honestly.

Expected code shape:

- a setting or internal flag enables iframe image painting;
- iframe document paints exactly one `body::before` image layer;
- it consumes Background plugin body variables;
- no active editor projection;
- no host pane pseudo-layer;
- no transparent iframe compositing;
- harness checks single-layer discipline, not continuity.

Pros:

- prettier for this user;
- simple;
- avoids projection complexity.

Cons:

- boundary mismatch remains;
- dragging width changes crop;
- it is not a clean solution.

### Decision C should be deleted from production

Active editor projection should not remain as a half-supported path.

Reasons:

- it creates a false promise of continuity;
- it needs image dimensions and live geometry;
- it is sensitive to resize and cold start;
- it cannot solve parent editor local layers;
- it invites selector compensation.

### Chrome-color attempt should not be a final solution

The chrome-color attempt can inform A's material palette, but it does not solve the background-image goal.

It should not be documented as a separate solution.

## Suggested Cleanup Plan for another-opencode-for-obsidian

This plan assumes the immediate goal is to stop the bleeding.

### Step 1: Freeze product stance

Pick one:

- stable material A;
- optional D with known limitation.

Do not keep A, C, D, and chrome-color mixed in the same production path.

### Step 2: Clean `EditorBackdrop.ts`

If A:

- keep `readEditorBackdropSnapshot()` for diagnostics;
- keep CSS variable reading for diagnostics;
- remove projection helpers;
- remove paint output variables;
- mode should be `none` with explicit reason when an image exists but iframe painting is disabled.

If D:

- remove projection helpers;
- produce simple image paint variables from body CSS variables;
- do not inspect active editor rect for production painting.

### Step 3: Clean `ProxyInjection.ts`

If A:

- no `body::before` image layer;
- source boundary contract should say material-only;
- diagnostics should report no painted image.

If D:

- one `body::before` image layer;
- no `body::after`;
- no host pseudo-layer;
- contract should say best-effort iframe image background.

### Step 4: Clean `WebViewTheme.ts`

Keep stable token bridge.

Do not treat `--obsidian-editor-background-image` as a production input unless D is explicitly enabled.

Avoid using specific OpenCode component selectors.

Tune only token-level alpha values if the material is too dark.

### Step 5: Clean `OpenCodeView.ts`

Keep diagnostics:

- editor backdrop snapshot;
- visible editor layers;
- workspace chrome samples;
- boundary layers;
- theme sync history.

Do not use diagnostics as repair inputs.

### Step 6: Clean harness

If A:

- assert iframe does not paint editor image;
- assert no transparent compositing;
- assert host stays transparent;
- assert large root backgrounds are expected;
- assert OpenCode token bridge works.

If D:

- assert one image layer;
- assert no repeat;
- assert no host layer;
- assert no transparent compositing;
- assert no active editor projection.

Do not add tests that claim left/right visual continuity unless a workspace-level background owner exists.

### Step 7: Commit only clean files

Do not stage:

```text
.rpg/
session_id.txt
```

The current working tree includes experiments. Before committing, inspect and choose the final product stance.

## What Should Happen to Background Plugin

If the user wants the original visual goal, run a separate experiment in:

```text
/Users/oujinsai/Projects/obsidian-editor-background
```

The experiment should ask:

Can the background image be promoted from editor-level to workspace-level without breaking interactions?

### Minimal experiment requirements

- Draw one image layer behind the workspace.
- Use existing Background plugin settings.
- Avoid intercepting pointer events.
- Avoid creating multiple independent image crops.
- Keep editor text readable.
- Check sidebars, root tabs, popouts, and multiple windows.
- Check OpenCode iframe in side pane.
- Check clicking OpenCode and clicking editor.
- Check resizing panes.
- Check cold start.

### Possible success criterion

The main editor, sidebars, and OpenCode pane all sit over the same visual background. Clicking OpenCode does not cause editor-local brightness changes except legitimate focus UI states.

### Possible failure criterion

If z-index or opaque Obsidian surfaces prevent a stable workspace-level layer, then the target visual design may not be compatible with the current Obsidian/theme/plugin stack without deeper theme changes.

## Why the Earlier Confidence Was Wrong

The earlier confidence came from treating the visible problem as mostly a geometry problem:

```text
same image + correct projection = continuity
```

That model missed the final-pixel problem:

```text
same image + correct projection + different local overlays = still not visually continuous
```

It also missed that clicking can change parent focus and compositor state.

The work found useful facts, but it did not produce an acceptable fix.

Useful facts:

- D proves the user prefers image/transparent atmosphere over pure material.
- A proves material-only is stable but too visually destructive.
- C proves projection alone cannot handle parent local layers.
- diagnostics prove the current A/chrome-color path has no image painting; the remaining block is iframe base color.
- Background plugin source proves the current image owner is editor-level.

The mistake was continuing to search for the answer inside `another-opencode-for-obsidian` after the failure mode had moved to parent workspace/background ownership.

## How to Read Future Screenshots

When looking at a future screenshot, ask these questions in order.

### Question 1: Is the background image visible in OpenCode?

If no:

- the path is A/material-only;
- complaints about lost image meaning are expected.

If yes:

- the path is D, C, transparent iframe, or workspace-level background.

### Question 2: Does the image crop match across the boundary?

If no:

- likely independent `cover` crops;
- this is B/D.

If yes:

- either projection is active or there is one shared workspace background.

### Question 3: Do local editor layers still differ?

If yes:

- active line, selection, metadata, tabs, or split layers are involved;
- do not patch selectors in `another-opencode-for-obsidian`;
- diagnose as parent UI layer.

### Question 4: Does clicking iframe change brightness?

If yes:

- focus/compositor path is involved;
- do not assume background image changed;
- inspect active leaf/focus state and compositor conditions.

### Question 5: Does resizing create black frames?

If yes:

- transparent iframe compositing or stale paint state is involved;
- avoid relying on transparent iframe for production.

## Decision Matrix

| Model | Image visible in OpenCode | Stable | Continuous image | Avoids selector compensation | Fits user preference | Clean under current constraints |
| --- | --- | --- | --- | --- | --- | --- |
| A material-only | No | Yes | No | Yes | No | Yes |
| B independent image | Yes | Mostly | No | Yes | Partial | Partial |
| C active projection | Yes | Fragile | Partial | No | Partial | No |
| D iframe-owned image | Yes | Mostly | No | Yes | Best among OpenCode-only | Partial |
| Transparent iframe | Yes, from parent | Fragile | Potentially | Maybe | High when it works | No |
| Workspace-level owner | Yes | Unknown until tested | Yes by design | Yes | Best target | Requires Background plugin/theme work |

## Recommended Next Decision

There are only two honest next paths.

### Path 1: Stop at another-opencode-for-obsidian

Choose A or D.

If choosing A:

- accept that image meaning is reduced;
- tune alpha and colors only;
- ship stable behavior.

If choosing D:

- accept boundary crop mismatch;
- call it best-effort visual mode;
- keep it optional or user-specific.

### Path 2: Move the experiment to Background plugin

Do a workspace-level background owner prototype.

This is the only path that can satisfy the original visual goal without making OpenCode simulate the background.

## Recommended Immediate Repository State

Before doing more implementation, the current dirty working tree should be treated as experimental.

Do not commit it as-is.

Recommended sequence:

1. Save this document.
2. Decide whether `another-opencode-for-obsidian` should keep A or D as its local stance.
3. Revert or delete the other experimental paths.
4. Make harness match the selected stance.
5. Commit the clean stance.
6. Open a separate Background plugin experiment.

## Appendix: Source References

Local source files:

- `/Users/oujinsai/Projects/obsidian-editor-background/src/Plugin.ts`
- `/Users/oujinsai/Projects/obsidian-editor-background/styles.css`
- `/Users/oujinsai/Projects/another-opencode-for-obsidian/src/theme/WebViewTheme.ts`
- `/Users/oujinsai/Projects/another-opencode-for-obsidian/src/theme/EditorBackdrop.ts`
- `/Users/oujinsai/Projects/another-opencode-for-obsidian/src/proxy/ProxyInjection.ts`
- `/Users/oujinsai/Projects/another-opencode-for-obsidian/src/ui/OpenCodeView.ts`
- `/Users/oujinsai/Projects/another-opencode-for-obsidian/scripts/harness/themeReport.ts`

External references:

- Obsidian CSS variables: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables
- MDN `background-size`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-size
- MDN stacking context: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context
- MDN `<iframe>`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- MDN `z-index`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/z-index

## Appendix: Short Explanation for Future Agents

Do not start by patching selectors.

The observed problem is not one selector.

The current Background plugin paints editor-local background images. OpenCode is an iframe in a different surface. Attempts to copy the image into OpenCode either lose the image, crop it differently, or expose parent local layers. A clean solution requires a workspace-level background owner or an explicit product compromise.

If the task is to clean `another-opencode-for-obsidian`, choose A or D and delete C.

If the task is to satisfy the original visual goal, prototype workspace-level background ownership in `obsidian-editor-background`.

---

# 中文主文：给没有前端经验的读者

这一部分用中文重写整套判断。

它不是前面英文摘要的逐句翻译。

它是为了让后续只看这一份文档的人，不需要回看聊天记录，不需要看前一份计划文档，也不需要理解临时试验代码。

## 0. 先说清楚这份文档承担什么

这份文档承担三个任务。

第一，解释你看到的现象。

第二，解释为什么我前面在 `another-opencode-for-obsidian` 里反复试 A、C、D，都没有得到一个干净结果。

第三，给后续代码处理一个边界：哪些代码应该删，哪些诊断可以留，真正值得继续试验的位置在哪里。

这份文档不要求读者有前端经验。

它会从最基础的屏幕像素、CSS 背景、透明层、iframe、Obsidian workspace 讲起。

这里的结论会比聊天里的结论更谨慎。

聊天里的很多表达是在边试边判断。

这份文档是把真实运行结果整理成一个可审查的判断链。

## 1. 用户需求

用户当前的需求可以写成下面几句话。

用户在 Obsidian 里启用了背景图。

这张背景图不是普通装饰。

它是用户工作环境的一部分。

OpenCode Web UI 打开以后，不应该让这张图失去意义。

用户可以接受一些损失。

比如：

- 右侧 pane 覆盖了一部分图片；
- 边缘少一点；
- 局部有轻微色差；
- OpenCode 有自己的输入框、边框、文本和半透明面板；
- Obsidian 自己的侧边栏也有一些 material 遮罩。

用户不能接受下面这些结果。

- 右侧变成大黑块。
- 中间边界出现突兀黑条。
- 拖动宽度后出现黑框。
- 点击不同位置后主编辑区亮度变化。
- 为了修一个具体黑条去隐藏 `.cm-active`。
- 为了修一个具体竖条去隐藏 resize handle。
- 为了修一个具体局部色差去补 table row、selection、metadata、workspace gap。

用户真正反感的是补偿代码。

补偿代码的形态通常是：

```css
.some-specific-selector {
  background: transparent !important;
}
```

或者：

```ts
if (this-one-case) {
  doSpecialThing();
}
```

这些代码会让当前截图看起来好一点。

但它们会把问题扩散到更多 selector。

下一次换主题、换 pane、换焦点、换 Obsidian 版本，又会出现新的局部层。

所以这份文档的核心问题是：

能不能找到一个结构上干净的实现点。

## 2. 最基础的前端模型

### 2.1 屏幕不是直接显示“背景图”

屏幕显示的是最终像素。

最终像素是多层叠加后的结果。

在普通网页里，如果最上层元素是纯白背景，那么用户看到白色。

这时下面是什么都不重要。

在透明主题里，最上层元素可能是半透明。

比如：

```css
background: rgba(0, 0, 0, 0.3);
```

这表示这一层只贡献一部分黑色。

下面的图片仍然会透出来。

最终像素大致像这样：

```text
最终颜色 = 上层颜色 * 上层透明度 + 下层颜色 * 剩余透明度
```

真实浏览器会更复杂。

它会处理颜色空间、文字抗锯齿、filter、blend mode、shadow、backdrop filter、compositor layer。

但初学者可以先记住一点：

透明 UI 里，你看到的不是某一层。

你看到的是很多层叠出来的结果。

### 2.2 背景图只是其中一层

用户说“背景图变暗了”。

这个描述从视觉上是对的。

但从渲染上看，可能发生的是：

- 背景图没有变；
- 背景图上方多了一层半透明黑色；
- 或者某个 active/focus layer 变了；
- 或者 iframe 重新合成；
- 或者 editor 当前行背景出现/消失；
- 最终用户看到的局部像素变暗了。

所以排查时不能只问：

```text
背景图 URL 有没有变？
```

还要问：

```text
这个位置上方有哪些层？
这些层有没有背景色？
这些层有没有透明度？
这些层有没有在点击后改变？
```

### 2.3 CSS `background-size: cover`

`cover` 是这个问题里最重要的 CSS 概念之一。

`background-size: cover` 的意思是：

保持图片比例，把图片放大或缩小到完全覆盖当前元素。

如果元素比例和图片比例不同，图片会被裁剪。

例子：

```text
图片比例：16:9
元素比例：1:1
```

为了覆盖正方形，图片会按高度或宽度放大。

另一边多出的部分会被裁掉。

现在假设有两个元素：

```text
左侧 editor：宽 800，高 900
右侧 OpenCode：宽 500，高 900
```

它们都用同一张图。

它们都写：

```css
background-size: cover;
background-position: center;
```

它们显示出来的裁剪区域仍然不同。

因为两个元素的矩形不同。

这就是 D 方案的结构性问题。

### 2.4 CSS pseudo-element

`::before` 和 `::after` 是 CSS 伪元素。

它们不是 HTML 里真实写出来的节点。

CSS 可以让它们像元素一样绘制。

Background 插件现在用 `::before` 画图片。

简化后就是：

```css
.cm-editor::before {
  content: "";
  position: absolute;
  width: 100%;
  height: 100%;
  background-image: var(--obsidian-editor-background-image);
}
```

这表示每个 `.cm-editor` 可以在自己里面生成一层背景图。

这层图属于 editor。

它不属于整个 Obsidian workspace。

### 2.5 z-index 和 stacking context

前端里不是所有 z-index 都在同一个平面里比较。

很多 CSS 属性会创建 stacking context。

一个 stacking context 可以理解成一个局部叠放世界。

里面的 z-index 只在这个世界里比较。

整个世界再作为一个整体参与外部比较。

这就是为什么全局背景层难做。

你想把背景放在所有内容下面。

但如果放太低，它被 Obsidian 的不透明背景盖住。

如果放太高，它盖住文本和按钮。

如果 `pointer-events` 没处理，它还会挡点击。

如果放进错误的 stacking context，它只在某个局部 pane 里有效。

Background 插件源码里那段注释正是这个问题。

它说 `.horizontal-main-container::before` 可以让整个 app 看见背景。

但 z-index 会影响交互。

这说明真正难点是全窗口背景层的 stacking 位置。

### 2.6 iframe

OpenCode Web UI 运行在 iframe 里。

iframe 是一个嵌套网页。

它有自己的：

- `html`
- `body`
- DOM
- CSS 变量
- layout
- scroll
- focus
- compositor layer

父窗口 Obsidian 不能随便进入 iframe 内部改 DOM。

iframe 内部也不能自然共享父窗口的最终像素。

如果 iframe 自己画背景，它会盖住父窗口。

如果 iframe 背景透明，它需要浏览器把父窗口像素合成进来。

透明 iframe 在 Electron 里经常有合成问题。

之前看到的点击亮度变化、拖动黑框，就属于这个风险范围。

### 2.7 focus 状态

前端里的 focus 是当前输入焦点。

点击 editor，editor 获得焦点。

点击 iframe，iframe 或 iframe 内部元素获得焦点。

Obsidian 会根据 focus 改 class。

CodeMirror 会根据 focus 改 active line、selection、cursor。

主题会根据 active leaf 改 tab、header、pane 背景。

所以点击 OpenCode 后，左侧 editor 的局部层发生变化是合理的。

这不是 OpenCode 主动去改了左边。

这是 Obsidian 自己响应焦点变化。

## 3. 当前 Background 插件到底做了什么

相关仓库：

```text
/Users/oujinsai/Projects/obsidian-editor-background
```

### 3.1 插件入口

文件：

```text
/Users/oujinsai/Projects/obsidian-editor-background/src/Plugin.ts
```

核心代码：

```ts
UpdateBackground(doc: Document = activeDocument) {
  doc.body.style.setProperty('--obsidian-editor-background-image', `url('${this.settings.imageUrl}')`);
  doc.body.style.setProperty('--obsidian-editor-background-opacity', `${this.settings.opacity}`);
  doc.body.style.setProperty('--obsidian-editor-background-bluriness', `blur(${this.settings.bluriness})`);
  doc.body.style.setProperty('--obsidian-editor-background-input-contrast', this.settings.inputContrast ? '#ffffff17' : 'none');
  doc.body.style.setProperty('--obsidian-editor-background-line-padding', this.settings.inputContrast ? '1rem' : '0');
  doc.body.style.setProperty('--obsidian-editor-background-position', this.settings.position);
}
```

这段代码做了两件事。

第一，它把背景图设置写到 `doc.body.style`。

第二，它没有直接决定图片在哪里画。

它只是写 CSS 变量。

真正决定“在哪里画”的是 CSS。

### 3.2 CSS 绘制规则

文件：

```text
/Users/oujinsai/Projects/obsidian-editor-background/styles.css
```

核心代码：

```css
.markdown-reading-view:before,
.cm-editor:before {
  content: "";
  background-blend-mode: overlay;
  background-repeat: no-repeat;
  background-position: var(--obsidian-editor-background-position);
  background-size: cover;
  width: 100%;
  height: 100%;
  position: absolute;
  background-image: var(--obsidian-editor-background-image);
  opacity: var(--obsidian-editor-background-opacity);
  filter: var(--obsidian-editor-background-bluriness);
}
```

这段 CSS 决定了当前背景 owner。

它不是整个 workspace。

它是：

```text
.markdown-reading-view::before
.cm-editor::before
```

也就是阅读视图和 CodeMirror editor 自己的伪元素。

### 3.3 当前模型的直接后果

当前模型是：

```text
每个 editor surface 自己画背景图
```

它不是：

```text
整个 Obsidian workspace 背后统一画一张背景图
```

这一区别决定了后面所有失败。

如果背景属于 editor：

- editor 里有图；
- editor 外面的 pane 没有同一张图；
- OpenCode pane 想要图，就只能自己复制；
- 复制以后就有第二个 owner；
- 两个 owner 用不同矩形 cover；
- 边界会错。

如果背景属于整个 workspace：

- editor 只是透明 material；
- side pane 只是透明 material；
- OpenCode 只是透明 material；
- 它们都在同一张背景上方；
- OpenCode 不需要复制图；
- 也不需要投影图。

### 3.4 被注释的 workspace 方向

同一个 CSS 文件里有一段注释：

```css
/* This sets the background for the whole app, seen with a positive z-index. However, the z-index disrupts interactions.
.horizontal-main-container:before {
  content: "";
  background-blend-mode: overlay;
  background-repeat: no-repeat;
  background-position: var(--obsidian-editor-background-position);
  background-size: cover;
  width: 100%;
  height: 100%;
  position: absolute;
  background-image: var(--obsidian-editor-background-image);
  opacity: var(--obsidian-editor-background-opacity);
  filter: var(--obsidian-editor-background-bluriness);
}
...
*/
```

这段注释非常关键。

它说明插件作者知道“全 app 背景”这个方向。

它也说明这个方向的问题不是图片 URL。

问题是 z-index 和交互。

这正是我现在认为应该转去 Background 插件验证的地方。

## 4. 当前 another-opencode-for-obsidian 做了什么

相关仓库：

```text
/Users/oujinsai/Projects/another-opencode-for-obsidian
```

OpenCode Web UI 通过 iframe 接入 Obsidian。

本插件做了主题桥接。

主题桥接的意思是：

```text
读取 Obsidian 的 CSS 变量
→ 生成 OpenCode 能消费的 CSS token
→ 注入 iframe
→ 让 OpenCode 看起来像 Obsidian
```

### 4.1 `WebViewTheme.ts`

文件：

```text
src/theme/WebViewTheme.ts
```

它负责捕获 Obsidian 主题变量。

重要函数：

```ts
captureObsidianWebViewTheme(source)
```

它读取：

- `--background-primary`
- `--background-secondary`
- `--text-normal`
- `--text-muted`
- `--interactive-accent`
- `--background-modifier-border`
- Background 插件变量

然后生成 OpenCode v2 token：

- `--v2-background-bg-base`
- `--v2-background-bg-deep`
- `--v2-background-bg-layer-01`
- `--v2-background-bg-layer-02`
- `--v2-text-text-base`
- `--v2-border-border-base`
- 等等。

它的合理职责是：

```text
颜色、字体、边框、surface alpha 的桥接
```

它不应该承担：

```text
跨 iframe 背景图连续
```

### 4.2 `EditorBackdrop.ts`

文件：

```text
src/theme/EditorBackdrop.ts
```

这个文件在实验过程中变复杂了。

它做过三类事情：

第一，读取 editor 背景状态。

第二，生成 iframe 背景图变量。

第三，计算 active editor projection。

稳定后的职责应该只保留第一类。

也就是：

```text
可以诊断 editor 里有没有 background image
不能把这个诊断直接当成 iframe 绘制命令
```

### 4.3 `ProxyInjection.ts`

文件：

```text
src/proxy/ProxyInjection.ts
```

它负责往 OpenCode HTML 里注入：

- bridge script；
- Obsidian appearance style；
- theme update script；
- runtime diagnostics。

它曾经注入过 iframe `body::before` 背景图层。

在 A 中，这层应该删除。

在 D 中，这层可以作为 best-effort visual mode 保留。

在 C 中，这层还要消费投影变量。

C 不建议保留。

### 4.4 `OpenCodeView.ts`

文件：

```text
src/ui/OpenCodeView.ts
```

它负责：

- 创建 iframe；
- 设置 iframe URL；
- 接收 iframe message；
- 同步 theme；
- 记录 diagnostics；
- 采样 parent Obsidian 层。

这里有一个重要边界：

采样 parent 层是诊断。

诊断不等于修复。

如果我们采样到 `.cm-line.cm-active`，这说明左侧 active line 正在画局部背景。

它不说明 `another-opencode-for-obsidian` 应该覆盖 `.cm-line.cm-active`。

### 4.5 `themeReport.ts`

文件：

```text
scripts/harness/themeReport.ts
```

这个 harness 用来检查真实运行状态。

它可以告诉我们：

- iframe 有没有收到 theme diagnostics；
- iframe roots 的背景是什么；
- iframe 有没有透明合成；
- OpenCode 大元素背景是什么；
- parent editor 有哪些可见局部层；
- workspace boundary 附近有哪些元素；
- theme sync 历史是什么。

它的价值是排查。

它不应该把未验证的产品承诺写成测试。

比如：

```text
OpenCode 背景图必须和左侧连续
```

这个承诺在当前约束下不成立。

不要写进 harness。

## 5. 四个方案的完整解释

### 5.1 A：material-only

A 的含义：

```text
OpenCode iframe 不画 Background 图片。
OpenCode 只使用 Obsidian 颜色和半透明 surface。
```

代码形状：

```text
EditorBackdrop 不输出 image paint variables。
ProxyInjection 不安装 body::before image layer。
WebViewTheme 只桥接颜色和 token。
```

优点：

- 简单；
- 稳定；
- 没有图片裁剪错位；
- 没有 projection；
- 不碰 editor selector；
- 不依赖透明 iframe。

缺点：

- OpenCode 区域变成 material pane；
- 背景图在右侧大面积消失；
- 用户觉得它像黑块；
- 不满足“不要破坏完整背景图意义”。

真实验收：

用户截图显示，A 即使不是纯黑，也仍然是右侧大块实色/暗色 pane。

所以 A 是稳定底线。

它不是用户满意答案。

### 5.2 B：各自绘制完整背景

B 的含义：

```text
左侧 editor 自己画背景图。
右侧 OpenCode 自己画同一张背景图。
两边都 background-size: cover。
```

它听起来直观。

但它的问题也很直接。

两个区域矩形不同。

`cover` 结果不同。

边界处显示不同裁剪区域。

所以 B 会让图片像两张拼在一起。

B 和 D 在当前上下文里非常接近。

如果没有额外 projection，右侧自己画图就是 D。

### 5.3 C：active editor projection

C 的含义：

```text
左侧 editor 的背景图是参考系。
OpenCode iframe 读取 editor rect、iframe rect、图片尺寸。
计算 iframe 里面应该显示图片的哪一块。
```

它要解决 B/D 的核心问题：

```text
两个区域各自 cover，裁剪不一致。
```

C 试图让右侧使用左侧 editor 的图片坐标。

这在纯图片几何上是有道理的。

但真实 UI 不是纯图片。

左侧 editor 还有：

- active line；
- selection；
- properties；
- current block；
- markdown preview local backgrounds；
- table/callout/code block；
- tab active state；
- split handle；
- scrollbar；
- workspace chrome。

C 只能同步图片。

C 同步不了这些局部层。

所以 C 越努力让背景图连续，用户越容易看见哪些局部层没有连续。

继续补这些局部层就会变成 selector 补偿。

### 5.4 D：iframe-owned image layer

D 的含义：

```text
OpenCode iframe 内部安装 body::before。
body::before 画 Background 插件图片。
它使用 Background 插件 body variables。
它自己 cover。
```

优点：

- 简单；
- 好看；
- 用户主观更喜欢；
- 不需要 projection；
- 不需要透明 iframe。

缺点：

- 左右 crop 不一致；
- 中间边界会暴露；
- 拖动宽度后 crop 会变化；
- 它不能声称“连续”。

D 可以作为个人视觉偏好。

D 不能作为“彻底修干净”的答案。

### 5.5 透明 iframe

还有一个隐藏方案：

```text
iframe 背景透明，露出父窗口像素。
```

它理论上最像用户想要的效果。

因为右侧不需要复制图。

它直接看见下面的父窗口。

问题是 Electron/Chromium 透明 iframe 合成不稳定。

实际已经出现：

- 点击后亮度变化；
- 拖动宽度后黑框；
- stale layer；
- 黑色 backing；
- 冷启动首帧异常。

所以透明 iframe 不能作为稳定生产路径。

## 6. 为什么点击 OpenCode 会影响左侧视觉

用户问这个问题非常关键。

问题可以写成：

```text
侧边栏归侧边栏。
主界面归主界面。
为什么点 OpenCode 会让主界面背景变？
```

答案是：

```text
主界面背景图大概率没变。
变的是覆盖在主界面背景图上面的局部层。
```

### 6.1 focus 链

点击 OpenCode 的时候：

```text
鼠标事件进入 iframe
iframe 或 iframe 内元素获得 focus
Obsidian 父窗口的 active element 状态变化
workspace active leaf 状态可能变化
CodeMirror focus 状态变化
theme active/inactive class 变化
```

然后：

```text
active line 层变化
selection 层变化
tab active 样式变化
workspace header 样式变化
editor 当前块背景变化
```

最后：

```text
背景图上方的遮罩变化
用户看到局部变亮/变暗
```

这不需要 OpenCode 主动改左侧背景。

只要 focus 变化就够了。

### 6.2 compositor 链

点击 iframe 还可能触发 compositor 行为：

```text
iframe layer 激活
Chromium 重新合成
透明或半透明区域重新采样
旧 backing store 被替换
局部黑色或亮度变化出现
```

这个问题通常不会被 CSS 变量完全控制。

这也是透明 iframe 风险高的原因。

### 6.3 局部性

用户看到的是局部闪烁。

这是因为变化的层也是局部的。

例如：

```text
active line 只覆盖一行
selection 只覆盖选区
properties panel 只覆盖属性区域
split handle 只是一条竖线
OpenCode composer 只覆盖底部输入框
```

局部层变，局部像素变。

这和整张背景图是否变无关。

## 7. 为什么侧边栏本身也会有色差

Obsidian 自己的侧边栏也不是“纯背景图”。

它也有：

- pane background；
- active item background；
- hover background；
- border；
- titlebar；
- tab header；
- scroll bar；
- status bar；
- focus state。

这些都是背景图上面的层。

所以侧边栏和 editor 有色差是正常的。

用户可以接受 Obsidian 原生侧边栏的色差。

因为它符合 Obsidian 的视觉体系。

OpenCode 的问题是：

它现在是一个 iframe。

iframe 的大面背景和 OpenCode 内部 surface 没有自然继承 Obsidian 的最终像素。

所以它看起来更像外来块。

## 8. 为什么“复制蓝框背景色”解决不了

用户指出蓝框里的顶部背景。

这个想法合理。

如果右侧大块底色能接近 Obsidian chrome，至少不会纯黑。

我试过这个方向。

结果仍然不满足。

原因是：

蓝框的颜色也不是一个稳定单色。

它可能来自：

- 背后 workspace base；
- tab container；
- transparent titlebar；
- active tab；
- workspace translucent variable；
- icon hover/focus layer；
- 背景图透出；
- 多层 alpha。

代码可以读取一个 computed background color。

但 computed background color 只代表那个元素自己的背景。

如果那个元素是透明的，真正可见的颜色来自它下面。

要复制“肉眼看到的颜色”，需要采样最终像素。

浏览器普通 DOM API 不会直接给你“屏幕上这个点最终显示的颜色”。

而且即使采样到了，也只是某个点。

不同位置还有不同背景图像素。

所以复制蓝框色最多能把右侧从纯黑调成某个深灰。

它不能恢复背景图意义。

也不能解决局部 overlay 问题。

## 9. 历史版本下 C 的代码形状

这里记录历史版本中的 C 形状。

这是为了后续读历史代码时能知道它在做什么。

它不是推荐保留的最终代码。

### 9.1 状态类型

历史 C 有这些状态：

```ts
export type EditorBackdropSourceMode =
  | "none"
  | "pending-editor-projection"
  | "active-editor-projection";
```

含义：

- `none`：不画；
- `pending-editor-projection`：有背景图，但缺几何或图片尺寸；
- `active-editor-projection`：已经算出投影，iframe 可以画。

### 9.2 需要的输入

C 需要：

```text
source image
source opacity
editor snapshot
editor rect
iframe rect
image dimensions
background-position
background-size
```

其中任何一项缺失，C 都只能 pending。

### 9.3 投影计算

核心思路是：

```ts
const scale = Math.max(
  snapshot.rect.width / imageDimensions.width,
  snapshot.rect.height / imageDimensions.height
);

const backgroundWidth = imageDimensions.width * scale;
const backgroundHeight = imageDimensions.height * scale;

const imageLeftInViewport =
  snapshot.rect.left + (snapshot.rect.width - backgroundWidth) * xFraction;

const imageTopInViewport =
  snapshot.rect.top + (snapshot.rect.height - backgroundHeight) * yFraction;

const iframePositionX = imageLeftInViewport - iframeRect.left;
const iframePositionY = imageTopInViewport - iframeRect.top;
```

这段数学本身不是错的。

它解决的是：

```text
让 iframe 中的图片使用 editor 背景图的坐标系。
```

它解决不了：

```text
让 editor 上方所有局部 UI 层也进入 iframe。
```

这就是 C 的边界。

### 9.4 为什么 C 容易滑向补偿

当 C 的图片对齐以后，用户会看到：

```text
图片接近连续
但某个横条不连续
某个竖条不连续
某个 active line 不连续
某个 selection 不连续
```

下一步工程师很容易写：

```css
.cm-line.cm-active {
  background: transparent;
}
```

再下一步又写：

```css
.workspace-leaf-resize-handle {
  background: transparent;
}
```

这条路没有终点。

所以 C 应该删除出生产路径。

## 10. 历史版本下 D 的代码形状

D 的代码形状更简单。

iframe CSS：

```css
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-repeat: no-repeat;
  background-position: var(--another-opencode-for-obsidian-backdrop-background-position, center);
  background-size: var(--another-opencode-for-obsidian-backdrop-background-size, cover);
  background-image: var(--another-opencode-for-obsidian-backdrop-background-image, none);
  opacity: var(--another-opencode-for-obsidian-backdrop-background-opacity, 0);
  filter: var(--another-opencode-for-obsidian-backdrop-background-filter, none);
  z-index: 0;
}
```

theme variables：

```text
--another-opencode-for-obsidian-backdrop-state: body-css-background
--another-opencode-for-obsidian-backdrop-background-image: var from Background plugin
--another-opencode-for-obsidian-backdrop-background-opacity: var from Background plugin
--another-opencode-for-obsidian-backdrop-background-filter: var from Background plugin
--another-opencode-for-obsidian-backdrop-background-position: var from Background plugin
--another-opencode-for-obsidian-backdrop-background-size: cover
```

优点：

```text
少数学
少状态
视觉好
```

缺点：

```text
两个 pane 各自 cover
边界处一定可能错位
```

所以 D 可以保留为可选视觉模式。

它不能被写成“修好了连续背景”。

## 11. 当前脏工作树的意义

当前工作树是实验状态。

它混了：

- D 的文档；
- C 的回滚和测试改动；
- A 的代码；
- chrome-color 的试验；
- harness 的半改状态；
- 测试里的旧断言；
- 新增本文档。

这不是可提交状态。

从这个点继续开发前，需要先决定最终 stance。

不应该基于当前脏树继续叠加修复。

否则会让 A/C/D/chrome-color 混在一起。

## 12. 后续代码应该怎么删

### 12.1 如果选择 A

保留：

- Obsidian token bridge；
- runtime diagnostics；
- parent editor layer sampling；
- iframe no transparent compositing；
- host pane no pseudo background。

删除：

- active editor projection；
- iframe image paint variables；
- iframe `body::before` image layer；
- image dimensions loading for production paint；
- projection harness；
- D 的 body-css-background contract。

保留但降级为 diagnostics：

- Background 插件变量读取；
- editor backdrop snapshot；
- external editor background rules sampling。

### 12.2 如果选择 D

保留：

- iframe `body::before` one image layer；
- Background plugin variable consumption；
- no host pseudo layer；
- no transparent iframe compositing；
- material token bridge；
- diagnostics。

删除：

- active editor projection；
- image dimension loading；
- editor rect to iframe rect projection；
- pending projection state；
- claims of image continuity。

### 12.3 不建议选择 C

删除：

- `pending-editor-projection`；
- `active-editor-projection`；
- projection geometry helpers；
- image-dimensions dependency for paint；
- harness requirement that projection must succeed；
- source boundary contract that promises editor-surface projection。

只保留：

- 诊断性质的 editor snapshot。

## 13. 背景插件的实验应该怎么设计

这一节是下一阶段最关键的内容。

目标不是马上修好。

目标是验证：

```text
背景图能不能上移为 workspace-level background owner。
```

### 13.1 实验假设

假设：

```text
如果背景图由整个 workspace 背后的单一层绘制，
OpenCode iframe 不需要复制背景图，
左右 pane 不会有各自 cover 的 crop mismatch，
点击 OpenCode 不会改变背景图本身，
局部变化只剩真实 UI material。
```

### 13.2 实验对象

候选容器：

```text
body
.app-container
.horizontal-main-container
.workspace
.workspace-split.mod-root
.workspace-tabs
```

不要一开始假设哪个对。

要先采样：

- 元素 rect；
- background；
- z-index；
- position；
- pointer-events；
- overflow；
- stacking context；
- 是否覆盖所有 panes；
- 是否存在于 popout window。

### 13.3 CSS 原型

可能形态：

```css
.workspace-background-owner {
  position: relative;
}

.workspace-background-owner::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: var(--obsidian-editor-background-image);
  background-position: var(--obsidian-editor-background-position);
  background-size: cover;
  background-repeat: no-repeat;
  opacity: var(--obsidian-editor-background-opacity);
  filter: var(--obsidian-editor-background-bluriness);
  z-index: 0;
}
```

但这只是原型。

真正难点是：

- owner 本身是否创建 stacking context；
- children 是否需要 `position: relative; z-index: 1`；
- Obsidian panes 是否有不透明背景；
- background 是否被 clip；
- scroll 是否影响背景；
- pointer 事件是否被截获。

### 13.4 验收动作

最小验收：

```text
1. 打开一个 markdown editor。
2. 打开 OpenCode 右侧 pane。
3. 开启 Background 图片。
4. 点击 editor。
5. 点击 OpenCode。
6. 拖动右侧 pane 宽度。
7. 切 tab。
8. 冷启动 Obsidian。
9. 打开左侧 file explorer。
10. 打开 properties panel。
```

观察：

- 背景图是否还是单张；
- OpenCode 是否不再复制图片；
- 左右边界是否不再出现 crop mismatch；
- 点击 OpenCode 是否只改变合理 focus UI；
- 是否有黑框；
- 是否有交互被挡。

### 13.5 失败也有价值

如果 workspace-level 背景实验失败，需要记录失败原因。

可能原因：

- Obsidian panes 默认不透明；
- z-index 无法放到正确位置；
- 某些容器 clip 背景；
- popout window 结构不同；
- 主题强依赖 editor-local background；
- iframe 仍然需要不透明 body。

失败后再决定是否接受 D。

## 14. 给未来 agent 的强约束

未来 agent 不应该做下面这些事。

不要说“先试一个 selector”。

不要写 `.cm-active` patch。

不要 patch resize handle。

不要 patch table row。

不要 patch selection。

不要 patch CodeMirror 内部 class。

不要 patch OpenCode 组件 class。

不要把 runtime diagnostics 当修复对象。

不要重新引入透明 iframe compositing。

不要把 D 说成连续。

不要把 A 说成满足用户审美。

不要把 C 作为主线。

如果要继续在 `another-opencode-for-obsidian` 做，只能选择 A 或 D。

如果要满足原始视觉目标，去 Background 插件做 workspace-level owner 实验。

## 15. 给未来人的一句话判断

当前问题的核心不是“背景图片 URL 如何传给 OpenCode”。

当前问题的核心是：

```text
背景图现在是 editor-local layer，
用户想要的是 workspace-global visual background。
OpenCode iframe 不能干净地把 editor-local background 模拟成 workspace-global background。
```

这句话比 A/B/C/D 都重要。

## 16. 读历史代码时的时间线

读历史代码时，不要把每个 commit 都看成最终设计。

这几天的历史大致是：

```text
1. 让 OpenCode 使用 Obsidian theme tokens。
2. 尝试透明 iframe 或 host 背景。
3. 观察到黑框、闪烁、亮度变化。
4. 转向 iframe-owned background。
5. 观察到左右 crop mismatch。
6. 转向 active editor projection。
7. 观察到局部父窗口层仍然破坏视觉。
8. 转向 material-only A。
9. 观察到右侧太黑，背景意义丢失。
10. 尝试 chrome color。
11. 观察到只是换了黑块颜色，仍未解决。
12. 结论转向 background owner 上移。
```

这不是成功实现路线。

这是失败排查路线。

后续不应该从第 8、9、10 步继续补。

后续应该在第 12 步重新开实验。

## 17. 为什么这不是“再调一个 alpha”能解决

调 alpha 可以让右侧不那么黑。

例如把：

```text
--v2-background-bg-base: 18%
```

调成：

```text
--v2-background-bg-base: 10%
```

它会让 OpenCode surface 更透。

但如果 iframe `html/body` 仍然有实色背景，图片还是看不到。

如果 iframe `html/body` 透明，合成风险回来。

如果 iframe 自己画图，crop mismatch 回来。

所以 alpha 调整只能改善 A 的观感。

它不能解决原始目标。

## 18. 为什么这不是“把右侧背景设成 transparent”能解决

把 iframe document 设为 transparent 看起来是最直接的。

但透明 iframe 的下方不是简单的一张图。

它下方是父窗口合成结果。

Electron/Chromium 需要把父窗口和 iframe 组合。

点击、resize、tab 切换都可能让 compositor 重新分配 layer。

之前看到的黑框和亮度变化说明这条路不稳定。

所以透明 iframe 是高风险路径。

如果要试，也应该作为明确实验。

不应该作为稳定生产方案。

## 19. 为什么这不是“让 OpenCode 吃 Obsidian CSS 变量”能解决

OpenCode 吃 Obsidian CSS 变量只能解决：

- 字体；
-颜色；
-边框；
-accent；
-surface alpha；
-hover；
-text；
-shadow。

它解决不了：

- parent workspace 的最终像素；
- editor-local 背景图；
- iframe compositor；
- CodeMirror active line；
- selection；
- workspace split。

所以 theme bridge 是必要的。

但 theme bridge 不是背景 owner。

## 20. 为什么我前面判断会摇摆

最初看到横条、竖条、黑框时，容易把它们当成几个具体 bug。

然后 diagnostics 捕获到：

- `.cm-line.cm-active`
- `hr.workspace-leaf-resize-handle.tappable`
- iframe root backgrounds
- background projection state

这些证据让问题看起来像可以一个个定位。

但用户明确指出不能 case-by-case。

这个提醒是对的。

把这些 selector 当修复入口就是补偿。

后来 A/C/D 都试过后，问题才变清楚：

这些 selector 只是证据。

根因是背景图和最终像素所有权分裂。

## 21. 文档结论的可信度

这份文档的结论来自四类证据。

第一，Background 插件源码。

它明确显示图片画在 `.markdown-reading-view::before` 和 `.cm-editor::before`。

第二，`another-opencode-for-obsidian` runtime diagnostics。

它明确显示 iframe 是否画图、iframe roots 背景是什么、大元素背景是什么。

第三，用户截图验收。

它明确显示 A、C、D、chrome-color 都没有满足目标。

第四，前端渲染基本规则。

`cover`、iframe、stacking context、focus、透明合成共同解释了现象。

结论不是来自一个抽象口号。

结论来自这些事实的组合。

## 22. 当前推荐

当前推荐分两层。

短期：

```text
停止在 another-opencode-for-obsidian 里追 C。
不要继续写 selector 补偿。
清理实验代码。
选择 A 或 D 作为明确产品妥协。
```

中期：

```text
在 obsidian-editor-background 里做 workspace-level background owner 原型。
```

长期：

```text
如果 workspace-level owner 成立，
OpenCode 只做 Obsidian material，
背景图不再由 OpenCode 管。
```

## 23. 如果后续选择 A，用户应该预期什么

A 的用户预期：

- 稳定；
- 不再追背景图连续；
- OpenCode 看起来像 Obsidian 面板；
- 背景图在 OpenCode 下方不可见或弱可见；
- 不会有 D 的 crop mismatch；
- 不会有 C 的 projection pending；
- 不会有透明 iframe 黑框。

A 的失败边界：

- 用户觉得右侧太黑；
- 用户觉得图片意义丢失。

这时只能调 material alpha。

不能把 A 偷偷变成 D。

## 24. 如果后续选择 D，用户应该预期什么

D 的用户预期：

- 背景图可见；
- 透明感最好；
- OpenCode 更像贴在背景上；
- 中间边界可能错；
- 拖动宽度会改变右侧 crop；
- 不保证图片连续；
- 不保证和左侧 editor 上的局部 UI 层一致。

D 的失败边界：

- 用户无法接受边界错位。

这时不能继续 patch selector。

只能转 workspace-level owner。

## 25. 如果后续做 Background 插件实验，用户应该预期什么

这是唯一可能接近原始目标的方向。

但它也不保证成功。

因为 Obsidian 主题和 workspace 结构可能仍然阻挡。

成功时：

- 背景图在整个 workspace 背后；
- editor、sidebar、OpenCode 都只是材料层；
- OpenCode 不复制图片；
- 左右没有 crop mismatch。

失败时：

- z-index 影响交互；
- 背景被 opaque pane 遮住；
- 某些窗口结构不同；
- focus 局部层仍然明显；
- 需要更深主题改造。

## 26. 最小后续行动清单

不要继续改 OpenCode 颜色。

先做这些：

```text
1. 保存本文档。
2. 停止把当前脏树当可提交实现。
3. 决定 another-opencode-for-obsidian 短期保 A 还是 D。
4. 删除 C。
5. 删除 chrome-color 试验。
6. 修 harness 到所选 stance。
7. commit 干净状态。
8. 新开 Background 插件 workspace-level background 实验。
```

## 27. 代码清理时的文件级清单

### `src/theme/EditorBackdrop.ts`

如果选 A：

```text
保留 readEditorBackdropSnapshot()
删除 createIframeBackdrop() 里的 image paint 输出
删除 projection helpers
删除 active-editor-projection 状态
删除 pending-editor-projection 状态
保留 reason: editor-background-image-disabled 或类似诊断状态
```

如果选 D：

```text
保留 body-css-background 状态
删除 projection helpers
从 body variables 生成 paint variables
不读 iframe rect
不读 image dimensions
```

### `src/proxy/ProxyInjection.ts`

如果选 A：

```text
删除 body::before image CSS
sourceBoundary contract = material only
diagnostics reported paintedBackgroundImage = null
```

如果选 D：

```text
保留 exactly one body::before
background-size cover
background-repeat no-repeat
sourceBoundary contract = best-effort iframe background
```

### `src/theme/WebViewTheme.ts`

保留：

```text
Obsidian stable variables
OpenCode v2 token bridge
legacy aliases
surface alpha tuning
```

谨慎：

```text
不要把 editor background image 当稳定生产输入
```

### `src/ui/OpenCodeView.ts`

保留：

```text
theme sync
runtime diagnostics
parent layer sampling
```

删除或降级：

```text
用 parent geometry 修 iframe paint 的生产逻辑
```

### `scripts/harness/themeReport.ts`

根据 stance 改。

不要让 harness 同时接受 A/C/D。

不要让 harness 承诺连续性。

## 28. 结束语

这份文档的核心结论很短。

当前问题不是一个 CSS 选择器 bug。

当前问题是背景图被画在 editor-local surface 里，而用户想要的是 workspace-global background。

OpenCode iframe 不能在不补偿、不透明合成、不修改 Background 插件的前提下，干净模拟 workspace-global background。

所以继续只改 `another-opencode-for-obsidian`，会继续烧成本。

下一步要么接受 A/D 的产品妥协。

要么把实验移到 Background 插件，验证 workspace-level background owner。

---

# 调用链详解

这一部分按时间顺序写。

它回答：

```text
Obsidian 打开以后，背景变量怎么出现？
OpenCode iframe 怎么拿到主题？
点击以后哪些状态可能变化？
resize 后为什么旧问题会出现？
diagnostics 到底观察了哪些层？
```

## 29. Obsidian 启动后的背景变量链

### 29.1 Background 插件加载

Background 插件是一个 Obsidian 插件。

它继承 `Plugin`。

它的 `onload()` 会执行：

```ts
await this.loadSettings();
this.addSettingTab(new UrlSettingsTab(this.app, this));
this.app.workspace.onLayoutReady(() => this.UpdateBackground(document));
this.app.workspace.on('window-open', (win: WorkspaceWindow) => this.UpdateBackground(win.doc));
```

含义：

```text
读取设置
注册设置页
等 Obsidian layout ready
给当前 document 写背景变量
新窗口打开时也给那个 window 的 document 写变量
```

这一步只写变量。

还没有产生可见图像。

### 29.2 CSS 规则消费变量

Background 插件的 CSS 已加载。

CSS 里有：

```css
.markdown-reading-view:before,
.cm-editor:before
```

当 editor DOM 存在时，这些 selector 匹配。

浏览器计算伪元素样式。

伪元素读取 body 上的变量。

然后图片出现在 editor surface 内。

调用链是：

```text
BackgroundPlugin.UpdateBackground()
→ document.body.style.setProperty(...)
→ CSS variable cascade
→ .cm-editor::before computed style
→ browser paints pseudo-element
```

### 29.3 这条链不经过 OpenCode

OpenCode 插件没有参与左侧 editor 的背景图绘制。

OpenCode 只能在后面读取这些变量。

它不能自然继承 editor 伪元素的最终像素。

这是最关键的边界。

## 30. OpenCode 插件打开后的主题链

### 30.1 Obsidian 打开 OpenCode view

`OpenCodeView` 是一个 `ItemView`。

当用户打开 OpenCode 视图时：

```text
ViewManager activates OpenCode view
OpenCodeView renders iframe
iframe points to local proxy URL
proxy fetches OpenCode server HTML
proxy strips CSP
proxy injects bridge script and theme script
iframe loads OpenCode Web UI
```

### 30.2 proxy 注入

`OpenCodeWebUiProxy` 会把 OpenCode HTML 转给 `ProxyInjection.ts`。

`ProxyInjection.ts` 注入三类内容：

```text
bridge script
appearance style
theme script
```

bridge script 负责：

```text
Cmd/Ctrl+L
proxy:loaded
theme:diagnostics
theme:update
```

appearance style 负责：

```text
html/body/#root 的基本背景和布局
可选 iframe body::before 背景层
```

theme script 负责：

```text
把 parent 传来的 CSS variables 写到 iframe documentElement
观察 OpenCode 自己的 theme mutation
采样 runtime diagnostics
postMessage 回 parent
```

### 30.3 theme capture

父窗口调用：

```ts
this.plugin.getWebViewTheme()
```

它内部会走到：

```ts
captureObsidianWebViewTheme(findObsidianWebViewThemeSource())
```

它读取 Obsidian CSS variables。

然后生成 iframe payload。

payload 的结构：

```ts
{
  colorScheme: "dark",
  variables: {
    "--another-opencode-for-obsidian-background-primary": "...",
    "--v2-background-bg-base": "...",
    "--background-base": "var(--v2-background-bg-base)",
    ...
  }
}
```

### 30.4 theme sync

`OpenCodeView.syncThemeToIframe()` 大致流程：

```text
确认 appearance 是 obsidian
确认 iframe contentWindow 存在
确认 proxyOrigin 存在
读取 iframe rect
判断 iframe 是否可见
创建 backdrop state
创建 iframe theme payload
计算 fingerprint
如果 fingerprint 变化，postMessage theme:update
记录 themeSyncHistory
```

关键点：

`backdrop state` 曾经被用于生产背景图。

现在应该只在选 D 时用于生产。

如果选 A，它只能表示：

```text
看到了 Background 插件变量，但 iframe 不消费图片
```

## 31. iframe 内部收到主题后的链

iframe theme script 收到 message：

```js
window.addEventListener('message', function(event) {
  ...
  replaceTheme(message.payload, 'parent-theme-update');
});
```

`replaceTheme()`：

```text
校验 payload
保存 theme
applyTheme()
readOpenCodeThemeState()
postThemeDiagnostics()
scheduleThemeDiagnostics()
```

`applyTheme()`：

```text
documentElement.dataset.opencodeObsidianAppearance = 'obsidian'
documentElement.dataset.colorScheme = theme.colorScheme
root.style.colorScheme = theme.colorScheme
replaceRootVariables(root, theme.variables)
replaceOpenCodeV2Aliases(root)
```

这一步把 Obsidian token 写进 iframe。

然后 OpenCode 内部 CSS 消费这些 token。

## 32. OpenCode 内部大背景从哪里来

OpenCode 内部元素有自己的 class。

例如 diagnostics 看到：

```text
relative bg-v2-background-bg-deep flex-1 ...
bg-background-stronger rounded-[10px] ...
```

这些 class 最终消费 CSS variables。

比如：

```text
bg-v2-background-bg-deep
→ background-color: var(--v2-background-bg-deep)
```

或者：

```text
bg-background-stronger
→ background-color: var(--background-stronger)
```

如果这些 token 是 transparent，元素自己不盖底色。

如果 iframe `html/body` 有实色背景，用户还是会看到那个实色背景。

所以 A 的黑块有两个来源：

```text
iframe html/body base color
OpenCode local surface tokens
```

如果 local surfaces 都透明，但 body 是 `rgb(29, 32, 33)`，右侧仍然是深色块。

runtime diagnostics 已经观察到这个情况。

## 33. 点击 OpenCode 的完整链

### 33.1 事件路径

点击 OpenCode 发生在 iframe 内。

事件路径大致是：

```text
mouse down inside iframe
browser focuses iframe browsing context
iframe document activeElement changes
parent document activeElement may become iframe
Obsidian workspace may update active leaf state
OpenCode may update hover/focus/active UI
```

### 33.2 parent Obsidian 可能变化

即使 OpenCode 没有主动调用 `workspace.setActiveLeaf()`，浏览器和 Obsidian 仍可能表现出 focus 变化。

可能变化：

```text
document.hasFocus()
activeElement
workspace active leaf
leaf mod-active class
tab header active class
CodeMirror focus state
```

### 33.3 editor 局部层变化

CodeMirror 和主题可能响应：

```text
.cm-focused
.cm-active
.cm-line.cm-active
selection drawing
cursor layer
active line background
```

这些层的 alpha 变了，背景图视觉就变了。

### 33.4 iframe compositor 可能变化

Chromium 可能把 iframe 作为独立 compositor layer。

当它获得焦点或尺寸变化时，可能重新合成。

如果 iframe 或父窗口有透明背景，这一步风险更大。

这解释之前的黑框和亮度变化。

## 34. resize 的完整链

用户拖动 pane 宽度。

Obsidian 改 workspace layout。

OpenCode iframe rect 变化。

如果 D：

```text
iframe body::before 仍然 cover iframe rect
iframe rect 宽度变化
cover crop 变化
右侧图片裁剪改变
边界错位变化
```

如果 C：

```text
iframe rect 变化
需要重新计算 projection
如果计算延迟或缺尺寸，进入 pending
可能首帧没有图或旧图
```

如果 transparent iframe：

```text
iframe compositor layer resize
可能出现黑 backing 或 stale pixels
```

如果 A：

```text
iframe body/background 重新铺满
没有图片错位
但仍然是 material block
```

## 35. cold start 的完整链

冷启动时顺序很重要。

可能顺序：

```text
Obsidian starts
plugins load
layout not ready
Background plugin writes variables later
OpenCode plugin starts
proxy injects initial HTML
iframe loads
theme capture may happen before final layout variables
theme update after iframe load
image dimensions may load later
diagnostics arrives in several waves
```

C 对冷启动最敏感。

因为它需要：

- active editor exists；
- editor rect valid；
- iframe rect valid；
- image dimensions available；
- background position resolved。

D 对冷启动较少敏感。

因为它只需要 body variables。

A 对冷启动最稳定。

因为它不需要 image geometry。

## 36. diagnostics 的层级

Diagnostics 有两边。

### 36.1 iframe 内 diagnostics

来自 `ProxyInjection.ts` 注入脚本。

它能看到：

- iframe document `html`;
- iframe document `body`;
- `#root`;
- OpenCode 内部大元素；
- OpenCode pseudo elements；
- CSS variables；
- inline variables；
- sourceBoundary。

它看不到：

- parent Obsidian DOM；
- left editor computed final pixels；
- parent workspace layers。

### 36.2 parent diagnostics

来自 `OpenCodeView.ts`。

它能看到：

- iframe element；
- OpenCode host pane；
- Obsidian ancestors；
- editor surfaces；
- visible editor layers；
- workspace chrome；
- boundary layers；
- focus state；
- theme sync history。

它不能可靠读取 iframe 内部 DOM after cross-origin constraints unless diagnostics are posted from iframe.

### 36.3 诊断不能变成修复对象

如果 diagnostics 看到：

```text
.cm-line.cm-active background rgb(40,40,40)
```

这说明 active line 是证据。

它不说明应该 patch `.cm-line.cm-active`。

如果 diagnostics 看到：

```text
hr.workspace-leaf-resize-handle
```

这说明 resize handle 是证据。

它不说明应该隐藏 resize handle。

## 37. 阅读代码的推荐顺序

如果未来只看这个文档和历史代码，建议按下面顺序读。

### 37.1 先读 Background 插件

读：

```text
/Users/oujinsai/Projects/obsidian-editor-background/src/Plugin.ts
/Users/oujinsai/Projects/obsidian-editor-background/styles.css
```

要确认：

```text
变量写在哪里
图片画在哪里
有没有 workspace-level owner
被注释的 horizontal-main-container 方案是什么
```

不要先读 `another-opencode-for-obsidian`。

因为如果不知道背景 owner 是 editor-local，就会误以为 OpenCode 可以简单继承背景。

### 37.2 再读 theme bridge

读：

```text
src/theme/WebViewTheme.ts
```

要确认：

```text
Obsidian variables 如何变成 OpenCode tokens
哪些 token 是根背景
哪些 token 是局部 surface
哪些 token 是 legacy alias
是否把 editor image 变量传给 iframe
```

### 37.3 再读 backdrop

读：

```text
src/theme/EditorBackdrop.ts
```

要确认：

```text
它现在是诊断还是生产绘制
是否还有 active-editor-projection
是否还有 body-css-background
是否输出 image paint variables
```

### 37.4 再读 proxy injection

读：

```text
src/proxy/ProxyInjection.ts
```

要确认：

```text
iframe html/body 背景是什么
有没有 body::before
有没有 body::after
有没有 transparent iframe compositing
sourceBoundary contract 是什么
diagnostics 采样了什么
```

### 37.5 再读 OpenCodeView

读：

```text
src/ui/OpenCodeView.ts
```

要确认：

```text
theme sync 何时发生
iframe rect 怎么采样
parent editor layers 怎么采样
focus state 怎么采样
是否点击 iframe 时主动 setActiveLeaf
```

### 37.6 最后读 harness

读：

```text
scripts/harness/themeReport.ts
tests/harness/themeReport.test.ts
```

要确认：

```text
harness 当前承诺了什么
是否仍然混着 A/C/D
是否把实验状态写成生产验收
```

## 38. 未来文档更新模板

如果后续继续实验，不要把聊天结论留在聊天里。

按下面模板追加到本文档。

### 38.1 实验名称

```text
YYYY-MM-DD: short name
```

### 38.2 假设

写一句：

```text
如果 X 是根因，那么改 Y 后应该看到 Z。
```

### 38.3 改动范围

列文件：

```text
repo/file
symbol
action
```

### 38.4 真实验收

记录：

```text
截图路径
用户观察
diagnostics 关键字段
build/reload 命令
```

### 38.5 结论

只能写三种：

```text
通过
失败
部分通过但不满足原始目标
```

不要写“看起来差不多”。

### 38.6 后续动作

只能写：

```text
保留
删除
降级为实验
转移到另一个 repo
```

## 39. 术语对照表

### background image

用户的图片。

不是最终屏幕颜色。

### background owner

负责画图片的层。

当前是 editor surface。

目标可能是 workspace。

### final pixel

用户看到的颜色。

由多层叠加产生。

### material

半透明主题面板。

它可以尊重 Obsidian 风格，但不等于显示背景图。

### compositor

浏览器/Electron 合成层。

iframe 透明、动画、resize、focus 都可能触发。

### projection

把一个元素里的图片坐标换算到另一个元素。

C 使用 projection。

### compensation

针对某个 selector 或某个局部现象打补丁。

用户明确不接受。

### sourceBoundary

runtime diagnostics 里描述当前背景来源和契约的字段。

它应该反映真实产品承诺。

不能随便为了让 harness 通过改名。

## 40. 常见误解

### 40.1 “变量在 body 上，所以全局背景已经成立”

不成立。

变量在 body 上，只表示所有后代可以读取。

真正画图的是 `.cm-editor::before`。

变量作用域不等于绘制层作用域。

### 40.2 “OpenCode 读到同一个 URL 就能一致”

不成立。

同一个 URL 加不同矩形 `cover`，显示不同 crop。

### 40.3 “只要用 editor projection 就能一致”

不成立。

projection 只处理图片层。

它不处理 active line、selection、workspace chrome。

### 40.4 “复制 Obsidian 侧边栏颜色就可以”

不成立。

侧边栏可见颜色常常是多层叠加，不是一个稳定变量。

而且复制颜色不显示图片。

### 40.5 “点击 OpenCode 改了背景图”

通常不成立。

更可能是 focus 和 overlay 变了。

### 40.6 “看到具体 selector 就应该 patch”

不成立。

selector 是证据。

修复入口应该是所有权和层级。

## 41. 对成本的诚实说明

这轮工作没有达到用户验收。

它消耗了用户的时间和 token。

不能用“学到了东西”抵消用户的损失。

技术上真正有价值的产物是：

- 明确排除了 C 作为干净主线；
- 明确 A 不满足用户视觉目标；
- 明确 D 是视觉偏好但不是干净解；
- 明确当前 Background 插件是 editor-local owner；
- 明确后续要去 workspace-level owner 实验。

这些结论应该写入文档，避免后续 agent 重走同样路径。

## 42. 一页纸版本

如果只能读一页，读这里。

用户想要：

```text
OpenCode 打开后不要破坏 Obsidian 背景图。
```

当前事实：

```text
Background 插件只在 editor surface 里画图。
OpenCode 是另一个 iframe surface。
```

OpenCode-only 方案：

```text
A 不画图：稳定但太黑。
D 自己画图：好看但 crop mismatch。
C 投影画图：图片更近但父窗口局部层仍然破坏视觉。
透明 iframe：看起来可能好但 compositor 不稳定。
selector patch：用户不接受。
```

结论：

```text
当前约束下，another-opencode-for-obsidian 没有干净解。
```

下一步：

```text
another-opencode-for-obsidian 选 A 或 D 作为产品妥协。
真正目标去 Background 插件做 workspace-level background owner 实验。
```

---

# 后续阅读和决策手册

这一部分是给未来只看本文档和历史代码的人准备的。

它把前面分散出现过的判断再压成可执行规则。

这里不再追溯聊天过程。

这里只保留后续判断需要的事实。

## 43. 代码历史索引

这几天的 commit message 里多次出现 `Fix`。

这些 commit message 不能当成问题已解决的证据。

它们应该被当成实验节点。

截至本文档编写时，相关历史大致包括：

```text
038ed76 fix: inherit obsidian editor background in web view
fe9e547 fix: stabilize Obsidian webview background
b2d2919 Fix Obsidian appearance theme bridge
75353f1 Fix Obsidian appearance compositor layers
78e34e0 Fix Obsidian webview theme material bridge
41a2cee Fix Obsidian webview theme ownership
7c4c614 Fix Obsidian appearance iframe backdrop
6abd0a5 Fix Obsidian webview backdrop ownership
d795e9e Fix Obsidian appearance iframe backdrop
02803cf Fix Obsidian background projection in OpenCode iframe
299bbd9 Add runtime diagnostics for theme sync flicker
107ca84 Skip unchanged iframe theme updates
1ede5a5 Stabilize Obsidian appearance projection
44cda21 Fix editor backdrop source selection
a1b529c chore: expand Obsidian backdrop diagnostics
2a20249 Fix Obsidian editor backdrop projection state
```

阅读这些 commit 时，先按问题域分组。

不要按时间线把每一个 commit 都解释成正确方向。

### 43.1 theme bridge 类 commit

这类 commit 处理：

```text
Obsidian CSS variables
OpenCode v2 tokens
OpenCode legacy tokens
text / border / accent / state colors
local surface alpha
dialog scrim
large shell background tokens
```

它们解决的是 OpenCode 是否像 Obsidian。

它们不解决背景图是否连续。

这类代码主要在：

```text
src/theme/WebViewTheme.ts
src/proxy/ProxyInjection.ts
scripts/harness/themeReport.ts
tests/harness/themeReport.test.ts
```

### 43.2 compositor 类 commit

这类 commit 处理：

```text
transparent iframe
iframe html/body background
host pane background
root transparency
Electron/Chromium focus recomposition
black frame
stale pixels
```

它们解决的是 iframe 是否稳定显示。

它们不能保证左侧和右侧像同一个背景平面。

如果看到代码重新使用：

```text
allowtransparency
transparent iframe body
host ::before background
parent-window geometry offset
```

要把它当成高风险回退。

### 43.3 backdrop ownership 类 commit

这类 commit 处理：

```text
Background plugin image variables
editor pseudo-element snapshot
iframe body::before
active editor projection
projection geometry
image dimensions
sourceBoundary contract
```

它们最接近这次失败的核心。

读这类 commit 时要问一个问题：

```text
这个 commit 是在移动背景所有权，
还是在让 OpenCode 模仿另一个层已经画好的东西？
```

如果答案是模仿，它就很容易进入补偿路径。

### 43.4 diagnostics 类 commit

这类 commit 处理：

```text
runtimeDiagnostics.theme
runtimeDiagnostics.iframe
largeElementSamples
visibleEditorLayers
boundaryLayers
workspaceChrome
themeSyncHistory
sourceBoundary
```

diagnostics 是证据层。

diagnostics 不能变成修复层。

看到某个 selector 被 diagnostics 捕获，不等于应该 patch 它。

### 43.5 当前 HEAD 的特殊含义

当前 `src/theme/EditorBackdrop.ts` 的重要事实：

```text
EditorBackdropSourceMode = "none"
createIframeBackdrop() 在有图片时也返回 mode: "none"
reason = "editor-background-image-disabled"
variables 不再输出背景绘制变量
sourceVariables 仍保留 Background 插件原始变量
snapshot 仍可作为 diagnostics
```

这说明生产代码已经朝 A 收敛了一步。

但工作树里还有 harness 和 tests 没有完全收敛。

因此不能只看一个文件说已经结束。

必须清理整条契约。

## 44. 当前脏工作树应该如何解释

当前工作树不是一个可提交实现。

它混有几种状态：

```text
A 的收敛
C 的历史测试和 harness 要求
D 的 iframe body::before 形状
chrome-color 的视觉尝试
diagnostics 扩展
文档新增
```

这类状态最危险。

因为它会让测试、diagnostics 和产品承诺互相矛盾。

### 44.1 不能提交的原因

不能提交的原因不是“测试可能失败”这么简单。

更准确地说：

```text
代码层可能已经说 A。
harness 层可能还在要求 C。
测试 fixture 可能还在接受 D。
文档层可能要求删 C。
用户验收层可能仍偏好 D 的透明感。
```

这些东西不能同时作为生产契约。

### 44.2 清理前先选 stance

清理前必须先选一个短期 stance。

只有两个可选：

```text
A: material-only stable default
D: best-effort iframe-owned image visual mode
```

不能选：

```text
C: active editor projection as production
transparent iframe as production
selector patch as production
```

### 44.3 `.rpg/` 和 `session_id.txt`

这些文件不要 stage。

它们不是产品变更。

后续 commit 只应包含：

```text
docs/plans/...
src/...
scripts/harness/...
tests/...
```

具体是否包含测试文件取决于最终 stance。

## 45. diagnostics 字段字典

这一节解释 runtime diagnostics 里的字段该怎么读。

目标是避免未来看到字段后直接把字段当修复对象。

### 45.1 `sourceBoundary`

位置：

```text
iframe 内部 diagnostics
由 src/proxy/ProxyInjection.ts 注入脚本生成
```

它描述 iframe 里背景来源的契约。

重要字段：

```text
contract
editorBackgroundSource
backdropState
backdropReason
activeEditorProjected
projectedBackgroundPosition
projectedBackgroundSize
paintedBackgroundImage
```

如果选择 A，期望：

```text
contract = obsidian-material-background-v1
backdropState = none
activeEditorProjected = false
projectedBackgroundPosition = null
projectedBackgroundSize = null
paintedBackgroundImage = null
```

如果选择 D，期望：

```text
contract = best-effort iframe background
backdropState = body-css-background
activeEditorProjected = false
projectedBackgroundPosition = null
projectedBackgroundSize = null
paintedBackgroundImage = url(...)
```

如果看到：

```text
active-editor-projection
pending-editor-projection
missing-image-dimensions
projectedBackgroundPosition
projectedBackgroundSize
```

说明 C 还没有清干净。

### 45.2 `largeElementSamples`

位置：

```text
iframe 内 diagnostics
```

它采样 iframe 内面积较大的 DOM 元素。

它回答：

```text
OpenCode 内部哪个大元素正在盖住背景？
它的 background 是透明还是实色？
它的 parent chain 是什么？
```

它适合定位：

```text
bg-background-stronger
bg-v2-background-bg-deep
settings dialog canvas
session shell
composer dock
```

它不适合做：

```text
根据某个 OpenCode class 写 selector patch
```

正确用法是：

```text
找到消费哪个 token
回到 WebViewTheme token bridge 修 token
```

### 45.3 `surfaceSamples`

位置：

```text
iframe 内 diagnostics
```

它采样较小的局部 surface。

它回答：

```text
输入框、按钮、菜单、dock、floating panel 是否仍是 Obsidian material？
```

如果选择 A，surfaceSamples 仍然重要。

因为 A 的价值全靠 material 质量。

如果选择 D，surfaceSamples 也重要。

因为 D 不能把局部 surface 变成完全透明。

OpenCode 仍需要可读性。

### 45.4 `visibleBackgrounds`

位置：

```text
iframe 内 diagnostics
```

它采样可见背景。

它容易误导。

因为一个元素背景可见不代表它是问题根因。

正确读法：

```text
先看是不是 root/html/body。
再看是不是 session shell。
再看它消费的 CSS variable。
最后回到 token bridge。
```

### 45.5 `pseudoBackgrounds`

位置：

```text
iframe 内 diagnostics
```

它采样 iframe 内部 `::before` / `::after`。

如果选择 A：

```text
body::before 不应该画图片。
body::after 不应该画图片。
```

如果选择 D：

```text
只能有一个 body::before 图片层。
不能有 body::after 第二层。
不能有多层 background-image。
```

### 45.6 `editorBackdropPlane`

位置：

```text
parent diagnostics 汇总后进入 theme report
```

它描述 OpenCode 当前认为 iframe 背景平面是什么。

在 A 下，它应该表达：

```text
看到了 source image 也不消费。
mode = none。
reason = editor-background-image-disabled。
```

在 D 下，它应该表达：

```text
iframe 自己画一个 cover 背景。
mode = body-css-background。
```

它不应该再表达：

```text
active editor projection。
```

### 45.7 `visibleEditorLayers`

位置：

```text
parent Obsidian diagnostics
```

它采样左侧 editor 的局部层。

可能出现：

```text
.cm-line.cm-active
selection layer
table row
code block
metadata area
markdown reading view overlays
```

这些是解释用户截图的证据。

它们不是本插件的修复入口。

### 45.8 `boundaryLayers`

位置：

```text
parent Obsidian diagnostics
```

它采样 editor 和 OpenCode 边界附近的层。

可能出现：

```text
workspace-leaf-resize-handle
workspace gap
split border
tab boundary
```

它回答：

```text
边界色带是不是 OpenCode 内部画出来的？
```

如果它来自 parent workspace，OpenCode 不应该 patch。

### 45.9 `workspaceChrome`

位置：

```text
parent Obsidian diagnostics
```

它采样侧边栏、tab、header、workspace 容器。

它适合解释：

```text
为什么 Obsidian 自己的侧栏也会跟 editor 有色差。
```

它不适合生成：

```text
复制某个 chrome color 到 iframe body 的规则。
```

因为 chrome color 是最终像素的近似。

它不是稳定的主题变量。

### 45.10 `themeSyncHistory`

位置：

```text
parent diagnostics
```

它记录 theme update 何时发给 iframe。

常见 reason：

```text
iframe-loaded
proxy-loaded
opencode-layout-resized
window-resize
appearance-changed
```

它适合判断：

```text
resize 后是否同步了 theme。
iframe load 后是否补发了 theme。
```

它不能证明：

```text
视觉已经连续。
```

如果选择 A，geometry reason 仍可存在。

但它不应该用于投影背景图。

## 46. A/B/C/D 的最终可执行定义

这节只写后续实现时允许落代码的定义。

### 46.1 A 的代码定义

A 的生产代码定义：

```text
iframe 不画 Background 插件图片。
iframe html/body 使用 Obsidian page/base color。
#root 和 OpenCode shell 大背景尽量透明。
局部 surface 使用 Obsidian material tokens。
diagnostics 保留 Background 变量和 editor layer evidence。
```

A 允许：

```text
读取 --obsidian-editor-background-image 做 diagnostics。
把 reason 写成 editor-background-image-disabled。
报告 visibleEditorLayers。
报告 workspaceChrome。
调轻局部 surface alpha。
```

A 禁止：

```text
body::before 画图片。
active editor projection。
transparent iframe compositing。
host pane ::before 背景图。
selector patch。
```

A 的验收语言：

```text
OpenCode 尊重 Obsidian theme。
OpenCode 不承诺显示或延续 Background 图片。
```

### 46.2 B 的代码定义

B 如果单独定义，就是：

```text
每个 pane 都画同一张完整图片。
每个 pane 自己 background-size: cover。
```

在当前实现空间里，B 没有独立价值。

它会退化成 D。

所以不要把 B 做成单独设置。

### 46.3 C 的代码定义

C 的生产代码定义曾经是：

```text
读取 active editor rect。
读取 iframe rect。
读取 image dimensions。
计算 active editor cover 后的 image plane。
把这个 plane 投影到 iframe。
给 iframe body::before 设置 background-position / background-size。
```

C 的理论价值：

```text
减少纯图片层 crop mismatch。
```

C 的实际失败：

```text
用户看到的不是纯图片层。
左侧 editor 还有 active line、selection、tab、split、metadata。
投影越准，这些未被投影的局部层越显眼。
```

C 的最终处理：

```text
从 production 删除。
如需研究，只能放实验分支或文档。
```

### 46.4 D 的代码定义

D 的生产代码定义：

```text
iframe document 自己画一个 body::before 图片层。
图片来自 --obsidian-editor-background-image。
opacity / blur / position 来自 Background 插件变量。
background-size: cover。
background-repeat: no-repeat。
不使用 active editor rect。
不使用 image dimensions。
不承诺左右连续。
```

D 允许：

```text
用户启用 Background 时，右侧也看到同一张图。
右侧有透明感。
```

D 禁止：

```text
说它是 clean continuity。
为了边界错位继续加 projection。
为了 active line 继续 patch editor selector。
```

D 的验收语言：

```text
OpenCode 提供 best-effort 背景视觉。
它可能和 editor crop 不一致。
```

### 46.5 透明 iframe 的代码定义

透明 iframe 不属于 A/B/C/D。

它是另一个方案。

定义：

```text
iframe element 允许透明。
iframe html/body 透明。
OpenCode root 透明。
父窗口最终像素透过 iframe 显示。
```

风险：

```text
点击后亮度变化。
resize 黑框。
stale pixels。
Electron/Chromium compositor 行为不可控。
```

结论：

```text
不要作为 production。
```

## 47. 为什么“背景由谁绘制”仍然是核心问题

用户问过：

```text
这是背景图由谁来绘制的问题么？
```

答案需要拆开。

它不是只关于图片 URL。

它关于最终像素的生成路径。

### 47.1 背景插件拥有变量

Background 插件写：

```text
--obsidian-editor-background-image
--obsidian-editor-background-opacity
--obsidian-editor-background-bluriness
--obsidian-editor-background-position
```

这意味着它拥有配置值。

### 47.2 editor pseudo-element 拥有当前绘制

Background 插件 CSS 写：

```text
.markdown-reading-view:before,
.cm-editor:before
```

这意味着图片画在 editor surface 内。

### 47.3 Obsidian workspace 拥有许多上层 UI

editor 上面还有：

```text
active line
selection
cursor
table
metadata
headers
tabs
split handles
sidebars
```

这些层会改变最终像素。

### 47.4 OpenCode iframe 拥有另一个 document

iframe 不是 editor surface 的子元素。

iframe 内部的 CSS 不能直接继承 editor pseudo-element 的像素。

它只能：

```text
自己画。
不画。
投影。
透明露出 parent。
```

这四个动作正好对应当前失败空间。

### 47.5 用户想要的是 workspace 背景效果

用户的真实目标可以表达为：

```text
图片像在整个 Obsidian 工作区背后。
OpenCode 打开后只是加了一层面板。
图片本身的意义不被切碎。
```

这个目标要求背景 owner 在 workspace 层。

当前 owner 在 editor 层。

OpenCode-only 修改无法改变这个事实。

## 48. 为什么点击会影响左侧观感

这节专门给没有前端经验的读者。

点击 OpenCode 后，用户看到左侧局部变亮或变暗。

这不需要假设 Background 插件重新换了图片。

它可以由更普通的状态变化解释。

### 48.1 点击会改变 focus

浏览器会把 focus 给被点击的 iframe 或 iframe 内元素。

Obsidian 也可能改变 active leaf。

CodeMirror 可能从 focused editor 变成 unfocused editor。

### 48.2 focus 改变会改变 editor 层

主题可能定义：

```text
.cm-focused ...
.workspace-leaf.mod-active ...
.cm-active ...
.is-focused ...
```

这些规则会改变背景、透明度、边框、选区、光标。

### 48.3 这些层是局部的

active line 只覆盖当前行。

selection 只覆盖选区。

table row 只覆盖表格局部。

split handle 只覆盖边界几像素。

所以用户看到的变化也是局部的。

这解释了：

```text
为什么不是整个背景一起变。
为什么某个框或条在闪。
为什么随便点几次又恢复。
```

### 48.4 点击还可能触发 compositor

iframe 有自己的渲染层。

当 iframe 获得焦点时，Chromium 可能重新合成它。

如果使用透明 iframe，风险更大。

这解释了：

```text
黑框。
拖动后的残影。
点击后亮度突然变化。
```

### 48.5 这不是 OpenCode 一定写错了 CSS

OpenCode 可以放大问题。

OpenCode 也可以参与问题。

但左侧局部层变化本身属于 Obsidian/editor/focus/compositor 的组合。

所以看到左侧变化后，不能直接在 OpenCode Web UI 内找某个 class 修。

## 49. workspace-level 背景实验的详细设计

这一节是未来去 `/Users/oujinsai/Projects/obsidian-editor-background` 的实验草案。

它不要求现在改那个 repo。

它只定义怎么做才算干净实验。

### 49.1 实验目标

目标：

```text
把背景图从 editor-local pseudo-element 移到 workspace-level pseudo-element。
```

成功后：

```text
editor 不再独立 cover。
sidebar 不再独立 cover。
OpenCode 不再独立 cover。
所有 panes 之下只有一张 workspace 背景图。
```

### 49.2 第一轮不要改业务逻辑

第一轮只改 CSS 原型。

不要新增设置。

不要改图片 URL 逻辑。

不要改 OpenCode。

只验证：

```text
能不能找到一个稳定容器画全局背景。
```

### 49.3 候选容器采样

候选：

```text
body
.app-container
.horizontal-main-container
.workspace
.workspace-split.mod-root
.workspace-tabs
.mod-root
```

对每个候选采样：

```text
rect
position
z-index
overflow
pointer-events
background-color
transform
contain
isolation
children stacking
是否覆盖 side dock
是否覆盖 popout
```

### 49.4 需要避免的失败

全局背景最常见失败：

```text
背景盖住 pane。
背景挡住点击。
背景被容器 clip。
背景只覆盖主编辑区。
背景跟着 scroll 移动。
z-index 让 tooltip/menu 异常。
modal/dialog 被压住。
popout window 没背景。
移动端布局异常。
```

### 49.5 可能的 CSS 结构

原型可以先这样想：

```css
.workspace-background-owner {
  position: relative;
  isolation: isolate;
}

.workspace-background-owner::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: var(--obsidian-editor-background-image);
  background-position: var(--obsidian-editor-background-position);
  background-size: cover;
  background-repeat: no-repeat;
  opacity: var(--obsidian-editor-background-opacity);
  filter: var(--obsidian-editor-background-bluriness);
  z-index: 0;
}

.workspace-background-owner > * {
  position: relative;
  z-index: 1;
}
```

这只是起点。

如果 `z-index: 1` 影响 Obsidian 内部菜单或拖拽，就要换容器或换 stacking 方法。

### 49.6 原插件里的注释很有价值

当前 Background 插件 `styles.css` 有注释：

```text
This sets the background for the whole app, seen with a positive z-index.
However, the z-index disrupts interactions.
```

这说明作者已经摸到过 workspace-level 方向。

它也说明直接设正 z-index 会破坏交互。

未来实验要做的是重新找层级位置。

不是直接取消注释。

### 49.7 成功后的 OpenCode 形态

如果 workspace-level background 成功，OpenCode 应该回到 A 的形态。

也就是：

```text
OpenCode 不画图。
OpenCode 用 Obsidian material。
iframe html/body 尽量不制造大实色块。
局部 surface 保持可读。
```

此时 A 才可能满足用户审美。

因为图片已经在 iframe 背后的 workspace 层存在。

### 49.8 失败后的选择

如果 workspace-level background 失败，有两个选择：

```text
接受 A 的稳定性。
接受 D 的 best-effort 视觉。
```

不要回到 C。

因为 C 已经证明会把问题带回局部层补偿。

## 50. 端到端验收手册

用户明确要求端到端验收。

这里写一份最小手册。

### 50.1 验收前准备

记录：

```text
Obsidian 版本
theme 名称
Background 插件设置
OpenCode webViewAppearance
当前 repo commit
当前工作树是否 dirty
是否重载 Obsidian
```

不要只说“我看着还行”。

### 50.2 基础动作

每个方案都跑：

```text
1. 冷启动 Obsidian。
2. 打开同一个 markdown 文件。
3. 打开 OpenCode 右侧 pane。
4. 点击 editor 正文。
5. 点击 OpenCode 输入区。
6. 点击 OpenCode 空白区。
7. 点击 Obsidian tab header。
8. 切到另一个 markdown tab。
9. 切回原 tab。
10. 拖动 editor/OpenCode 边界。
11. 折叠右侧栏。
12. 展开右侧栏。
13. 切换 webViewAppearance。
14. 关掉 Background 插件。
15. 重新打开 Background 插件。
```

### 50.3 要截的图

至少截：

```text
初始打开
点击 editor 后
点击 OpenCode 后
拖动宽度中或后
切 tab 后
关 Background 后
开 Background 后
```

截图文件名要能表达动作。

不要只贴一张最终图。

### 50.4 要看的 diagnostics

至少看：

```text
sourceBoundary
editorBackdropPlane
largeElementSamples
visibleEditorLayers
boundaryLayers
workspaceChrome
themeSyncHistory
iframe roots
pseudoBackgrounds
```

### 50.5 A 的验收标准

A 通过条件：

```text
无黑框。
点击不造成 iframe 残影。
OpenCode text/surface 可读。
OpenCode 不消费背景图片。
sourceBoundary 显示 material-only。
visibleEditorLayers 只作为 advisory。
```

A 失败条件：

```text
仍有透明 iframe 黑框。
iframe 内出现背景图片绘制。
OpenCode 大面积 token 变成实黑。
点击 OpenCode 触发明显不合理闪烁。
```

A 的主观审美失败不等于工程失败。

如果用户觉得 A 太黑，要记录为产品不满足。

### 50.6 D 的验收标准

D 通过条件：

```text
iframe 只画一层 body::before 图片。
图片变量来自 Background 插件。
无 active editor projection。
无 parent geometry。
无透明 iframe。
无多层 background image。
点击和 resize 没有黑框。
文档明确写出 crop mismatch 风险。
```

D 失败条件：

```text
边界错位用户不能接受。
点击后局部亮度变化仍明显。
拖动后出现黑框。
harness 把 D 误报成 continuity。
```

### 50.7 workspace-level 实验验收标准

workspace-level 通过条件：

```text
背景图在整个 workspace 背后一张。
OpenCode 不画图片也能看到背景效果。
editor/sidebar/OpenCode 不各自 cover。
点击 OpenCode 不改变背景图本身。
拖动宽度不改变图片 crop。
没有交互遮挡。
```

workspace-level 失败条件：

```text
z-index 影响点击。
菜单、tooltip、modal 层级异常。
某些 pane 完全盖住背景。
背景只覆盖一部分 workspace。
popout 缺失。
```

## 51. 代码清理验收

这节给未来实际改代码的人。

### 51.1 清理 C 的静态搜索

清理后，生产代码中不应出现生产意义的：

```text
active-editor-projection
pending-editor-projection
projectedBackgroundPosition
projectedBackgroundSize
missing-image-dimensions
imageDimensionsStatus as paint dependency
editor rect to iframe rect projection
--another-opencode-for-obsidian-iframe-backdrop-left
--another-opencode-for-obsidian-iframe-backdrop-top
--another-opencode-for-obsidian-iframe-backdrop-width
--another-opencode-for-obsidian-iframe-backdrop-height
```

如果这些词只出现在历史文档或失败测试 fixture，可以保留。

如果出现在 production path，要审查。

### 51.2 清理 D 的静态搜索

如果最终选择 A，生产代码中不应出现：

```text
body::before image paint
--another-opencode-for-obsidian-backdrop-background-image used by CSS
background-image: var(--another-opencode-for-obsidian-backdrop-background-image
background-size: var(--another-opencode-for-obsidian-backdrop-background-size
```

sourceVariables 可以保留。

因为 diagnostics 仍然需要知道 Background 插件是否启用。

### 51.3 清理 transparent iframe 的静态搜索

生产代码中不应出现：

```text
allowtransparency
iframe transparent compositing
host pane background image pseudo-element
html/body fully transparent as final display path
```

`#root` 可以透明。

根 document body 是否透明取决于 stance。

A 通常需要 body 有稳定 base color。

D 通常需要 body 背后有 body::before 图片层。

### 51.4 清理 selector compensation

生产代码中不应新增：

```text
.cm-active
.cm-line
.cm-selection
.markdown-reading-view
.cm-editor
.workspace-leaf-resize-handle
.workspace-tab-header
```

例外：

```text
diagnostics query selectors
source snapshot
advisory reports
```

这些 selector 只能用于观察。

不能用于覆盖样式。

### 51.5 清理 harness contract

harness 只能承诺一个 stance。

如果选 A，harness 名称应该类似：

```text
runtime OpenCode document uses Obsidian material background
runtime source boundary disables editor image paint
```

如果选 D，harness 名称应该类似：

```text
runtime OpenCode document uses one best-effort iframe image layer
```

harness 不应该同时说：

```text
active editor image projection
iframe pane backdrop
material-only
```

这会让后续 agent 不知道要满足哪一个世界。

## 52. 给未来 agent 的排障表

### 52.1 用户说“右侧太黑”

先判断 stance。

如果 A：

```text
检查 iframe html/body base color。
检查 --v2-background-bg-base。
检查 --background-stronger。
检查 largeElementSamples。
可以调 material alpha。
不能偷偷恢复图片。
```

如果 D：

```text
检查 body::before 是否存在。
检查 paintedBackgroundImage。
检查 opacity 是否为 0。
检查 root/shell 是否盖住图片。
```

### 52.2 用户说“边界不对齐”

如果 D：

```text
这是预期风险。
不要补 projection。
记录为 D 不满足用户目标。
转 workspace-level 实验。
```

如果 C 又出现：

```text
说明 C 没清干净。
删除。
```

### 52.3 用户说“拖动后黑框”

先看：

```text
transparent iframe 是否回来。
iframe html/body 是否透明。
resize 后 themeSyncHistory。
pseudoBackgrounds。
sourceBoundary。
```

如果使用 transparent iframe，优先关掉。

如果 D 仍黑框，检查 compositor 和 body repaint。

不要 patch resize handle。

### 52.4 用户说“点几下又好了”

这通常指向：

```text
focus state
CodeMirror active line
selection overlay
compositor repaint
theme mutation timing
```

要记录点击顺序。

要看 `themeSyncHistory`。

要看 `visibleEditorLayers`。

不要把“点几下好了”当成可接受修法。

### 52.5 用户说“左边也闪”

先承认这是 parent workspace/editor 层。

检查：

```text
visibleEditorLayers
workspaceChrome
boundaryLayers
focus state
```

如果 OpenCode 没有主动调用 `workspace.setActiveLeaf()`，就不要在 OpenCode 里 patch 左侧 selector。

如果 OpenCode 主动调用了，就删掉或收敛触发点。

### 52.6 用户说“像 Obsidian 侧边栏也不行”

这说明 A 的审美不满足。

它不说明 A 工程失败。

如果用户目标仍是完整背景图，要去 workspace-level owner。

### 52.7 用户说“透明还是好看”

这说明 D 或 transparent iframe 的视觉吸引力存在。

但好看不等于稳定。

要分开记录：

```text
主观视觉偏好
工程稳定性
是否满足原始背景意义
是否引入补偿
```

## 53. 为什么“Simple”不是“少写几行”

用户要求最 Simple。

Simple 在这里指系统模型简单。

它不等于当前文件里改动最少。

### 53.1 几行 CSS 可能很复杂

例如：

```css
iframe {
  background: transparent;
}
```

这只是一行。

但它把问题交给 Electron/Chromium compositor。

它让最终像素依赖 parent window、iframe、focus、resize、GPU layer。

模型变复杂。

### 53.2 几十行删除可能更简单

删除 projection 可能改动更多。

但删除后模型变成：

```text
OpenCode 不负责 editor image。
OpenCode 只负责 material。
```

这是更简单的模型。

### 53.3 D 看起来简单但语义要诚实

D 的代码可以很短。

```text
body::before 用 Background 插件变量画图。
```

但它的语义不是“连续背景”。

它的语义是“右侧也画一张图”。

只要文档和 harness 都诚实，D 可以作为产品妥协。

如果文档说 D 是连续背景，D 就开始污染系统模型。

### 53.4 workspace-level 背景才是长期 Simple

长期最 Simple 的模型是：

```text
Background 插件画全局背景。
每个 pane 只画自己的 material。
OpenCode 不知道背景图几何。
```

这个模型可能实现不容易。

但它的概念最少。

它没有 projection。

它没有 iframe image duplication。

它没有 selector patch。

## 54. 未来设置项设计建议

如果后续要保留用户可选模式，不要把设置命名成“fix background”。

设置名要表达真实承诺。

### 54.1 推荐设置形态

可能的设置：

```text
webViewAppearance:
  opencode
  obsidian

obsidianBackdropMode:
  material
  best-effort-image
```

其中：

```text
material = A
best-effort-image = D
```

不要提供：

```text
continuous-editor-projection
transparent-parent-composite
```

### 54.2 设置说明

`material` 说明：

```text
Use Obsidian colors and translucent surfaces. Do not copy editor background images.
```

`best-effort-image` 说明：

```text
Paint the same background image inside OpenCode. The crop may not match Obsidian editor panes.
```

说明要直接。

不要暗示它能解决所有边界。

### 54.3 默认值

默认建议：

```text
material
```

原因：

```text
稳定。
没有 projection。
没有 transparent iframe。
不会对背景连续性做假承诺。
```

如果用户强烈偏好透明感，可以手动选：

```text
best-effort-image
```

## 55. 文档本身的维护规则

这份文档以后不要再变成聊天记录堆积。

追加内容必须满足三个条件。

### 55.1 必须有实验输入

写清楚：

```text
改了哪些文件
启用了哪个模式
用了什么 Obsidian 主题
用了什么 Background 设置
```

### 55.2 必须有验收输出

写清楚：

```text
截图路径
diagnostics 字段
用户是否接受
是否有黑框
是否有局部闪烁
```

### 55.3 必须有后续动作

只能写：

```text
保留
删除
降级为实验
移动到 Background 插件
```

不要写：

```text
模糊待定表述
没有触发条件的优化承诺
没有验收证据的主观描述
```

这些话不能指导下一步。

## 56. 最终建议的短句版本

给未来 agent：

```text
不要再证明 C。
不要再 patch selector。
先把 another-opencode-for-obsidian 收成 A 或 D。
如果用户仍要完整背景图意义，去 Background 插件做 workspace-level owner。
```

给未来用户：

```text
当前 OpenCode 插件能做的是 Obsidian 风格面板，或 best-effort 自己画图。
它不能在不改 Background 插件的情况下，把 editor-local 背景变成全 workspace 背景。
```

给未来实现：

```text
所有背景图连续性的承诺都必须从 Background 插件或 workspace owner 开始。
OpenCode 不再拥有这条承诺。
```
