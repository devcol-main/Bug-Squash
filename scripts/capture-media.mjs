// README용 이미지/GIF 생성. 사용법: npm run media
//  - Vite 개발 서버를 임의 포트로 띄우고, 격리된 임시 프로필의 헤드리스 Chrome을 CDP(WebSocket)로 조작한다.
//  - Chrome 경로: /Applications/Google Chrome.app/... 또는 환경변수 CHROME_PATH. ffmpeg: /opt/homebrew/bin/ffmpeg 또는 PATH.
//  - 봇(자동 플레이)은 이 스크립트가 페이지에 주입한다(scripts/lib/media-lib.mjs). 게임 코드에는 없다.
//  - 고정 시드: 환경변수 MEDIA_SEED(기본 7). 봇은 실제 rAF 시간에 반응하므로 재실행 시 세부가 약간 다를 수 있다. 개발 서버 전용 훅 window.__bugSquash.restart(seed, overrides)로 판을 시작한다.
//  - 산출물: docs/media/{title,gameplay-3x3,gameplay-4x4,gameover,options}.png, bug-squash.gif
import { createServer } from 'vite';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GIF_DELAY, GIF_DIE_AT, STILL_DIE_AFTER_SEC, GIF_OVERRIDES, GIF_PRESETS, KEY_CODES, STILL_3X3_OVERRIDES, STILL_4X4_OVERRIDES, STILL_DELAY,
  SHOT_LEVELS, buildConcatList, ffmpegGifArgs, installBot, probeScene, sceneMatches, shotLevelFor, storageSeed,
} from './lib/media-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'docs/media');
const SEED = Number(process.env.MEDIA_SEED ?? 7);
if (!Number.isInteger(SEED)) {
  console.error(`MEDIA_SEED must be an integer (got "${process.env.MEDIA_SEED}")`);
  process.exit(1);
}
const W = 390;
const H = 844;
const MAX_GIF_BYTES = 5 * 1024 * 1024;
const MIN_STILL_SCORE = 300; // 스틸 판 최종 점수가 이보다 낮으면 실패(조용히 나빠지지 않게)
const SEND_TIMEOUT_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  // CHROME_PATH가 지정되면 그것만 쓴다(없는 경로면 기본 경로로 몰래 넘어가지 않고 오류).
  const env = process.env.CHROME_PATH;
  if (env) {
    if (!existsSync(env)) throw new Error(`CHROME_PATH does not exist: ${env}`);
    return env;
  }
  const def = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(def)) throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH.');
  return def;
}

function findFfmpeg() {
  if (existsSync('/opt/homebrew/bin/ffmpeg')) return '/opt/homebrew/bin/ffmpeg';
  const r = spawnSync('ffmpeg', ['-version']);
  if (r.status === 0) return 'ffmpeg';
  throw new Error('ffmpeg not found (expected /opt/homebrew/bin/ffmpeg or in PATH).');
}

/** 최소 CDP 클라이언트. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    const failAll = (reason) => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error(`${p.method}: ${reason}`));
      }
      this.pending.clear();
    };
    ws.addEventListener('close', () => failAll('connection closed'));
    ws.addEventListener('error', () => failAll('connection error'));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== undefined) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (p) clearTimeout(p.timer);
        if (p) (m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result));
      } else if (m.method) {
        for (const h of this.handlers.get(m.method) ?? []) h(m.params);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error(`WebSocket failed: ${url}`)), { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: timed out after ${SEND_TIMEOUT_MS}ms`));
      }, SEND_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, method, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  on(method, fn) {
    this.handlers.set(method, [...(this.handlers.get(method) ?? []), fn]);
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  async waitFor(expression, timeoutMs, label) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await this.eval(expression)) return;
      await sleep(30);
    }
    throw new Error(`Timeout waiting for ${label}`);
  }
  /** 연결을 끊고 탭도 닫는다(이후 녹화에 영향 없게). */
  async close() {
    try {
      this.ws.close();
    } catch {}
    if (this.targetId) await fetch(`http://127.0.0.1:${this.port}/json/close/${this.targetId}`, { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }).catch(() => {});
  }
}

/** holder.proc에 프로세스를 즉시 넘겨, 대기 중 실패해도 cleanup이 항상 kill할 수 있게 한다. */
async function launchChrome(userDataDir, holder) {
  const proc = spawn(
    findChrome(),
    [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--mute-audio', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  holder.proc = proc;
  holder.exited = new Promise((r) => proc.once('exit', r));
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const timer = setTimeout(() => rej(new Error('Chrome did not report a DevTools address in time')), 20000);
    proc.on('error', (e) => {
      clearTimeout(timer);
      rej(new Error(`Failed to start Chrome: ${e.message}`));
    });
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        res(m[1]);
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      rej(new Error(`Chrome exited early (code ${code}): ${buf.slice(-300)}`));
    });
  });
  return { port: new URL(wsUrl).port };
}

/** 새 탭을 열고 CDP 세션을 돌려준다. */
async function openPage(port, scale) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
  const target = await res.json();
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  cdp.targetId = target.id;
  cdp.port = port;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: scale, mobile: true });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  return cdp;
}

/** 시드·캡처용 localStorage 값을 심고 게임을 열어 UI가 준비될 때까지 기다린다. */
async function loadGame(cdp, url) {
  const set = storageSeed().map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join('');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.clear();${set}}catch(e){}` });
  await cdp.send('Page.navigate', { url });
  await cdp.waitFor(`document.getElementById('ui')?.classList.contains('ready') && !!window.__bugSquash`, 20000, 'UI ready');
  await cdp.eval(`document.fonts.ready.then(() => true)`);
  await cdp.eval(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
}

/** headless에서 rAF가 정상 속도(약 60fps)로 도는지 1초간 측정. 너무 느리면 영상 속도가 어긋나므로 중단한다. */
async function checkRaf(cdp) {
  const fps = await cdp.eval(
    `new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; const dt = performance.now() - t0; if (dt >= 1000) res(n * 1000 / dt); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`,
  );
  console.log(`rAF rate: ${fps.toFixed(1)} fps`);
  if (fps < 30) throw new Error(`rAF is too slow in headless Chrome (${fps.toFixed(1)} fps); capture would not match real play speed`);
}

async function shot(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, name);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

const pressSpace = (cdp) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}))`);
/** 새 판을 시드/override로 시작하고(DEV 훅) 같은 틱에 봇을 설치한다. */
const startRound = (cdp, seed, overrides, delay, dieAt, skipGolden = false) =>
  cdp.eval(
    `window.__bugSquash.restart(${seed}, ${JSON.stringify(overrides)}); (${installBot})(${JSON.stringify({ seed, delay, dieAt, skipGolden, keyRows: KEY_CODES })}); true`,
  );
async function botError(cdp) {
  const err = await cdp.eval(`window.__bot ? window.__bot.error : null`);
  if (err) throw new Error(`Bot error: ${err}`);
}
const waitBoard = (cdp) =>
  cdp.waitFor(`document.querySelector('#board li:not([hidden])') !== null && document.querySelector('.ui').dataset.phase === 'gameOver'`, 15000, 'game over board');

/**
 * 촬영 조건이 맞는 장면을 기다린다. 해당 보드 크기가 되고 나서 오래 기다리면 조건을 완화하고, 완화했다면 로그에 남긴다.
 * 완화 시간은 목표 보드 크기가 된 시점부터 센다.
 */
async function waitScene(cdp, which, timeoutMs) {
  const t0 = Date.now();
  const wantSize = which === '3x3' ? 3 : 4;
  let since = null;
  let lastLevel = -1;
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timeout waiting for ${which} scene`);
    await botError(cdp);
    const scene = await cdp.eval(`(${probeScene})()`);
    if (scene.size === wantSize && !scene.expanding && since === null) since = Date.now();
    const waited = since === null ? 0 : (Date.now() - since) / 1000;
    const level = shotLevelFor(which, waited);
    const idx = SHOT_LEVELS[which].indexOf(level);
    if (idx !== lastLevel && idx > 0) console.log(`${which} shot: relaxed to level ${idx} after ${waited.toFixed(1)}s ${JSON.stringify(level)}`);
    lastLevel = idx;
    if (sceneMatches(scene, which, level)) return { level, levelIndex: idx, scene };
    await sleep(25);
  }
}

async function captureStills(port, url, outputs) {
  const cdp = await openPage(port, 2);
  try {
    await loadGame(cdp, url);
    outputs.push(await shot(cdp, 'title.png'));

    await cdp.eval(`document.getElementById('options-btn').click()`);
    await cdp.waitFor(`!document.getElementById('options').hidden`, 3000, 'options panel');
    await sleep(500);
    outputs.push(await shot(cdp, 'options.png'));
    await cdp.eval(`document.getElementById('opt-close').click()`);
    await cdp.waitFor(`document.getElementById('options').hidden`, 3000, 'options close');

    await pressSpace(cdp); // 타이틀 첫 입력 = 시작 (이어서 시드 판으로 바꾼다)
    await startRound(cdp, SEED, STILL_3X3_OVERRIDES, STILL_DELAY, null);
    const a = await waitScene(cdp, '3x3', 40000);
    outputs.push(await shot(cdp, 'gameplay-3x3.png'));
    console.log(`3x3 shot: [${a.scene.kinds.join(',')}] (level ${a.levelIndex}: ${JSON.stringify(a.level)})`);

    await startRound(cdp, SEED + 1, STILL_4X4_OVERRIDES, STILL_DELAY, null, true); // 촬영 전에는 골든을 건드리지 않는다
    const b = await waitScene(cdp, '4x4', 70000);
    outputs.push(await shot(cdp, 'gameplay-4x4.png'));
    console.log(`4x4 shot: [${b.scene.kinds.join(',')}] (level ${b.levelIndex}: ${JSON.stringify(b.level)})`);

    // 촬영 뒤에도 사람 같은 속도로 계속 플레이하고, 18초 뒤부터 일부러 실수해 라이프를 소진한다
    await cdp.eval(`window.__bot.skipGolden = false; window.__bot.delay = ${JSON.stringify(GIF_DELAY)}; window.__bot.dieAt = window.__bugSquash.logic().time + ${STILL_DIE_AFTER_SEC}`);
    await cdp.waitFor(`window.__bot.error || window.__bugSquash.logic().isGameOver`, 90000, 'game over');
    await botError(cdp);
    await waitBoard(cdp);
    await sleep(1200);
    outputs.push(await shot(cdp, 'gameover.png'));
    const final = JSON.parse(await cdp.eval(`(() => { const s = window.__bugSquash.logic(); return JSON.stringify({ score: s.score, maxCombo: s.maxCombo, time: +s.time.toFixed(1) }); })()`));
    console.log(`stills final score: ${final.score} (max combo ${final.maxCombo}, play time ${final.time}s)`);
    if (final.score < MIN_STILL_SCORE) throw new Error(`Still round final score ${final.score} is below ${MIN_STILL_SCORE}; gameover.png would look unrealistic`);
    return JSON.stringify(final);
  } finally {
    await cdp.close();
  }
}

async function captureGif(port, url, tmp, outputs) {
  const cdp = await openPage(port, 1);
  const framesDir = join(tmp, 'frames');
  mkdirSync(framesDir);
  try {
    await loadGame(cdp, url);
    await checkRaf(cdp);
    const frames = [];
    let n = 0;
    cdp.on('Page.screencastFrame', (p) => {
      const file = join(framesDir, `f${String(n++).padStart(5, '0')}.jpg`);
      writeFileSync(file, Buffer.from(p.data, 'base64'));
      frames.push({ file, t: p.metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    const rel = () => (frames.length ? frames[frames.length - 1].t - frames[0].t : 0);
    const timeline = [];
    const mark = (label) => timeline.push(`${rel().toFixed(1)}s ${label}`);
    await sleep(900); // 타이틀 장면
    mark('title shown');
    await pressSpace(cdp);
    await startRound(cdp, SEED, GIF_OVERRIDES, GIF_DELAY, GIF_DIE_AT);
    mark('Space pressed, round starts (3x3)');
    // 장면 변화를 폴링해 타임라인에 남긴다
    let size = 3;
    let lives = 3;
    let mult = 1;
    let hard = false;
    let golden = false;
    const t0 = Date.now();
    for (;;) {
      if (Date.now() - t0 > 60000) throw new Error('Timeout waiting for game over');
      await botError(cdp);
      const s = JSON.parse(await cdp.eval(`(() => { const l = window.__bugSquash.logic(); const ks = []; for (let i = 0; i < l.cellCount; i++) ks.push(l.getCell(i).kind); return JSON.stringify({ over: l.isGameOver, size: l.boardSize, lives: l.lives, mult: l.multiplier, score: l.score, t: l.time, hard: ks.includes('hard'), golden: ks.includes('golden') }); })()`));
      if (s.hard && !hard) { hard = true; mark('first hard bug on board'); }
      if (s.golden && !golden) { golden = true; mark('first golden bug on board'); }
      if (s.mult !== mult) { mult = s.mult; mark(`multiplier x${mult} (score ${s.score})`); }
      if (s.size !== size) { size = s.size; mark(`board expands to ${size}x${size} (play time ${s.t.toFixed(1)}s)`); }
      if (s.lives !== lives) { lives = s.lives; mark(`lives ${lives}`); }
      if (s.over) { mark(`game over (score ${s.score}, play time ${s.t.toFixed(1)}s)`); break; }
      await sleep(40);
    }
    await waitBoard(cdp);
    mark('game over overlay + Top 10 visible');
    await sleep(2500); // 게임 오버/Top 10 장면
    await cdp.send('Page.stopScreencast');
    if (frames.length < 10) throw new Error(`Too few screencast frames: ${frames.length}`);
    const endT = frames[frames.length - 1].t + 0.5;
    const seconds = endT - frames[0].t;
    mark('end');
    const list = join(tmp, 'frames.txt');
    writeFileSync(list, buildConcatList(frames, endT));
    const ffmpeg = findFfmpeg();
    const out = resolve(outDir, 'bug-squash.gif');
    let ok = false;
    for (const p of GIF_PRESETS) {
      const r = spawnSync(ffmpeg, ffmpegGifArgs(list, out, p), { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
      const bytes = statSync(out).size;
      console.log(`gif ${p.width}px ${p.fps}fps ${p.colors} colors: ${(bytes / 1024 / 1024).toFixed(2)} MB (${frames.length} source frames, ${seconds.toFixed(1)}s)`);
      if (bytes <= MAX_GIF_BYTES) {
        ok = true;
        break;
      }
    }
    if (!ok) throw new Error('GIF is larger than 5MiB even at the smallest preset.');
    outputs.push(out);
    return { seconds, timeline };
  } finally {
    await cdp.close();
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'bugsquash-media-'));
  const profile = join(tmp, 'profile'); // 사용자의 실제 프로필과 분리된 임시 user-data-dir
  mkdirSync(profile);
  let server = null;
  const chrome = { proc: null, exited: null };
  const cleanup = async () => {
    try {
      if (chrome.proc && chrome.proc.exitCode === null) {
        chrome.proc.kill('SIGKILL');
        await Promise.race([chrome.exited, sleep(3000)]); // 종료를 기다린 뒤 프로필 삭제
      }
    } catch {}
    try {
      await server?.close();
    } catch {}
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); // tmp는 mkdtemp가 만든 경로뿐
    } catch (e) {
      console.warn(`WARNING: could not remove temp dir ${tmp}: ${e.message}`);
    }
  };
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.on(sig, () => {
      cleanup().finally(() => process.exit(code));
    });
  }
  try {
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'warn',
      server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } },
    });
    await server.listen();
    const addr = server.httpServer.address();
    const url = `http://127.0.0.1:${addr.port}/`;
    console.log(`dev server: ${url} (seed ${SEED})`);
    const { port } = await launchChrome(profile, chrome);
    const outputs = [];
    const stills = await captureStills(port, url, outputs);
    console.log(`stills run result: ${stills}`);
    const gif = await captureGif(port, url, tmp, outputs);
    console.log(`gif run timeline:\n  ${gif.timeline.join('\n  ')}`);
    console.log(`gif length: ${gif.seconds.toFixed(1)}s`);
    console.log('\nOutputs:');
    for (const f of outputs) console.log(`  ${f.replace(root + '/', '')}  ${(statSync(f).size / 1024).toFixed(0)} KB`);
  } finally {
    await cleanup();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`capture-media failed: ${err?.stack ?? err}`);
    process.exit(1);
  },
);
