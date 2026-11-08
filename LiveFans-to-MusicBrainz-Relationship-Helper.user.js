// ==UserScript==
 // @name         LiveFans to MusicBrainz Relationship Helper
 // @namespace    https://musicbrainz.org/
 // @version      0.2.0
 // @description  LiveFansから渡された会場・出演者・ツアー名でMusicBrainzの関係行を追加する補助スクリプト
 // @match        https://musicbrainz.org/event/create*
 // @grant        none
 // @run-at       document-idle
 // ==/UserScript==

 (() => {
   'use strict';

   const params = new URLSearchParams(location.search);

   const venueName = params.get('lfmb_venue') || '';
   const tourName = params.get('lfmb_tour') || '';

   let artistNames = [];

   try {
     artistNames = JSON.parse(
       params.get('lfmb_artists') || '[]'
     );
   } catch (error) {
     console.warn(
       '[LFMB helper] 出演者データを解析できません:',
       error
     );
   }

   if (!Array.isArray(artistNames)) {
     artistNames = [];
   }

   artistNames = [...new Set(
     artistNames
       .map(name => String(name).trim())
       .filter(Boolean)
   )];

   if (!venueName && !artistNames.length && !tourName) {
     return;
   }

   // ----------------------------------------
   // 補助用パラメータをアドレス欄から取り除く
   // ----------------------------------------

   try {
     const cleanUrl = new URL(location.href);

     cleanUrl.searchParams.delete('lfmb_venue');
     cleanUrl.searchParams.delete('lfmb_artists');
     cleanUrl.searchParams.delete('lfmb_tour');

     history.replaceState(
       history.state,
       '',
       cleanUrl
     );
   } catch (_) {}

   const sleep = ms =>
     new Promise(resolve => setTimeout(resolve, ms));

   // ----------------------------------------
   // 共通
   // ----------------------------------------

   function isVisible(element) {
     if (!element) return false;

     const rect = element.getBoundingClientRect();

     return rect.width > 0 && rect.height > 0;
   }

   function setInputValue(input, value) {
     if (!input) return false;

     const setter = Object.getOwnPropertyDescriptor(
       HTMLInputElement.prototype,
       'value'
     )?.set;

     if (setter) {
       setter.call(input, value);
     } else {
       input.value = value;
     }

     input.dispatchEvent(
       new Event('input', { bubbles: true })
     );

     input.dispatchEvent(
       new Event('change', { bubbles: true })
     );

     return true;
   }

   async function waitFor(selector, timeout = 10000) {
     const start = Date.now();

     while (Date.now() - start < timeout) {
       const element = document.querySelector(selector);

       if (isVisible(element)) {
         return element;
       }

       await sleep(150);
     }

     return null;
   }

   // ----------------------------------------
   // Relationship Dialog
   // ----------------------------------------

   async function openRelationshipDialog() {
     const addButton = await waitFor(
       'button.add-relationship'
     );

     if (!addButton) {
       console.warn(
         '[LFMB helper] Add relationshipボタンが見つかりません。'
       );

       return false;
     }

     addButton.click();

     const typeInput = await waitFor(
       'input.relationship-type'
     );

     if (!typeInput) {
       console.warn(
         '[LFMB helper] 関係編集モーダルを確認できません。'
       );

       return false;
     }

     return true;
   }

   // ----------------------------------------
   // Relationship Type
   // ----------------------------------------

   async function setRelationshipType(typeInput, value) {
     if (!typeInput) {
       return false;
     }

     setInputValue(typeInput, value);
     typeInput.focus();

     // MusicBrainzの候補表示を待つ
     await sleep(700);

     // 候補の自動選択はしない
     return true;
   }

   // ----------------------------------------
   // Relationship追加
   // ----------------------------------------

   async function addPrefilledRelationship(kind, name) {
     const opened = await openRelationshipDialog();

     if (!opened) {
       return false;
     }

     const entityType = document.querySelector(
       'select.entity-type'
     );

     if (entityType && entityType.value !== kind) {
       entityType.value = kind;

       entityType.dispatchEvent(
         new Event('change', { bubbles: true })
       );

       await sleep(500);
     }

     const typeInput = document.querySelector(
       'input.relationship-type'
     );

     const targetInput = document.querySelector(
       'input.relationship-target'
     );

     if (!targetInput) {
       console.warn(
         '[LFMB helper] 関連先の入力欄が見つかりません。'
       );

       return false;
     }

     // 出演者：Main Performer
     if (kind === 'artist' && typeInput) {
       await setRelationshipType(
         typeInput,
         '936c7c95-3156-3889-a062-8a0cd57f8946'
       );
     }

     // ツアー：Event-Series「part of」
     if (kind === 'series' && typeInput) {
       await setRelationshipType(
         typeInput,
         '707d947d-9563-328a-9a7d-0c5b9c3a9791'
       );
     }

     // 関連先の名前を入力
     setInputValue(targetInput, name);
     targetInput.focus();

     console.info(
       '[LFMB helper] 関係編集欄を開きました:',
       kind,
       name
     );

     return true;
   }

   // ----------------------------------------
   // タスク表示名
   // ----------------------------------------

   function getTaskLabel(task) {
     switch (task.kind) {
       case 'place':
         return 'Venue';

       case 'artist':
         return 'Main Performer';

       case 'series':
         return 'Tour Series';

       default:
         return task.kind;
     }
   }

   // ----------------------------------------
   // メイン
   // ----------------------------------------

   async function run() {
     await sleep(900);

     const tasks = [];

     // 会場
     if (venueName) {
       tasks.push({
         kind: 'place',
         name: venueName
       });
     }

     // 出演者
     for (const name of artistNames) {
       tasks.push({
         kind: 'artist',
         name
       });
     }

     // ツアーSeries
     if (tourName) {
       tasks.push({
         kind: 'series',
         name: tourName
       });
     }

     if (!tasks.length) {
       return;
     }

     // ----------------------------------------
     // パネル
     // ----------------------------------------

     const panel = document.createElement('div');

     panel.id = 'lfmb-relationship-helper-panel';

     Object.assign(panel.style, {
       position: 'fixed',
       right: '18px',
       bottom: '18px',
       zIndex: '999999',
       width: '320px',
       maxWidth: 'calc(100vw - 36px)',
       padding: '14px',
       border: '1px solid #888',
       borderRadius: '8px',
       background: '#fff',
       color: '#222',
       boxShadow: '0 3px 15px rgba(0,0,0,.25)',
       font: '14px/1.5 sans-serif'
     });

     const title = document.createElement('strong');

     title.textContent = 'Add Relationship';

     panel.appendChild(title);

     const status = document.createElement('p');

     status.textContent =
       `Unprocessed : ${tasks.length}`;

     panel.appendChild(status);

     // ----------------------------------------
     // Add Relationshipボタン
     // ----------------------------------------

     let index = 0;

     const nextButton = document.createElement('button');

     nextButton.type = 'button';

     nextButton.textContent =
       `Add Relationship（${getTaskLabel(tasks[0])}）：${tasks[0].name}`;

     Object.assign(nextButton.style, {
       width: '100%',
       padding: '8px',
       cursor: 'pointer'
     });

     nextButton.addEventListener('click', async () => {
       nextButton.disabled = true;

       const task = tasks[index];

       const success = await addPrefilledRelationship(
         task.kind,
         task.name
       );

       if (!success) {
         nextButton.disabled = false;
         return;
       }

       index += 1;

       status.textContent =
         `Processed : ${index}/${tasks.length}`;

       if (index >= tasks.length) {
         nextButton.textContent = 'Done';
         nextButton.disabled = true;
       } else {
         const next = tasks[index];

         nextButton.textContent =
           `Add Relationship（${getTaskLabel(next)}）：${next.name}`;

         nextButton.disabled = false;
       }
     });

     // ----------------------------------------
     // Closeボタン
     // ----------------------------------------

     const closeButton = document.createElement('button');

     closeButton.type = 'button';
     closeButton.textContent = 'Close';

     Object.assign(closeButton.style, {
       marginTop: '8px',
       width: '100%',
       padding: '7px',
       cursor: 'pointer'
     });

     closeButton.addEventListener('click', () => {
       panel.remove();
     });

     panel.appendChild(nextButton);
     panel.appendChild(closeButton);

     document.body.appendChild(panel);

     console.info(
       '[LFMB helper] Relationshipタスク:',
       tasks
     );
   }

   run();
 })();
