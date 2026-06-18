import { describe, expect, test } from "bun:test";
import {
  mergeKeyboardBundlePatchDiagnostics,
  patchOpenCodeKeyboardBundle,
} from "../../src/bridge/OpenCodeKeyboardBundlePatch";

describe("OpenCodeKeyboardBundlePatch", () => {
  test("patches the command catalog getter anchor when it is unique", () => {
    const result = patchOpenCodeKeyboardBundle(commandBundle());

    expect(result.status).toBe("patched");
    expect(result.patches.port).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.patches.responsiveSidebarToggle).toEqual({
      status: "patched",
      anchorCount: 1,
    });
    expect(result.patchedPoints).toEqual(["port", "responsiveSidebarToggle"]);
    expect(result.code).toContain("__anotherOpenCodeForObsidianInstallKeyboardPort");
    expect(result.code).toContain("catalog:()=>ke()");
    expect(result.code).toContain("options:()=>oe()");
    expect(result.code).toContain(
      '(typeof window<"u"&&window.matchMedia("(min-width: 1280px)").matches?d.sidebar:d.mobileSidebar).toggle()'
    );
    expect(result.code).not.toContain("localStorage");
    expect(result.code).not.toContain("sessionStorage");
  });

  test("patches the command port when the sidebar toggle anchor is missing", () => {
    const result = patchOpenCodeKeyboardBundle(catalogOnlyBundle());

    expect(result.status).toBe("missing-anchor");
    expect(result.patches.port).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.patches.responsiveSidebarToggle).toEqual({
      status: "missing-anchor",
      anchorCount: 0,
    });
    expect(result.patchedPoints).toEqual(["port"]);
    expect(result.code).toContain("__anotherOpenCodeForObsidianInstallKeyboardPort");
  });

  test("reports missing anchor without patching", () => {
    const input = "return{ready:()=>true}";
    const result = patchOpenCodeKeyboardBundle(input);

    expect(result.status).toBe("missing-anchor");
    expect(result.code).toBe(input);
    expect(result.patches.port).toEqual({ status: "missing-anchor", anchorCount: 0 });
    expect(result.patches.responsiveSidebarToggle).toEqual({
      status: "missing-anchor",
      anchorCount: 0,
    });
  });

  test("returns original code when the anchor is ambiguous", () => {
    const input = `${commandBundle()}\n${commandBundle()}`;
    const result = patchOpenCodeKeyboardBundle(input);

    expect(result.status).toBe("ambiguous-anchor");
    expect(result.code).toBe(input);
    expect(result.patches.port).toEqual({ status: "ambiguous-anchor", anchorCount: 2 });
    expect(result.patches.responsiveSidebarToggle).toEqual({
      status: "ambiguous-anchor",
      anchorCount: 2,
    });
  });

  test("aggregates patch diagnostics across assets", () => {
    const first = mergeKeyboardBundlePatchDiagnostics(
      null,
      "/assets/index-Cw1UwfOj.js",
      patchOpenCodeKeyboardBundle(commandBundle())
    );
    const aggregate = mergeKeyboardBundlePatchDiagnostics(
      first,
      "/assets/session-Cw1UwfOj.js",
      patchOpenCodeKeyboardBundle("return{ready:()=>true}")
    );

    expect(aggregate.status).toBe("patched");
    expect(aggregate.patches.port).toMatchObject({
      status: "patched",
      anchorCount: 1,
      path: "/assets/index-Cw1UwfOj.js",
    });
    expect(aggregate.patches.responsiveSidebarToggle).toMatchObject({
      status: "patched",
      anchorCount: 1,
      path: "/assets/index-Cw1UwfOj.js",
    });
  });
});

function commandBundle(): string {
  return `
    const{use:ude,provider:GE}=rn({name:"Command",init:()=>{const e=xx(),t=yy(),n=zz();
    const ke=U(()=>Object.entries(t).map(([id,meta])=>({id,...meta})));
    const oe=U(()=>n().map(opt=>({...opt,keybind:e.keybinds.get(opt.id)??opt.keybind})));
    return{register(u,d){},trigger(u,d){},keybind(u){return""},show:()=>{},keybinds:u=>{},suspended:()=>!1,get catalog(){return ke()},get options(){return oe()}}}})
    E.register("layout",()=>{const F=[{id:"sidebar.toggle",title:_.t("command.sidebar.toggle"),category:_.t("command.category.view"),keybind:"mod+b",onSelect:()=>d.sidebar.toggle()},{id:"project.open",title:_.t("command.project.open")}];return F})
  `;
}

function catalogOnlyBundle(): string {
  return `
    const{use:ude,provider:GE}=rn({name:"Command",init:()=>{const e=xx(),t=yy(),n=zz();
    const ke=U(()=>Object.entries(t).map(([id,meta])=>({id,...meta})));
    const oe=U(()=>n().map(opt=>({...opt,keybind:e.keybinds.get(opt.id)??opt.keybind})));
    return{register(u,d){},trigger(u,d){},keybind(u){return""},show:()=>{},keybinds:u=>{},suspended:()=>!1,get catalog(){return ke()},get options(){return oe()}}}})
  `;
}
