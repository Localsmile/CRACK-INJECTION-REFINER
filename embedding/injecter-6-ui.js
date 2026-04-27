// injecter-6-ui.js: UI 진입점 (모달 생성 + DOM 주입 + 변경로그 + 기어 버튼)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = _w.localStorage;

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__injectLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__injectLoaded)) { console.error('[LoreInj:6-ui] inject 미로드'); return; }
  if (_w.__LoreInj.__uiLoaded) return;

  const { C, R, settings, CHANGELOG } = _w.__LoreInj;
  const VER = _w.__LoreInj.VER;

  // ModalManager 해결
  const MM = (typeof ModalManager !== 'undefined') ? ModalManager
          : (_w.ModalManager || (typeof window !== 'undefined' && window.ModalManager) || null);
  if (!MM) {
    console.error('[LoreInj:6-ui] ModalManager 미로드');
    return;
  }

  // 서브모듈 등록 대기 (최대 15초)
  const subDeadline = Date.now() + 15000;
  const requiredSubs = ['main', 'lore', 'merge', 'snapshot', 'file', 'extract', 'refiner', 'log', 'session', 'api', 'help'];
  const subFlags = { main: '__subMainLoaded', lore: '__subLoreLoaded', merge: '__subMergeLoaded', snapshot: '__subSnapshotLoaded', file: '__subFileLoaded', extract: '__subExtractLoaded', refiner: '__subRefinerLoaded', log: '__subLogLoaded', session: '__subSessionLoaded', api: '__subApiLoaded', help: '__subHelpLoaded' };
  while (Date.now() < subDeadline) {
    const loaded = requiredSubs.every(s => _w.__LoreInj[subFlags[s]]);
    if (loaded) break;
    await new Promise(r => setTimeout(r, 100));
  }

  const modal = MM.getOrCreateManager('c2');
  if (!modal || typeof modal.createMenu !== 'function') {
    console.error('[LoreInj:6-ui] modal.createMenu 없음');
    return;
  }

  // 메뉴 등록 함수 호출. createSubMenu 호환 처리는 injecter-6의 adapter가 담당한다.
  if (_w.__LoreInj.setupSubMenus) {
    _w.__LoreInj.setupSubMenus(modal);
  }

  // === DOM 진입점 ===
  // 1) 좌측 설정 메뉴에 "결정화 캐즘" 링크 추가
  function __updateModalMenu() {
    const modalEl = document.getElementById('web-modal');
    if (modalEl && !document.getElementById('chasm-decentral-menu')) {
      const itemFound = modalEl.getElementsByTagName('a');
      for (let item of itemFound) {
        if (item.getAttribute('href') === '/setting') {
          const clonedElement = item.cloneNode(true);
          clonedElement.id = 'chasm-decentral-menu';
          const textElement = clonedElement.getElementsByTagName('span')[0];
          if (textElement) textElement.innerText = '결정화 캐즘';
          clonedElement.setAttribute('href', 'javascript: void(0)');
          clonedElement.onclick = (event) => {
            event.preventDefault(); event.stopPropagation();
            MM.getOrCreateManager('c2').display(document.body.getAttribute('data-theme') !== 'light');
          };
          item.parentElement?.append(clonedElement);
          break;
        }
      }
    }
  }

  // 2) 채팅창 상단 패널에 "🔥 Chasm Tools" 버튼 삽입
  async function injectBannerButton() {
    const selected = document.getElementsByClassName('burner-button');
    if (selected && selected.length > 0) return;
    try {
      const isStory = /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname);
      const topPanel = document.getElementsByClassName(isStory ? 'css-1c5w7et' : 'css-l8r172');
      if (topPanel && topPanel.length > 0) {
        const topContainer = topPanel[0].childNodes[topPanel.length - 1]?.getElementsByTagName('div');
        if (!topContainer || topContainer.length <= 0) return;
        const topList = topContainer[0].children[0].children;
        const top = topList[topList.length - 1];
        if (!top) return;
        const buttonCloned = document.createElement('button');
        buttonCloned.innerHTML = '<p></p>'; buttonCloned.style.cssText = 'margin-right: 10px'; buttonCloned.className = 'burner-button';
        const textNode = buttonCloned.getElementsByTagName('p');
        top.insertBefore(buttonCloned, top.childNodes[0]); textNode[0].innerText = '🔥  Chasm Tools';
        buttonCloned.removeAttribute('onClick');
        buttonCloned.addEventListener('click', () => { MM.getOrCreateManager('c2').display(document.body.getAttribute('data-theme') !== 'light'); });
      }
    } catch(e) {}
  }

  async function doInjection() {
    if (!/\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(location.pathname) && !/\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) && !/\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname)) return;
    await injectBannerButton();
  }

  function __doModalMenuInit() {
    if (document.c2InjectorModalInit) return;
    document.c2InjectorModalInit = true;
    if (typeof GenericUtil !== 'undefined' && GenericUtil.attachObserver) {
      GenericUtil.attachObserver(document, () => { __updateModalMenu(); });
    } else {
      const observer = new MutationObserver(() => { __updateModalMenu(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', doInjection); window.addEventListener('load', doInjection); } else { doInjection(); }
    setInterval(doInjection, 2000);
  }

  // 3) 변경 로그 팝업 (버전 업데이트 시 1회)
  function showChangelogIfNew() {
    const lastVer = _ls.getItem('lore-injector-last-ver');
    if (lastVer === VER) return;
    const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;justify-content:center;align-items:center;';
    const box = document.createElement('div'); box.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:12px;width:100%;max-width:400px;padding:24px;display:flex;flex-direction:column;gap:16px;color:#eee;';
    const title = document.createElement('div'); title.textContent = '업데이트 완료! (' + VER + ')'; title.style.cssText = 'font-size:16px;font-weight:bold;color:#4a9;text-align:center;';
    const list = document.createElement('ul'); list.style.cssText = 'margin:0;padding:0 0 0 20px;display:flex;flex-direction:column;gap:10px;';
    CHANGELOG.forEach(item => { const li = document.createElement('li'); li.style.fontSize = '13px'; li.style.color = '#ccc'; li.textContent = item; list.appendChild(li); });
    const btn = document.createElement('button'); btn.textContent = '확인'; btn.style.cssText = 'padding:10px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;margin-top:8px;';
    btn.onclick = () => { _ls.setItem('lore-injector-last-ver', VER); document.body.removeChild(overlay); };
    box.appendChild(title); box.appendChild(list); box.appendChild(btn); overlay.appendChild(box); document.body.appendChild(overlay);
  }

  // 4) Fallback 기어 버튼 (비활성화됨)
  function ensureGearButton() {
    if (window.innerWidth <= 768) {
      const ex = document.getElementById('lore-inj-gear-btn'); if (ex) ex.remove();
      return;
    }
    if (document.getElementById('lore-inj-gear-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'lore-inj-gear-btn';
    btn.title = 'Lore Injector 설정 (Fallback)';
    btn.textContent = '⚙';
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;width:40px;height:40px;border-radius:50%;background:#258;color:#fff;border:1px solid #1a5;font-size:20px;cursor:pointer;z-index:9998;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:0;opacity:.75;';
    btn.onmouseenter = () => { btn.style.opacity = '1'; btn.style.background = '#369'; };
    btn.onmouseleave = () => { btn.style.opacity = '.75'; btn.style.background = '#258'; };
    btn.onclick = () => {
      try { MM.getOrCreateManager('c2').display(document.body.getAttribute('data-theme') !== 'light'); }
      catch(e) { console.error('[LoreInj:6-ui] display() 실패:', e); alert('모달 열기 실패: ' + (e.message || e)); }
    };
    document.body.appendChild(btn);
  }

  document.getElementById('lore-inj-gear-btn')?.remove();
  showChangelogIfNew();
  __doModalMenuInit();
  /* gear FAB 비활성화 — chasm 텍스트 진입점만 사용 */
  const gearObs = new MutationObserver(() => { /* gear FAB 비활성화 */ });
  gearObs.observe(document.body, { childList: true });
  window.addEventListener('resize', () => { /* gear FAB 비활성화 */ });

  Object.assign(_w.__LoreInj, { __uiLoaded: true });
  console.log('[LoreInj:6-ui] UI loaded (Chasm Tools banner + gear fallback attached)');
})();
