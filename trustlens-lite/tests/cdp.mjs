import { spawn } from 'node:child_process';
export async function launch(port, dir) {
  const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${dir}`,'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let list; for (let i=0;i<40;i++){ try{ list = await (await fetch(`http://localhost:${port}/json/list`)).json(); if(list.length) break;}catch{} await sleep(250);}
  const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend=new Map(); ws.onmessage=(m)=>{const d=JSON.parse(m.data); if(d.id&&pend.has(d.id)){pend.get(d.id)(d.result??d.error);pend.delete(d.id);}};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
  const ev = async (e) => { const r = await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails)); return r.result.value; };
  const key = (k, extra = {}) => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, ...(k==='Enter'?{text:'\r'}:{}), windowsVirtualKeyCode: ({Escape:27,ArrowDown:40,ArrowUp:38,Enter:13,Home:36,End:35,Tab:9})[k], ...extra }).then(()=>send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:k,windowsVirtualKeyCode:({Escape:27,ArrowDown:40,ArrowUp:38,Enter:13,Home:36,End:35,Tab:9})[k]}));
  return { send, ev, key, sleep, close: () => { ws.close(); chrome.kill(); } };
}
