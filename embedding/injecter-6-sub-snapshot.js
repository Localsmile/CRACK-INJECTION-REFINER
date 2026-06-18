// injecter / sub-snapshot - 로어 스냅샷 (백업)
// 역할: 스냅샷 목록, 복원, 삭제
// 의존: injecter-3 (settings, db, C, restoreSnapshot)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-snapshot] settings 미로드'); return; }
  if (_w.__LoreInj.__subSnapshotLoaded) return;

  const { C, db, restoreSnapshot } = _w.__LoreInj;
  const BTN_BASE = 'min-height:30px;padding:5px 10px;font-size:11px;border-radius:7px;background:transparent;border:1px solid var(--li-line,#2f3b4f);color:var(--li-text-soft,#a9b6c7);cursor:pointer;font-weight:800;';
  const TONE = { muted: 'var(--li-muted,#748196)', soft: 'var(--li-text-soft,#a9b6c7)', text: 'var(--li-text,#e7edf5)', accent: 'var(--li-accent,#5aa7ff)', danger: '#ef6b6b' };

  _w.__LoreInj.registerSettingsPage('snapshot', '스냅샷', (m) => {
      const renderSnapshotUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '스냅샷 복원'; t.style.cssText = 'font-size:15px;color:var(--li-text,#e7edf5);font-weight:900;margin-bottom:8px;'; nd.appendChild(t);
          const snaps = await db.snapshots.orderBy('timestamp').reverse().toArray();
          if (!snaps.length) { nd.appendChild(Object.assign(document.createElement('div'), { textContent: '저장된 스냅샷이 없습니다.', style: 'color:var(--li-muted,#748196);font-size:12px;padding:24px;text-align:center;border:1px dashed var(--li-line,#2f3b4f);border-radius:10px;background:rgba(7,13,23,.42);' })); return; }
          const list = document.createElement('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:330px;overflow-y:auto;';
          for (const s of snaps) {
            const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(7,13,23,.68);border:1px solid var(--li-line,#2f3b4f);border-radius:10px;gap:10px;';
            const info = document.createElement('div'); info.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0;';
            const sTitle = document.createElement('span'); sTitle.textContent = `[${s.packName}] ${s.label} (${s.data.length}개)`; sTitle.style.cssText = 'font-size:12px;color:' + TONE.text + ';font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            const sTime = document.createElement('span'); sTime.textContent = new Date(s.timestamp).toLocaleString(); sTime.style.cssText = 'font-size:10px;color:' + TONE.muted + ';';
            info.appendChild(sTitle); info.appendChild(sTime);
            const btnWrap = document.createElement('div'); btnWrap.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';
            const rBtn = document.createElement('button'); rBtn.textContent = '복원'; rBtn.style.cssText = BTN_BASE + 'color:' + TONE.accent + ';border-color:rgba(90,167,255,.45);';
            rBtn.onclick = async () => { if (confirm(`[${s.packName}] 팩을 이 시점으로 복원할 것?\n기존 데이터는 덮어씌워집니다.`)) { await restoreSnapshot(s.id); alert('복원 완료.'); m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리'); } };
            const dBtn = document.createElement('button'); dBtn.textContent = '삭제'; dBtn.style.cssText = BTN_BASE + 'color:' + TONE.danger + ';border-color:rgba(239,107,107,.45);';
            dBtn.onclick = async () => { if (confirm('삭제?')) { await db.snapshots.delete(s.id); m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리'); } };
            btnWrap.appendChild(rBtn); btnWrap.appendChild(dBtn);
            row.appendChild(info); row.appendChild(btnWrap); list.appendChild(row);
          }
          nd.appendChild(list);
        }});
      };
      m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리');
  });

  _w.__LoreInj.__subSnapshotLoaded = true;
})();
