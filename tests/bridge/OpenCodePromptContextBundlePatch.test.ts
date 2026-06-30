import { describe, expect, test } from "bun:test";
import {
  mergePromptContextBundlePatchDiagnostics,
  patchOpenCodePromptContextBundle,
} from "../../src/bridge/OpenCodePromptContextBundlePatch";

describe("OpenCodePromptContextBundlePatch", () => {
  test("patches port, activation, and close anchors when each real bundle anchor is unique", () => {
    const result = patchOpenCodePromptContextBundle(`${indexBundle()}\n${sessionComposerBundle()}`);

    expect(result.status).toBe("patched");
    expect(result.patches.port).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.patches.activation).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.patches.close).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.code).toContain("__anotherOpenCodeForObsidianInstallPromptContextPort");
    expect(result.code).toContain("__anotherOpenCodeForObsidianPromptContextHooks?.activated");
    expect(result.code).toContain("__anotherOpenCodeForObsidianPromptContextHooks?.removed");
    expect(result.code).not.toContain("localStorage");
    expect(result.code).not.toContain("sessionStorage");
  });

  test("patches activation and close anchors when the runtime bundle uses different minified variables", () => {
    const result = patchOpenCodePromptContextBundle(runtimeSessionComposerBundle());

    expect(result.status).toBe("missing-anchor");
    expect(result.patchedPoints).toEqual(["activation", "close"]);
    expect(result.patches.activation).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.patches.close).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.code).toContain(
      "l.$$click=()=>{if(window.__anotherOpenCodeForObsidianPromptContextHooks?.activated?.(n)!==false)e.openComment(n)}"
    );
    expect(result.code).toContain(
      "onClick:h=>{h.stopPropagation(),window.__anotherOpenCodeForObsidianPromptContextHooks?.removed?.(n),e.remove(n)}"
    );
  });

  test("patches the anchor present in a single asset and reports the missing points", () => {
    const input = indexBundle();
    const result = patchOpenCodePromptContextBundle(input);

    expect(result.status).toBe("missing-anchor");
    expect(result.patchedPoints).toEqual(["port"]);
    expect(result.patches.port).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.patches.activation).toEqual({ status: "missing-anchor", anchorCount: 0 });
    expect(result.code).toContain("__anotherOpenCodeForObsidianInstallPromptContextPort");
  });

  test("patches the prompt context port when the provider uses the current session accessor", () => {
    const result = patchOpenCodePromptContextBundle(currentSessionAccessorBundle());

    expect(result.status).toBe("missing-anchor");
    expect(result.patchedPoints).toEqual(["port"]);
    expect(result.patches.port).toEqual({ status: "patched", anchorCount: 1 });
    expect(result.code).toContain("__anotherOpenCodeForObsidianInstallPromptContextPort");
    expect(result.code).toContain("items:()=>h().context.items()");
    expect(result.code).toContain("replaceComments:u=>h().context.replaceComments(u)");
  });

  test("aggregates patch points across the actual split OpenCode assets", () => {
    const indexResult = patchOpenCodePromptContextBundle(indexBundle());
    const sessionResult = patchOpenCodePromptContextBundle(sessionComposerBundle());
    const first = mergePromptContextBundlePatchDiagnostics(
      null,
      "/assets/index-Cw1UwfOj.js",
      indexResult
    );
    const aggregate = mergePromptContextBundlePatchDiagnostics(
      first,
      "/assets/session-composer-state-DxmJo8vx.js",
      sessionResult
    );

    expect(aggregate.status).toBe("patched");
    expect(aggregate.patches.port).toMatchObject({
      status: "patched",
      anchorCount: 1,
      path: "/assets/index-Cw1UwfOj.js",
    });
    expect(aggregate.patches.activation).toMatchObject({
      status: "patched",
      anchorCount: 1,
      path: "/assets/session-composer-state-DxmJo8vx.js",
    });
    expect(aggregate.patches.close).toMatchObject({
      status: "patched",
      anchorCount: 1,
      path: "/assets/session-composer-state-DxmJo8vx.js",
    });
  });

  test("returns original code when an anchor is ambiguous", () => {
    const input = `${sessionComposerBundle()}\n${"onClick:x=>{x.stopPropagation(),e.remove(n)}"}`;
    const result = patchOpenCodePromptContextBundle(input);

    expect(result.status).toBe("ambiguous-anchor");
    expect(result.patches.close).toEqual({ status: "ambiguous-anchor", anchorCount: 2 });
    expect(result.code).toBe(input);
  });
});

function indexBundle(): string {
  return `
    const{use:Ode,provider:xE}=rn({name:"Prompt",gate:!1,init:()=>{const e=cr(),[t]=Lh(),n=Ks(),r=new Map;
    const l=U(()=>a(t.draftId?{draftID:t.draftId}:{dir:e.dir,id:e.id})),c=u=>u?a(u):l();
    return{ready:()=>l().ready,current:()=>l().current(),cursor:()=>l().cursor(),dirty:()=>l().dirty(),context:{items:()=>l().context.items(),add:u=>l().context.add(u),remove:u=>l().context.remove(u),removeComment:(u,d)=>l().context.removeComment(u,d),updateComment:(u,d,f)=>l().context.updateComment(u,d,f),replaceComments:u=>l().context.replaceComments(u)},set:(u,d,f)=>c(f).set(u,d),reset:u=>c(u).reset()}}})
  `;
}

function sessionComposerBundle(): string {
  return `
    const Xs=e=>u(B,{get when(){return e.items.length>0},get children(){var t=qm();return h(t,u(ht,{get each(){return e.items},children:n=>{
    return u(Yt,{get children(){var f=jm(),p=f.firstChild,b=p.firstChild,v=b.firstChild;return f.$$click=()=>e.openComment(n),
    h(p,u(pt,{type:"button",icon:"close-small",variant:"ghost",class:"ml-auto size-3.5 text-text-weak hover:text-text-strong transition-all",onClick:x=>{x.stopPropagation(),e.remove(n)},get"aria-label"(){return e.t("prompt.context.removeFile")}}),null),
    ue(x=>wt(f,{"group shrink-0 flex flex-col rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover":!0,"hover:bg-surface-interactive-weak":n.type==="file"&&!!n.commentID&&!d,"bg-background-stronger":!d},x)),f}})}})),t}})
  `;
}

function runtimeSessionComposerBundle(): string {
  return `
    const Je=e=>u(B,{get when(){return e.items.length>0},get children(){var t=qm();return h(t,u(ht,{get each(){return e.items},children:n=>{
    return u(Yt,{get children(){var l=jm(),p=l.firstChild,b=p.firstChild,v=b.firstChild;return l.$$click=()=>e.openComment(n),
    h(p,u(pt,{type:"button",icon:"close-small",variant:"ghost",class:"ml-auto size-3.5 text-text-weak hover:text-text-strong transition-all",onClick:h=>{h.stopPropagation(),e.remove(n)},get"aria-label"(){return e.t("prompt.context.removeFile")}}),null),
    ue(h=>wt(l,{"group shrink-0 flex flex-col rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover":!0,"hover:bg-surface-interactive-weak":!!n.commentID&&!a,"bg-background-stronger":!a},h)),l}})}})),t}})
  `;
}

function currentSessionAccessorBundle(): string {
  return `
    const{use:Km,provider:wF}=xr({name:"Prompt",gate:!1,init:()=>{const e=Fr(),t=Vr(),[n]=Hf(),r=Ki(),i=kr(),s=Go(),o=Lr(),a=new Map;
    const f=v=>yF(r().scope,v),h=A(()=>f(n.draftId?{draftID:n.draftId}:{dir:gn(t().directory),id:e.id})),g=v=>v?f(v):h();
    return{ready:fve(h),current:()=>h().current(),cursor:()=>h().cursor(),dirty:()=>h().dirty(),context:{items:()=>h().context.items(),add:v=>h().context.add(v),remove:v=>h().context.remove(v),removeComment:(v,y)=>h().context.removeComment(v,y),updateComment:(v,y,b)=>h().context.updateComment(v,y,b),replaceComments:v=>h().context.replaceComments(v)},set:(v,y,b)=>g(b).set(v,y),reset:v=>g(v).reset()}}})
  `;
}
