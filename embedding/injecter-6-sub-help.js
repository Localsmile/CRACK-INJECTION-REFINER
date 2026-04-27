// injecter-6-sub-help.js: 제작자 프로필 placeholder (기존 장문 도움말 탭 비활성화)
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!_w.__LoreInj || !_w.__LoreInj.__settingsLoaded) { console.error('[LoreInj:sub-help] settings 미로드'); return; }
  if (_w.__LoreInj.__subHelpLoaded) return;

  const { C } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  // 장문 도움말은 각 설정 옆 ? 인라인 도움말로 이동.
  // 이 탭은 추후 제작자 프로필/크레딧 영역으로 사용할 수 있게 빈 프로필 탭만 유지.
  _w.__LoreInj.registerSubMenu('profile', function(modal) {
    modal.createSubMenu('제작자 프로필', (m) => {
      m.replaceContentPanel((panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const title = document.createElement('div');
          title.textContent = '제작자 프로필';
          title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;';
          const desc = document.createElement('div');
          desc.textContent = '도움말 탭은 비활성화되었습니다. 각 설정 옆 ? 버튼에서 해당 옵션 설명을 확인하세요.';
          desc.style.cssText = 'font-size:12px;color:#ccc;line-height:1.7;word-break:keep-all;';
          nd.appendChild(title);
          nd.appendChild(desc);
        }});
      }, '제작자 프로필');
    });
  });

  _w.__LoreInj.__subHelpLoaded = true;
})();