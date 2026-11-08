// ==UserScript==
 // @name         MusicBrainz: LiveFans Event Importer
 // @namespace    https://www.livefans.jp/
 // @version      0.2.0
 // @description  LiveFansの公演情報・ツアー日程をMusicBrainzのイベント作成フォームへ渡す
 // @match        https://www.livefans.jp/events/*
 // @match        https://www.livefans.jp/groups/*
 // @grant        GM_openInTab
 // @run-at       document-idle
 // ==/UserScript==

 (() => {
   'use strict';

   const MUSICBRAINZ_EVENT_URL =
     'https://musicbrainz.org/event/create';

   const PANEL_ID = 'lfmb-preview-panel';

   // ----------------------------------------
   // 共通
   // ----------------------------------------

   function getText(element) {
     return element?.textContent?.replace(/\s+/g, ' ').trim() || '';
   }

   function cleanVenueName(name) {
     return name
       .replace(/[＠@]/g, '')
       .replace(
         /[\(（]\s*(?:北海道|東京都|大阪府|京都府|.{2,3}県)\s*[\)）]/g,
         ''
       )
       .replace(/\s+/g, ' ')
       .trim();
   }

   function isEventPage() {
     return location.pathname.startsWith('/events/');
   }

   function isTourPage() {
     return location.pathname.startsWith('/groups/');
   }

   function removeExistingPanel() {
     document.getElementById(PANEL_ID)?.remove();
   }

   // ----------------------------------------
   // 単公演ページ
   // ----------------------------------------

   function getDateAndTime() {
     const dateElement = document.querySelector('p.date');
     const text = getText(dateElement) || getText(document.body);

     const dateMatch = text.match(
       /(\d{4})[年\/.-]\s*(\d{1,2})[月\/.-]\s*(\d{1,2})日?/
     );

     const timeMatch = text.match(
       /(\d{1,2}):(\d{2})\s*開演/
     );

     return {
       year: dateMatch?.[1] || '',
       month: dateMatch?.[2] || '',
       day: dateMatch?.[3] || '',
       time: timeMatch
         ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
         : '',
       raw: text
     };
   }

   function getEventName() {
     const selectors = [
       '.head h4.liveName2 a',
       'h4.liveName2 a',
       '.liveName2 a',
       '.head h4.liveName2'
     ];

     for (const selector of selectors) {
       const name = getText(document.querySelector(selector));

       if (
         name &&
         !name.includes('ライブ・セットリスト情報サービス') &&
         !name.includes('＠')
       ) {
         return name;
       }
     }

     return '';
   }

   function getVenue() {
     const selectors = [
       'a[href*="/venues/"]',
       '.venue a',
       '.venue',
       '.place',
       '.hall'
     ];

     for (const selector of selectors) {
       const element = document.querySelector(selector);
       const name = getText(element);

       if (name && name.length < 150) {
         return cleanVenueName(name);
       }
     }

     const dateElement = document.querySelector('p.date');

     if (dateElement?.parentElement) {
       const parentText = getText(dateElement.parentElement);
       const dateText = getText(dateElement);
       const remaining = parentText.replace(dateText, '').trim();

       if (remaining && remaining.length < 150) {
         return cleanVenueName(remaining);
       }
     }

     return '';
   }

   function getArtists() {
     const artists = [
       ...document.querySelectorAll(
         'h4.artistName2 a[href*="/artists/"]'
       )
     ]
       .map(a => getText(a))
       .filter(Boolean);

     return [...new Set(artists)];
   }

   function collectEventData() {
     const dateTime = getDateAndTime();

     return {
       name: getEventName(),
       year: dateTime.year,
       month: dateTime.month,
       day: dateTime.day,
       time: dateTime.time,
       venue: getVenue(),
       artists: getArtists(),
       sourceUrl: location.href
     };
   }

   // ----------------------------------------
   // ツアーページ
   // ----------------------------------------

   function getTourName() {
  const element = document.querySelector('h3.liveName');
  return getText(element);
}

   function getTourArtists() {
     const selectors = [
       'h4.artistName2 a[href*="/artists/"]',
       '.artistName2 a[href*="/artists/"]',
       'a[href*="/artists/"]'
     ];

     for (const selector of selectors) {
       const artists = [
         ...document.querySelectorAll(selector)
       ]
         .map(a => getText(a))
         .filter(Boolean);

       const uniqueArtists = [...new Set(artists)];

       if (uniqueArtists.length > 0) {
         return uniqueArtists;
       }
     }

     return [];
   }

   function getTourEvents() {
     const rows = document.querySelectorAll(
       '.scheduleBlock table tbody tr'
     );

     const events = [];

     rows.forEach(row => {
       const cells = row.querySelectorAll('td');

       if (cells.length < 3) {
         return;
       }

       const dateLink = cells[0].querySelector(
         'a[href*="/events/"]'
       );

       if (!dateLink) {
         return;
       }

       const dateText = getText(dateLink);
       const timeText = getText(cells[1]);
       const venueText = getText(cells[2]);

       const eventUrl = new URL(
         dateLink.getAttribute('href'),
         location.origin
       ).href;

       const dateMatch = dateText.match(
         /(\d{4})\/(\d{1,2})\/(\d{1,2})/
       );

       if (!dateMatch) {
         console.warn(
           '[LiveFans → MusicBrainz] 日付を取得できません:',
           dateText
         );
         return;
       }

       const timeMatch = timeText.match(
         /(\d{1,2}):(\d{2})/
       );

       events.push({
         dateText,
         year: dateMatch[1],
         month: dateMatch[2].padStart(2, '0'),
         day: dateMatch[3].padStart(2, '0'),
         time: timeMatch
           ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
           : '',
         venue: cleanVenueName(venueText),
         eventUrl
       });
     });

     return events;
   }

   // ----------------------------------------
   // MusicBrainz URL
   // ----------------------------------------

   function buildMusicBrainzUrl(data) {
     const params = new URLSearchParams();

     if (data.name) {
       params.set('edit-event.name', data.name);
     }

     if (data.year) {
       params.set(
         'edit-event.period.begin_date.year',
         data.year
       );

       params.set(
         'edit-event.period.end_date.year',
         data.year
       );
     }

     if (data.month) {
       params.set(
         'edit-event.period.begin_date.month',
         data.month
       );

       params.set(
         'edit-event.period.end_date.month',
         data.month
       );
     }

     if (data.day) {
       params.set(
         'edit-event.period.begin_date.day',
         data.day
       );

       params.set(
         'edit-event.period.end_date.day',
         data.day
       );
     }

     if (data.time) {
       params.set('edit-event.time', data.time);
     }

     if (data.sourceUrl) {
       params.set(
         'edit-event.edit_note',
         `LiveFans Event Importer (https://github.com/yakumo0209/LiveFans-to-MusicBrainz-Event-Importer)\nSource: ${data.sourceUrl}`
       );
     }

     params.set('lfmb_venue', data.venue || '');

     params.set(
       'lfmb_artists',
       JSON.stringify(data.artists || [])
     );

     params.set('lfmb_tour', data.tour || '');

     return `${MUSICBRAINZ_EVENT_URL}?${params.toString()}`;
   }

   // ----------------------------------------
   // 共通パネルスタイル
   // ----------------------------------------

   function createPanel(title) {
     removeExistingPanel();

     const panel = document.createElement('div');
     panel.id = PANEL_ID;

     Object.assign(panel.style, {
       position: 'fixed',
       right: '20px',
       bottom: '20px',
       zIndex: '999999',
       width: '380px',
       maxWidth: 'calc(100vw - 40px)',
       maxHeight: '75vh',
       overflowY: 'auto',
       padding: '16px',
       background: '#fff',
       color: '#222',
       border: '1px solid #888',
       borderRadius: '10px',
       boxShadow: '0 4px 18px rgba(0,0,0,.25)',
       fontSize: '14px',
       lineHeight: '1.5'
     });

     const heading = document.createElement('div');
     heading.textContent = title;

     Object.assign(heading.style, {
       fontSize: '16px',
       fontWeight: 'bold',
       marginBottom: '10px'
     });

     panel.appendChild(heading);

     return panel;
   }

   function addInfoRow(panel, label, value) {
     const row = document.createElement('div');
     row.style.marginBottom = '5px';

     const labelElement = document.createElement('strong');
     labelElement.textContent = `${label}：`;

     const valueElement = document.createElement('span');
     valueElement.textContent = value || '(取得できませんでした)';
     valueElement.style.overflowWrap = 'anywhere';

     row.append(labelElement, valueElement);
     panel.appendChild(row);
   }

   function addCloseButton(panel, container) {
     const closeButton = document.createElement('button');
     closeButton.type = 'button';
     closeButton.textContent = 'Close';

     Object.assign(closeButton.style, {
       padding: '9px 10px',
       border: '1px solid #aaa',
       borderRadius: '6px',
       background: '#f3f3f3',
       color: '#222',
       cursor: 'pointer'
     });

     closeButton.addEventListener('click', () => {
       panel.remove();
     });

     container.appendChild(closeButton);
   }

   // ----------------------------------------
   // 単公演プレビュー
   // ----------------------------------------

   function showPreview(data) {
     const panel = createPanel('Add Event');

     const fields = [
       ['Event Name', data.name],
       [
         'Date',
         data.year && data.month && data.day
           ? `${data.year}-${data.month}-${data.day}`
           : ''
       ],
       ['Time', data.time],
       ['Venue', data.venue],
       ['Performer', data.artists.join(', ')]
     ];

     fields.forEach(([label, value]) => {
       addInfoRow(panel, label, value);
     });

     const buttonContainer = document.createElement('div');

     Object.assign(buttonContainer.style, {
       display: 'flex',
       gap: '8px',
       marginTop: '12px'
     });

     const openButton = document.createElement('button');
     openButton.type = 'button';
     openButton.textContent = 'Open in MusicBrainz';

     Object.assign(openButton.style, {
       flex: '1',
       padding: '9px 10px',
       border: 'none',
       borderRadius: '6px',
       background: '#2867a5',
       color: '#fff',
       cursor: 'pointer',
       fontWeight: 'bold'
     });

     openButton.addEventListener('click', () => {
       GM_openInTab(buildMusicBrainzUrl(data), {
         active: true
       });
     });

     buttonContainer.appendChild(openButton);
     addCloseButton(panel, buttonContainer);

     panel.appendChild(buttonContainer);
     document.body.appendChild(panel);
   }

   // ----------------------------------------
   // ツアー日程プレビュー
   // ----------------------------------------

   function showTourPreview() {
     const tourName = getTourName();
     const artists = getTourArtists();
     const events = getTourEvents();

     if (events.length === 0) {
       console.warn(
         '[LiveFans → MusicBrainz] ツアー日程を取得できませんでした。'
       );
       return;
     }

     const panel = createPanel(
       'MusicBrainz Event 一括作成'
     );

     addInfoRow(panel, 'Tour Name', tourName);
     addInfoRow(panel, 'Performer', artists.join(', '));

     const selectAllLabel = document.createElement('label');

     Object.assign(selectAllLabel.style, {
       display: 'block',
       marginTop: '12px',
       marginBottom: '8px',
       fontWeight: 'bold'
     });

     const selectAll = document.createElement('input');
     selectAll.type = 'checkbox';
     selectAll.checked = true;

     selectAllLabel.appendChild(selectAll);
     selectAllLabel.appendChild(
       document.createTextNode(' Select all')
     );

     panel.appendChild(selectAllLabel);

     const list = document.createElement('div');

     Object.assign(list.style, {
       border: '1px solid #ddd',
       borderRadius: '6px',
       overflow: 'hidden'
     });

     events.forEach((event, index) => {
       const label = document.createElement('label');

       Object.assign(label.style, {
         display: 'block',
         padding: '8px',
         borderBottom: '1px solid #ddd',
         cursor: 'pointer'
       });

       const checkbox = document.createElement('input');
       checkbox.type = 'checkbox';
       checkbox.checked = true;
       checkbox.dataset.index = String(index);

       const text = document.createElement('span');

       text.style.marginLeft = '6px';
       text.textContent =
         `${event.year}/${event.month}/${event.day}` +
         ` ${event.time || '時刻不明'}` +
         ` ${event.venue || '会場不明'}`;

       label.append(checkbox, text);
       list.appendChild(label);
     });

     panel.appendChild(list);

     selectAll.addEventListener('change', () => {
       list.querySelectorAll('input[type="checkbox"]').forEach(
         checkbox => {
           checkbox.checked = selectAll.checked;
         }
       );
     });

     list.addEventListener('change', () => {
       const checkboxes = [
         ...list.querySelectorAll('input[type="checkbox"]')
       ];

       selectAll.checked = checkboxes.every(
         checkbox => checkbox.checked
       );
     });

     const buttonContainer = document.createElement('div');

     Object.assign(buttonContainer.style, {
       display: 'flex',
       gap: '8px',
       marginTop: '12px'
     });

     const openButton = document.createElement('button');
     openButton.type = 'button';
     openButton.textContent = 'Open in MusicBrainz';

     Object.assign(openButton.style, {
       flex: '1',
       padding: '9px 10px',
       border: 'none',
       borderRadius: '6px',
       background: '#2867a5',
       color: '#fff',
       cursor: 'pointer',
       fontWeight: 'bold'
     });

     openButton.addEventListener('click', () => {
       const selectedEvents = events.filter((event, index) => {
         const checkbox = list.querySelector(
           `input[data-index="${index}"]`
         );

         return checkbox?.checked;
       });

       if (selectedEvents.length === 0) {
         alert('Select Events');
         return;
       }

       let openIndex = 0;

function openNextEvent() {
  if (openIndex >= selectedEvents.length) {
    return;
  }

  const event = selectedEvents[openIndex];

  const data = {
    name: tourName,
    tour: tourName,
    year: event.year,
    month: event.month,
    day: event.day,
    time: event.time,
    venue: event.venue,
    artists,
    sourceUrl: event.eventUrl
  };

  GM_openInTab(buildMusicBrainzUrl(data), {
    active: openIndex === 0,
    insert: true
  });

  openIndex++;

  if (openIndex < selectedEvents.length) {
    setTimeout(openNextEvent, 5000);
  }
}

openNextEvent();
     });

     buttonContainer.appendChild(openButton);
     addCloseButton(panel, buttonContainer);

     panel.appendChild(buttonContainer);
     document.body.appendChild(panel);

     console.log(
       '[LiveFans → MusicBrainz] 取得したツアー情報:',
       {
         tourName,
         artists,
         events
       }
     );
   }

   // ----------------------------------------
   // 初期化
   // ----------------------------------------

   function init() {
     if (isTourPage()) {
       showTourPreview();
       return;
     }

     if (!isEventPage()) {
       return;
     }

     const data = collectEventData();

     if (!data.name) {
       console.warn(
         '[LiveFans → MusicBrainz] イベント名を取得できませんでした。'
       );
     }

     showPreview(data);

     console.log(
       '[LiveFans → MusicBrainz] 取得した公演情報:',
       data
     );
   }

   init();
 })();
