import { describe, expect, test } from "bun:test";
import {
  mergeTerminalBundlePatchDiagnostics,
  patchOpenCodeTerminalBundle,
} from "../../src/bridge/OpenCodeTerminalBundlePatch";

describe("OpenCodeTerminalBundlePatch", () => {
  test("patches terminal theme and transparency anchors when each anchor is unique", () => {
    const result = patchOpenCodeTerminalBundle(sessionBundle());

    expect(result.status).toBe("patched");
    expect(result.patches.theme).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.patches.transparency).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.patchedPoints).toEqual(["theme", "transparency"]);
    expect(result.code).toContain("__anotherOpenCodeForObsidianTerminalTheme");
    expect(result.code).toContain("allowTransparency:!0,convertEol:!1,theme:Q()");
    expect(result.code).not.toContain("allowTransparency:!1,convertEol:!1,theme:Q()");
  });

  test("reports missing anchors without fabricating a terminal patch", () => {
    const result = patchOpenCodeTerminalBundle("const noop = true;");

    expect(result.status).toBe("missing-anchor");
    expect(result.patchedPoints).toEqual([]);
    expect(result.patches.theme).toEqual({ status: "missing-anchor", anchorCount: 0 });
    expect(result.patches.transparency).toEqual({ status: "missing-anchor", anchorCount: 0 });
    expect(result.code).toBe("const noop = true;");
  });

  test("returns original code when a terminal anchor is ambiguous", () => {
    const input = `${sessionBundle()}\n${sessionBundle()}`;
    const result = patchOpenCodeTerminalBundle(input);

    expect(result.status).toBe("ambiguous-anchor");
    expect(result.patches.theme).toEqual({ status: "ambiguous-anchor", anchorCount: 2 });
    expect(result.patches.transparency).toEqual({
      status: "ambiguous-anchor",
      anchorCount: 2,
    });
    expect(result.code).toBe(input);
  });

  test("aggregates patch points across assets", () => {
    const first = mergeTerminalBundlePatchDiagnostics(
      null,
      "/assets/session-BRk4LUvN.js",
      patchOpenCodeTerminalBundle(sessionBundle())
    );
    const aggregate = mergeTerminalBundlePatchDiagnostics(
      first,
      "/assets/index-UupoAUKC.js",
      patchOpenCodeTerminalBundle("const noop = true;")
    );

    expect(aggregate.status).toBe("patched");
    expect(aggregate.patches.theme).toMatchObject({
      status: "patched",
      anchorCount: 1,
      path: "/assets/session-BRk4LUvN.js",
    });
    expect(aggregate.patches.transparency).toMatchObject({
      status: "patched",
      anchorCount: 1,
      path: "/assets/session-BRk4LUvN.js",
    });
  });
});

function sessionBundle(): string {
  return `
    const Q=w(()=>{const j=i.mode()==="dark"?"dark":"light",we=T1[j],Ae=i.themes()[i.themeId()];
    if(!Ae)return we;const Je=j==="dark"?Ae.dark:Ae.light;if(!Je?.seeds&&!Je?.palette)return we;
    const ne=$u(Je,j==="dark"),K=ne["text-stronger"]??we.foreground,Me=ne["background-stronger"]??we.background,Pe=j==="dark"?.25:.2,Be=K.startsWith("#")?K:we.foreground,Xe=Ui(Be,Pe);
    return{background:Me,foreground:K,cursor:K,selectionBackground:Xe}});
    const ne=new Ae.Terminal({cursorBlink:!0,cursorStyle:"bar",cols:S?.cols,rows:S?.rows,fontSize:14,fontFamily:Qs(r.appearance.terminalFont()),allowTransparency:!1,convertEol:!1,theme:Q(),scrollback:1e4,ghostty:Je});
  `;
}
