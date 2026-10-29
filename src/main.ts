import './ui/app.css';
import { hasGame } from './game/state';
import { actions, setRenderHook, type ScreenId } from './ui/core';
import { renderEntrance } from './ui/screens/entrance';
import { renderFacility } from './ui/screens/facility';
import { renderGraduation } from './ui/screens/graduation';
import { renderMain } from './ui/screens/main';
import { mountMatch3D, renderMatchScreen } from './ui/screens/match';
import { bindOrder, renderOrder } from './ui/screens/order';
import { renderPlayers } from './ui/screens/players';
import { renderRecords } from './ui/screens/records';
import { bindSetup, renderSetup } from './ui/screens/setup';
import { bindTraining, renderTraining } from './ui/screens/training';

const stageEl = document.getElementById('viewport-stage') as HTMLElement | null;
const app = document.getElementById('app') as HTMLElement;

/**
 * スマホ横持ち（例: 844×390, 667×375, 932×430）でもPC基準(1280×720)のUI比率を
 * 一切崩さず画面いっぱいにフィットさせる仮想ステージ自動スケーリング
 */
function syncViewportStage(): void {
  if (!stageEl) return;
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const BASE_W = 1280;
  const BASE_H = 720;
  const scale = Math.min(vw / BASE_W, vh / BASE_H, 1);

  if (scale < 0.999) {
    const stageW = Math.ceil(vw / scale);
    const stageH = Math.ceil(vh / scale);
    stageEl.style.width = `${stageW}px`;
    stageEl.style.height = `${stageH}px`;
    stageEl.style.transform = `scale(${scale})`;
  } else {
    stageEl.style.width = '100%';
    stageEl.style.height = '100%';
    stageEl.style.transform = 'none';
  }
}

syncViewportStage();
window.addEventListener('resize', syncViewportStage);
window.addEventListener('orientationchange', () => setTimeout(syncViewportStage, 60));
window.visualViewport?.addEventListener('resize', syncViewportStage);

function currentScreen(): ScreenId {
  const raw = location.hash.replace(/^#\/?/, '') as ScreenId;
  const valid: ScreenId[] = ['setup', 'entrance', 'graduation', 'main', 'players', 'training', 'order', 'facility', 'records', 'match'];
  if (!valid.includes(raw)) return hasGame() ? 'main' : 'setup';
  if (raw !== 'setup' && !hasGame()) return 'setup';
  return raw;
}

function render(): void {
  const scr = currentScreen();
  switch (scr) {
    case 'setup':
      app.innerHTML = renderSetup();
      bindSetup(app);
      break;
    case 'entrance':
      app.innerHTML = renderEntrance();
      break;
    case 'graduation':
      app.innerHTML = renderGraduation();
      break;
    case 'main':
      app.innerHTML = renderMain();
      break;
    case 'players':
      app.innerHTML = renderPlayers();
      break;
    case 'training':
      app.innerHTML = renderTraining();
      bindTraining(app);
      break;
    case 'order':
      app.innerHTML = renderOrder();
      bindOrder(app);
      break;
    case 'facility':
      app.innerHTML = renderFacility();
      break;
    case 'records':
      app.innerHTML = renderRecords();
      break;
    case 'match':
      app.innerHTML = renderMatchScreen();
      mountMatch3D();
      break;
  }
}

// 画面全体のクリックイベント委譲
document.addEventListener('click', (ev) => {
  const target = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]');
  if (!target) return;
  if ((target as HTMLButtonElement).disabled) return;
  const act = target.dataset.act!;
  const fn = actions[act];
  if (fn) fn(target, ev);
});

// スペースキーで1球進める ／ Escキーでポップアップを閉じる
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (document.querySelector('.modal-back')) {
      actions['close-modal']?.(document.body, ev);
      return;
    }
    if (document.querySelector('.tactics-modal-overlay')) {
      actions['toggle-tactics-drawer']?.(document.body, ev);
      return;
    }
  }
  if (ev.code === 'Space' && location.hash === '#/match') {
    if (document.querySelector('.tactics-modal-overlay, .modal-back')) return;
    const act = actions['step-pitch'];
    if (act) {
      ev.preventDefault();
      act(document.body, ev);
    }
  }
});

setRenderHook(render);
window.addEventListener('hashchange', render);
render();
