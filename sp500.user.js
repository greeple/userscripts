// ==UserScript==
// @name           Search posts2 (500 posts per page edition)
// @name:ru        Поиск постов (быстрый по 500 постов)
// @description    Search for posts by user(-s) or(and) text in current topic (500 posts/page fast mode with standard link calculation)
// @description:ru Быстрый поиск постов по 500 на страницу с пересчетом ссылок на стандартные страницы по 20 постов
// @version        5.1.0
// @author         Halibut (mod for 500-posts & link recalculation)
// @namespace      https://greasyfork.org/en/users/145947-halibut
// @include        http*://forum.ru-board.com/topic.cgi?forum=*&topic=*
// @noframes
// @run-at         document-start
// @grant          none
// ==/UserScript==


window.addEventListener("DOMContentLoaded", function f() {
    'use strict';
    this.removeEventListener("DOMContentLoaded", f);
    const body = document.body,
          style = document.head.appendChild(document.createElement("style")),
          dats = [...document.getElementsByClassName("tb")].map(el => el.getElementsByClassName("dats")[0]),
          listener = {
              options: {
                  // <--- НАСТРОЙКИ СКОРОСТИ И СЕТИ --->
                    concurrency: 3    // Параллельные запросы (3 - быстро и без 429)
                  , requestDelay: 0 // Пауза между запросами (мс)
                  , maxRetries: 3     // Повторов при 429 или сбое связи
                  , retryDelay: 2500  // Пауза перед повтором при 429 (мс)

                  // <--- ОПЦИИ СКРИПТА --->
                  , showAlerts: false  // Показывать алерты по окончании поиска
                  , scrollToSearchResults: true  // Автоматически прокручивать страницу к результатам поиска (если showAlerts == true, то, при подтверждении, все-равно прокрутит к результатам)
                  , hideSearchButton: false  // Показывать кнопку поиска только при наведении курсора на пост
                  , autoOpenSpoilerWithResult: false  // Раскрывать спойлер с результатами поиска автоматически
                  , reversPostSorting: true  // обратить сортировку по дате для найденных постов (от новых к старым)
                  , headToResult: false  // Включать шапку темы (если она создана выбранным пользоватем или в ней найден текст) в результаты поиска
                  , srchInSigs: false  // Искать ли, при по тексту, в подписях пользователей
                  , srchInQuotes: false  //  Искать ли, при по тексту, в цитатах
                  , imgsToLinks: true  // Заменять изображения в найденных постах ссылками на них
                  , createCnMenu: true  // Добавить в контекстное меню пункт запускающий поиск (только для FF)
                  , searchOnProfileLinksByRMB: false  // Поиск при клике ПКМ по ссылкам ведущим на профиль пользователя (только если нет выделенного текста и не нажаты клавиши модификаторы)
                  , fillSearchFormWithNames: true  // Заполнять в диалоговом окне поиска по тексту поле именем(-ами)
                  , nameToFillSrchForm: null  // Впишите сюда имя (в кавычках) которым всегда будет заполняться поле имени в форма поиска по ПКМ
                  , namesToSearch: ['Name1', 'Name2', 'Name3', 'etc...']  // Список имен которые можно будет выбрать из выпадающего меню в форме поиска
                  , highlightMatches: false   // Включает подсветку совпадений в тексте найденных постов.
                                              // Влияет на производительность и может поломать верстку постов
                                              // (если, например, часть найденной фразы находится внутри одного элемента, а часть - за его пределами).
                                              // Подсветит результат и в цитатах / подписях, даже при их исключении из поиска (только подсветит, на результаты не влияет)
                  , highlightColor: 'yellow'  // Цвет подсветки (html color, rgb(a) / hsl(a) / hex, etc)
              }
              , names: []
              , xhrPool: []
              , txt: ''
              , dtStmp: null
              , forum: null
              , topic: null
              , hasPinnedHead: false
              , firstPostSignature: null
              , ttlShow: '\u25BA Показать результаты поиска'
              , ttlHide: '\u25BC Скрыть результаты поиска'
              , ttlLdng: '\u23F3 Поиск... (Нажмите, чтобы прервать)'
              , ttlNotFnd: '\u26A0 Сообщений не найдено!'
              , get name() { return this.name = this.getName() }
              , set name(str) { return this.setName(str) }
              , get text() {
                  const text = this.txt;
                  delete this.txt;
                  return text;
              }
              , set text(str) { if (str) return this.txt = str; }
              , get win() { delete this.win; return this.win = window.top }
              , get loc() { delete this.loc; return this.loc = this.win.location.href }
              , get actnBox() {
                  delete this.actnBox;
                  return this.actnBox = [...document.getElementsByTagName("table")].find(el => el.querySelector("a[href^='post.cgi?action=new']")
                                                                                         || !el.getElementsByTagName('td')[0].children.length)
              }
              , get isFF() {
                  delete this.isFF;
                  return this.isFF = this.win.navigator && this.win.navigator.userAgent && this.win.navigator.userAgent.toLowerCase().includes("firefox")
              }
              , get spHd() { delete this.spHd; return this.spHd = this.getSpHd() }
              , get spBd() { delete this.spBd; return this.spBd = this.getSpBd() }
              , get spTTl() { delete this.spTTl; return this.spTTl = this.spHd && this.spHd.getElementsByTagName('td')[0] }
              , get navBox() { delete this.navBox; return this.navBox = this.getNavBox() }
              , getSel() { return this.win.getSelection && this.win.getSelection().toString() || "" }
              , abortXhrs() {
                  if (!this.xhrPool.length) return;
                  for (const xhr of this.xhrPool) xhr && xhr.abort();
                  this.xhrPool.length = 0;
              }
              , delay(ms, stmp) {
                  return new Promise(resolve => {
                      const start = Date.now();
                      const interval = setInterval(() => {
                          if (this.dtStmp !== stmp || Date.now() - start >= ms) {
                              clearInterval(interval);
                              resolve();
                          }
                      }, 50);
                  });
              }
              , prepareSntc(str, cs, ww) {
                  const escStr = s => s.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&').replace(/\s+/g, '\\s+'),
                        rgxp = s => new RegExp(s, cs ? 'i' : ''),
                        wwrgxp = s => new RegExp('(?:[^а-яА-Яa-zA-Z0-9]|^)' + s + '(?:(?!(?=[а-яА-Яa-zA-Z0-9]))|$)', cs ? 'i' : '');
                  if (Array.isArray(str)) {
                      str = str.map(el => escStr(el));
                      return ww ? wwrgxp('(?:' + str.join('|') + ')') : rgxp(str.join('|'))
                  }
                  return ww ? wwrgxp(escStr(str)) : rgxp(escStr(str));
              }
              , getCrntPost(arr) {
                  const clst = this.isFF ? 0 : parseInt(this.win.innerHeight / 2);
                  return arr.reduce((prev, curr) => (Math.abs(curr - clst) < Math.abs(prev - clst) ? curr : prev))
              }
              , spawn(gen) {
                  const continuer = (verb, arg) => {
                            let result;
                            try { result = generator[verb](arg); } catch (err) { return Promise.reject(err); }
                            if (result.done) return result.value;
                            return Promise.resolve(result.value).then(onFulfilled, onRejected);
                        },
                        generator = gen(),
                        onFulfilled = continuer.bind(continuer, 'next'),
                        onRejected = continuer.bind(continuer, 'throw');
                  return onFulfilled();
              }
              , prompt(name, txt) {
                  return new Promise((res, rej) => {
                      body.appendChild(document.createElement('div')).outerHTML = html;
                      const mdlOverlay = document.getElementById('spu-modal'),
                            clsBtn = document.getElementById('spu-close'),
                            regChkbx = document.getElementById('spu-regexp'),
                            csChkbx = document.getElementById('spu-case'),
                            highlight = document.getElementById('spu-highlight'),
                            sig = document.getElementById('spu-sig'),
                            qt = document.getElementById('spu-qt'),
                            sntChkbx = document.getElementById('spu-sentence'),
                            wholeWord = document.getElementById('spu-whole'),
                            flgsFrm = document.getElementById('spu-flags'),
                            txtFrm = document.getElementById('spu-txtarea'),
                            nmsFrm = document.getElementById('spu-names'),
                            nmsBtn = document.getElementById('spu-names-list'),
                            srchBtn = document.getElementById('spu-srch-strt'),
                            fromOld= document.getElementById('spu-fromold'),
                            fromNew= document.getElementById('spu-fromnew'),
                            nmsMenu = document.getElementById('spu-nms-menu'),
                            hdToResult = document.getElementById('spu-head'),
                            imgs = document.getElementById('spu-imgs');
                      name && (nmsFrm.value = name); txt && (txtFrm.value = txt); txtFrm.focus();
                      for (const nm of this.options.namesToSearch) {
                          if (nm) {
                              const menuitem = nmsMenu.appendChild(document.createElement('li'));
                              menuitem.textContent = nm;
                              menuitem.onclick = () => nmsFrm.value += (nmsFrm.value ? ',' + nm : nm);
                          }
                      };
                      csChkbx.checked = true;
                      hdToResult.checked = this.options.headToResult;
                      hdToResult.onclick = () => { this.options.headToResult = hdToResult.checked };
                      imgs.checked = this.options.imgsToLinks;
                      imgs.onclick = () => { this.options.imgsToLinks = imgs.checked };
                      highlight.checked = this.options.highlightMatches;
                      highlight.onclick = () => { this.options.highlightMatches = highlight.checked };
                      sig.checked = this.options.srchInSigs;
                      sig.onclick = () => { this.options.srchInSigs = sig.checked };
                      qt.checked = this.options.srchInQuotes;
                      qt.onclick = () => { this.options.srchInQuotes = qt.checked };
                      txt && txt.startsWith('"') && txt.endsWith('"') && (sntChkbx.checked = true);
                      for (const el of [...mdlOverlay.getElementsByClassName('clear-form')])
                          el && (el.onclick = () => el.nextElementSibling.value = '');
                      clsBtn.onclick = () => {
                          mdlOverlay.remove(); body.onwheel = null; this.names.length = 0; res(null);
                      };
                      mdlOverlay.onclick = mdlOverlay.oncontextmenu = mdlOverlay.onwheel = e => {
                          if (e.target != mdlOverlay) return;
                          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                      };
                      body.onwheel = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
                      nmsBtn.onclick = () => { nmsMenu.hidden = !nmsMenu.hidden };
                      sntChkbx.onclick = () => {
                          let quoted, val = txtFrm.value.trim(), indx = val.indexOf('NOT'), excl = indx != -1 ? ' ' + val.substring(indx) : '';
                          excl && (val = val.substring(0, indx).trimRight());
                          quoted = val && val.startsWith('"') && val.endsWith('"');
                          sntChkbx.checked
                              ? !quoted && (val = '"' + val + '"')
                              : quoted && (val = val.slice(val.indexOf('"') + 1, val.lastIndexOf('"')));
                          txtFrm.value = val + excl;
                      };
                      this.options.reversPostSorting ? (fromNew.checked = true) : (fromOld.checked = true);
                      fromNew.onclick = fromOld.onclick = () => { this.options.reversPostSorting = fromNew.checked; };
                      regChkbx.onclick = e => {
                          flgsFrm.disabled = flgsFrm.hidden = !regChkbx.checked;
                          sntChkbx.disabled = csChkbx.disabled = wholeWord.disabled = regChkbx.checked;
                          !regChkbx.checked && (flgsFrm.value = '');
                      };
                      srchBtn.onclick = () => {
                          const val = {n: nmsFrm.value, t: regChkbx.checked ? txtFrm.value : txtFrm.value.trim(), rgxp: regChkbx.checked, flags: flgsFrm.value, cs: csChkbx.checked, ww: wholeWord.checked};
                          body.onwheel = null; mdlOverlay.remove();
                          res(val);
                      };
                  })
              }
              // Вычисление ID форума и темы
              , getForumAndTopic() {
                  const matchF = this.win.location.href.match(/forum=(\d+)/),
                        matchT = this.win.location.href.match(/topic=(\d+)/);
                  return {
                      forum: matchF ? matchF[1] : null,
                      topic: matchT ? matchT[1] : null
                  };
              }
              // Формирование списка страниц по 500 постов
              , get500Pages() {
                  const { forum, topic } = this.getForumAndTopic();
                  this.forum = forum;
                  this.topic = topic;

                  this.hasPinnedHead = !!document.querySelector('img[src*="pin.gif"], img[src*="sticky.gif"], img[src*="pinned"]');

                  if (!forum || !topic) return [[this.loc, 1, 0]];

                  const paginator = [...document.getElementsByTagName("p")].find(
                      el => el.textContent && el.textContent.trim().startsWith("Страницы:")
                  );

                  let maxStart = 0;
                  let isAlreadyAll = window.location.href.includes("&all");

                  if (paginator) {
                      const links = paginator.getElementsByTagName("a");
                      for (const a of links) {
                          if (a.href.includes("&all")) isAlreadyAll = true;
                          const match = a.href.match(/start=(\d+)/);
                          if (match) {
                              const st = parseInt(match[1], 10);
                              if (st > maxStart) maxStart = st;
                          }
                      }
                      const bolds = paginator.querySelectorAll("b, font");
                      for (const b of bolds) {
                          const num = parseInt(b.textContent.trim(), 10);
                          if (!isNaN(num) && num > 1) {
                              const st = isAlreadyAll ? (num - 1) * 500 : (num - 1) * 20;
                              if (st > maxStart) maxStart = st;
                          }
                      }
                  }

                  const pages = [];
                  let pageNum = 1;
                  for (let s = 0; s <= maxStart; s += 500) {
                      const pageUrl = `https://forum.ru-board.com/topic.cgi?forum=${forum}&topic=${topic}&start=${s}&all`;
                      pages.push([pageUrl, pageNum++, s]);
                  }

                  return pages.length ? pages : [[`https://forum.ru-board.com/topic.cgi?forum=${forum}&topic=${topic}&start=0&all`, 1, 0]];
              }
              // Загрузка страницы 500 постов
              , getPosts([url, pageNum, pageStart], name, txt, stmp) {
                  return new Promise((res, rej) => {
                      if (this.dtStmp === null) return res(null);
                      if (this.dtStmp !== stmp) return rej({ aborted: true });

                      const rmv = itm => {
                          const idx = this.xhrPool.indexOf(itm);
                          if (idx !== -1) this.xhrPool.splice(idx, 1);
                      };

                      const isCurrentAll = this.win.location.href.includes("&all") &&
                            (this.win.location.href.includes(`start=${pageStart}`) || (pageStart === 0 && !this.win.location.href.includes("start=")));

                      if (isCurrentAll) {
                          const postsRaw = document.getElementsByClassName('tb');
                          if (postsRaw && postsRaw.length) {
                              const posts = this.processPagePosts([...postsRaw].map(el => el && el.cloneNode(true)), name, txt, pageNum, pageStart);
                              return res(posts);
                          }
                          return res([]);
                      }

                      const xhr = new XMLHttpRequest();
                      xhr.open("GET", url, true);
                      xhr.responseType = "document";
                      xhr.timeout = 35000;

                      xhr.onload = () => {
                          rmv(xhr);
                          if (this.dtStmp !== null && this.dtStmp !== stmp) return rej({ aborted: true });
                          if (xhr.status === 200) {
                              const postsRaw = xhr.responseXML && xhr.responseXML.getElementsByClassName('tb');
                              if (postsRaw && postsRaw.length) {
                                  const posts = this.processPagePosts([...postsRaw], name, txt, pageNum, pageStart);
                                  res(posts);
                              } else {
                                  res([]);
                              }
                          } else {
                              rej({ status: xhr.status, url: url });
                          }
                      };

                      xhr.onerror = () => { rmv(xhr); rej({ status: 0, url: url }); };
                      xhr.ontimeout = () => { rmv(xhr); rej({ status: 408, url: url }); };
                      xhr.onabort = () => { rmv(xhr); rej({ aborted: true }); };

                      this.xhrPool.push(xhr);
                      xhr.send();
                  });
              }
              // Нумерация и фильтрация
              , processPagePosts(postsRaw, name, txt, pageNum, pageStart) {
                  if (pageStart === 0 && postsRaw.length > 0) {
                      const firstDats = postsRaw[0].querySelector("td.dats");
                      if (firstDats) this.firstPostSignature = firstDats.textContent.trim();
                  }

                  let hasHeaderOnThisPage = false;
                  if (pageStart > 0 && postsRaw.length > 0) {
                      const p0 = postsRaw[0];
                      const isHdr = !!p0.querySelector('a.tpc[href*="postno=1"], a[href*="postno=1"]')
                          || (this.firstPostSignature && p0.querySelector("td.dats")?.textContent.trim() === this.firstPostSignature);
                      if (isHdr) {
                          hasHeaderOnThisPage = true;
                          this.hasPinnedHead = true;
                      }
                  }

                  let replyIndex = 0;
                  const numberedPosts = [];

                  for (let i = 0; i < postsRaw.length; i++) {
                      const post = postsRaw[i];
                      let seq;
                      let isHead = false;

                      if (pageStart === 0) {
                          seq = i + 1;
                          if (i === 0) isHead = true;
                      } else {
                          if (i === 0 && hasHeaderOnThisPage) {
                              seq = 1;
                              isHead = true;
                          } else {
                              seq = pageStart + replyIndex + 1;
                              replyIndex++;
                          }
                      }

                      if (isHead && pageStart > 0) continue;
                      if (seq === 1 && !this.options.headToResult) continue;

                      post.__postSeqNum = seq;
                      numberedPosts.push(post);
                  }

                  return this.filterPosts(numberedPosts, name, txt);
              }
              // Пересчет ссылок на стандартные 20 постов
              , updatePostLinks(post, seq) {
                  const stdStart = Math.floor((seq - 1) / 20) * 20;
                  let stdAnchor = ((seq - 1) % 20) + 1;

                  if (this.hasPinnedHead && stdStart > 0) {
                      stdAnchor += 1;
                  }

                  const stdUrl = `https://forum.ru-board.com/topic.cgi?forum=${this.forum}&topic=${this.topic}&start=${stdStart}#${stdAnchor}`;
                  const pageNumber = (stdStart / 20) + 1;

                  // 1. Обычные ссылки на пост ("Отправлено:", заголовок и т.п.)
                  const links = post.querySelectorAll('a[href*="topic.cgi"]');
                  for (const a of links) {
                      const href = a.getAttribute('href') || '';
                      if (href.includes('#') || a.classList.contains('tpc') || a.closest('.dats')) {
                          if (href.includes(`topic=${this.topic}`) || !href.includes('topic=')) {
                              a.href = stdUrl;
                              a.title = `Перейти к сообщению: Стр. ${pageNumber}, Пост #${stdAnchor}`;
                          }
                      }
                  }

                  // 2. Ссылки на дату/часы для копирования: javascript:void(link('#...'))
                  const allPostLinks = post.getElementsByTagName('a');
                  for (const a of allPostLinks) {
                      const href = a.getAttribute('href') || '';
                      if (href.includes('link(') || href.includes('link%28')) {
                          a.href = `javascript:void(link('#${stdAnchor}'))`;
                          a.title = `Скопировать ссылку: Стр. ${pageNumber}, Пост #${stdAnchor}`;
                          a.onclick = e => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.prompt('Ссылка на это сообщение:', stdUrl);
                          };
                      }
                  }

                  // 3. Внутренний якорь поста
                  const anchors = post.querySelectorAll('a[name]');
                  for (const a of anchors) {
                      a.name = String(stdAnchor);
                  }
              }
              , async fetchAllPages(pageLinks, nmsToSearch, txtQuery, stmp, onProgress, onStatus) {
                  const total = pageLinks.length;
                  const results = new Array(total);
                  let completed = 0;
                  let cursor = 0;

                  const worker = async () => {
                      while (cursor < total) {
                          if (this.dtStmp === null || this.dtStmp !== stmp) return;
                          const idx = cursor++;
                          const link = pageLinks[idx];
                          const pageNum = link[1];

                          let posts = null;
                          let retries = this.options.maxRetries;

                          while (retries >= 0) {
                              if (this.dtStmp === null || this.dtStmp !== stmp) return;
                              try {
                                  posts = await this.getPosts(link, nmsToSearch, txtQuery, stmp);
                                  break;
                              } catch (err) {
                                  if (err && err.aborted) return;
                                  if (retries > 0) {
                                      retries--;
                                      const isRateLimit = err && (err.status === 429 || err.status === 503);
                                      const waitTime = isRateLimit ? this.options.retryDelay : 1000;
                                      onStatus && onStatus(`Блок ${pageNum}: ${isRateLimit ? 'Лимит 429' : 'Сбой'}. Ожидание...`);
                                      await this.delay(waitTime, stmp);
                                  } else {
                                      posts = null;
                                      break;
                                  }
                              }
                          }

                          if (this.dtStmp !== null && this.dtStmp !== stmp) return;

                          results[idx] = posts;
                          completed++;
                          if (onProgress) onProgress(posts, completed, total);

                          if (this.dtStmp === null) return;

                          if (this.options.requestDelay > 0) {
                              await this.delay(this.options.requestDelay, stmp);
                          }
                      }
                  };

                  const workers = [];
                  const conc = Math.min(this.options.concurrency, total);
                  for (let i = 0; i < conc; i++) {
                      workers.push(worker());
                  }

                  await Promise.all(workers);

                  if (this.dtStmp !== null && this.dtStmp !== stmp) return null;
                  return results;
              }
              , procesPosts(posts, stmp) {
                  return new Promise((res, rej) => {
                      if (this.dtStmp !== null && this.dtStmp !== stmp) {
                          posts && (posts.length = 0);
                          return rej([null, stmp]);
                      }
                      posts = this.flatPosts(posts).filter(Boolean);
                      if (posts && !!posts.length) {
                          for (const post of posts) {
                              if (post.__postSeqNum) {
                                  this.updatePostLinks(post, post.__postSeqNum);
                              }
                          }
                          if (this.options.imgsToLinks) posts = this.imgsToLinks(posts);
                          for (let post = 0; posts.length; post++)
                              this.spBd.appendChild(this.options.reversPostSorting ? posts.pop() : posts.shift());
                          this.spBd.appendChild(this.navBox);
                          res([null, stmp]);
                      } else {
                          rej(['not found', stmp]);
                      }
                  });
              }
              , filterPosts(posts, name, txt) {
                  return posts.filter(post => {
                      const datsElem = post.querySelector("td.dats b");
                      if (!datsElem) return false;
                      const postUser = datsElem.textContent.toLowerCase().replace(/\s/g, '_');
                      const isUser = name && name.includes(postUser);

                      const isText = () => {
                          const pstEl = post.getElementsByClassName('post')[0];
                          if (!pstEl) return false;

                          const highligthMatches = () => {
                              if (this.options.highlightMatches) {
                                  const rgxp = str => {
                                      let source = str.source,
                                          flags = str.toString().match(/[gimuy]*$/)[0];
                                      source = source.replace(/\s+|\\s\+?/g, '(?:[<>&;\\w\\s]+)');
                                      flags = flags.includes('g') ? flags : flags + 'g';
                                      return new RegExp(source, flags);
                                  };
                                  if (Array.isArray(txt.val))
                                      for (const sntnc of txt.val)
                                          pstEl.innerHTML = pstEl.innerHTML.replace(rgxp(sntnc), '<spu-layer>$&</spu-layer>');
                                  else
                                      pstEl.innerHTML = pstEl.innerHTML.replace(rgxp(txt.val), '<spu-layer>$&</spu-layer>');
                              }
                              return true;
                          };

                          let pstTxt;
                          if (!this.options.srchInSigs || !this.options.srchInQuotes) {
                              const cpEl = pstEl.cloneNode(true);
                              if (!this.options.srchInSigs) {
                                  const lstChld = cpEl.lastElementChild;
                                  lstChld && lstChld.className == 'sing' && lstChld.remove();
                              }
                              if (!this.options.srchInQuotes) {
                                  const qtHdr = [...cpEl.getElementsByTagName('small')].filter(el => el.textContent == 'Цитата:'),
                                        qtBd = qtHdr.map(el => el.nextElementSibling).filter(el => el && el.localName == 'table');
                                  for (const qts of [...qtHdr, ...qtBd]) qts && qts.remove();
                              }
                              pstTxt = cpEl.textContent;
                          } else {
                              pstTxt = pstEl.textContent;
                          }

                          if (!(pstTxt && !!pstTxt.length)) return false;
                          if (txt.exclude) {
                              const isCntsExcludes = Array.isArray(txt.exclude)
                                  ? txt.exclude.some(el => Array.isArray(el) ? el.every(snt => snt.test(pstTxt)) : el.test(pstTxt))
                                  : txt.exclude.test(pstTxt);
                              if (isCntsExcludes) return false;
                              if (!txt.val) return true;
                          }

                          switch (txt.type) {
                              case 'all': return txt.val.every(sntnc => sntnc.test(pstTxt)) && highligthMatches();
                              case 'rgxp':
                              case 'snt': return txt.val.test(pstTxt) && highligthMatches();
                              case 'some':
                              case 'any': return (Array.isArray(txt.val) ? txt.val.some(snt => snt.test(pstTxt)) : txt.val.test(pstTxt)) && highligthMatches();
                          }
                      };

                      if (name && isUser) return txt ? isText() : true;
                      if (!name) return isText();
                      return false;
                  });
              }
              , flatPosts(posts) { return posts.reduce((a, b) => a.concat(b), []) }
              , imgsToLinks(posts) {
                  return posts.map(post => {
                      const postEl = post.getElementsByClassName('post')[0],
                            imgs = [...postEl.getElementsByTagName('img')].filter(el => el && el.src && !el.src.includes('://forum.ru-board.com/board/s/'));
                      for (const img of imgs) {
                          const imgLink = img.closest('a[href]'),
                                link = document.createElement('a');
                          link.href = img.src; link.target = '_blank'; link.textContent = '[IMG][/IMG]';
                          img.parentNode.replaceChild(link, img);
                          if (imgLink) {
                              imgLink.parentNode.insertBefore(link, imgLink);
                              imgLink.textContent = '[URL][/URL]';
                          }
                      }
                      return post;
                  });
              }
              , getName() {
                  const name = [...new Set(this.flatPosts(this.names))].join(',').replace(/(?:\s+)?,(?:\s+)?/g, ',').replace(/\s/g, "_").toLowerCase().split(',').filter(Boolean);
                  if (name && !!name.length) return name;
              }
              , setName(str) { if (str) return this.names.push(str); }
              , getSearchQuery(str, cs, ww) {
                  const query = {type: null, val: null, exclude: null, cs: cs, ww: ww};
                  if (Array.isArray(str)) {
                      query.type = 'rgxp';
                      try { query.val = new RegExp(str[0], str[1]); } catch(err) { listener.names.length = 0; return this.win.alert(err); }
                      return query;
                  }
                  const indx = str.indexOf('NOT');
                  if (indx != -1) {
                      const arr = str.slice(indx).split(/(?:\s+)?NOT(?:\s+)?/).filter(Boolean);
                      str = str.slice(0, indx).trimRight();
                      let any = [], every = [];
                      for (const el of arr) {
                          if (el.includes('AND'))
                              every.push(el.split(/(?:\s+)?AND(?:\s+)?/).filter(Boolean).map(el => this.prepareSntc(el, cs, ww)));
                          else
                              any.push(el);
                      }
                      any = any && !!any.length ? (any.length > 1 ? this.prepareSntc(any, cs, ww) : this.prepareSntc(any[0], cs, ww)) : null;
                      query.exclude = every && !!every.length ? [any, ...every].filter(Boolean) : any;
                  }
                  if (str.includes('OR')) {
                      query.type = 'some'; query.val = this.prepareSntc(str.split(/(?:\s+)?OR(?:\s+)?/).filter(Boolean), cs, ww);
                      return query;
                  }
                  if (str.includes('AND')) {
                      query.type = 'all'; query.val = str.split(/(?:\s+)?AND(?:\s+)?/).filter(Boolean).map(el => this.prepareSntc(el, cs, ww));
                      return query;
                  }
                  if (str.startsWith('"') && str.endsWith('"')) {
                      query.type = 'snt'; query.val = this.prepareSntc(str.slice(str.indexOf('"') + 1, str.lastIndexOf('"')), cs, ww);
                      return query;
                  } else {
                      str = str.split(/\s+/).filter(Boolean);
                      query.type = 'any'; str && !!str.length && (query.val = this.prepareSntc(str.length > 1 ? str : str[0], cs, ww));
                      return query;
                  }
              }
              , getSpHd() {
                  let spoilerHead = document.getElementById("spu-spoiler-head");
                  if (!spoilerHead) {
                      const dummyNode = this.actnBox.parentNode.insertBefore(document.createElement('div'), this.actnBox.nextElementSibling);
                      dummyNode.outerHTML = '<table id="spu-spoiler-head" width="95%" cellspacing="1" cellpadding="3" bgcolor="#999999" align="center" border="0"><tbody><tr><td valign="middle" bgcolor="#dddddd" align="left"></td></tr><td class="small" bgcolor="#dddddd" align="center">Найдено: <span id="spu-fndd"></span>   Ошибок: <span id="spu-errs"></span></td></tbody></table>';
                      spoilerHead = this.actnBox.nextElementSibling;
                      spoilerHead.id = "spu-spoiler-head";
                      spoilerHead.hidden = true;
                      const spTitle = spoilerHead.getElementsByTagName('td')[0];
                      spoilerHead.onclick = e => {
                          e.preventDefault(); e.stopPropagation();
                          const spoilerBody = this.spBd;
                          if (e.button != 0 || !spoilerBody) return;
                          if (spoilerHead.hasAttribute("notready")) {
                              if (this.dtStmp !== null) {
                                  this.dtStmp = null;
                                  this.abortXhrs();
                                  spTitle.textContent = "\u23F9 Останавливаем...";
                              }
                          } else {
                              spTitle.textContent = spoilerBody.hidden ? this.ttlHide : this.ttlShow;
                              spoilerBody.hidden = !spoilerBody.hidden;
                          }
                      };
                  }
                  return spoilerHead;
              }
              , getSpBd() {
                  let spoilerBody = document.getElementById("spu-spoiler-body");
                  if (!spoilerBody) {
                      const spoilerHead = this.spHd;
                      spoilerBody = spoilerHead.parentNode.insertBefore(document.createElement("table"), spoilerHead.nextElementSibling);
                      spoilerBody.id = "spu-spoiler-body";
                      spoilerBody.align = "center";
                      spoilerBody.width = "95%";
                      spoilerBody.hidden = true;
                  }
                  return spoilerBody;
              }
              , getNavBox() {
                  let navBox = document.getElementById("spu-nav");
                  if (!navBox) {
                      navBox = document.createElement('div');
                      const spoilerHead = this.spHd,
                            spoilerBody = this.spBd,
                            nodes = spoilerBody.children,
                            navBlock = navBox.appendChild(document.createElement('ul')),
                            navHome = navBlock.appendChild(document.createElement('li')),
                            navUp = navBlock.appendChild(document.createElement('li')),
                            navDown = navBlock.appendChild(document.createElement('li')),
                            navEnd = navBlock.appendChild(document.createElement('li')),
                            crntPst = () => {
                                const posts = [...nodes].slice(0, -1),
                                      possY = posts.map(el => el.getClientRects()[0].y);
                                return posts[possY.indexOf(this.getCrntPost(possY))];
                            },
                            scrollToPrev = () => {
                                const crnt = crntPst(), prvPost = crnt && crnt.previousElementSibling;
                                prvPost && prvPost.scrollIntoView({behavior:"smooth"});
                            },
                            scrollToNext = () => {
                                const crnt = crntPst(), nxtPst = crnt && crnt.nextElementSibling;
                                nxtPst && nxtPst != navBox && nxtPst.scrollIntoView({behavior:"smooth"});
                            };
                      navBox.id = 'spu-nav'; navUp.id = 'spu-nav-up'; navDown.id = 'spu-nav-down'; navEnd.id = 'spu-nav-end'; navHome.id = 'spu-nav-home';
                      navUp.className = navDown.className = navEnd.className = navHome.className = 'spu-nav-btn';
                      navUp.title = 'Предыдущее'; navDown.title = 'Следующее'; navEnd.title = 'В конец'; navHome.title = 'К началу';
                      navBox.onclick = e => {
                          if (!e.target.id) return;
                          switch (e.target.id) {
                              case 'spu-nav-home': spoilerHead.scrollIntoView({behavior:"smooth"}); break;
                              case 'spu-nav-end': spoilerBody.lastElementChild.previousElementSibling.scrollIntoView({behavior:"smooth"}); break;
                              case 'spu-nav-up': scrollToPrev(); break;
                              case 'spu-nav-down': scrollToNext(); break;
                              default: return;
                          }
                      };
                  }
                  return navBox;
              }
              , endNotify(fndd, errs) {
                  if (fndd) {
                      const spoilerHead = this.spHd,
                            spoilerBody = this.spBd,
                            confirm = this.win.confirm("Поиск окончен!\nНайдено: " + fndd + (errs ? "\nОшибок: " + errs : "") + "\nПерейти к результатам?");
                      if (confirm) {
                          spoilerHead.scrollIntoView({behavior:"smooth"});
                          if (this.options.autoOpenSpoilerWithResult) {
                              this.spTTl.textContent = this.ttlHide;
                              spoilerBody.hidden = false;
                          }
                      }
                  } else {
                      this.win.alert("Сообщений не найдено!" + (errs ? "\nОшибок: " + errs : ""));
                  }
              }
              , handleEvent(e, name, prmpt) {
                  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                  this.dtStmp = new Date().getTime();
                  this.abortXhrs();
                  let cs, ww, txt, sel = listener.getSel();

                  this.spawn(function*() {
                      if (sel && !prmpt && !e.ctrlKey) {
                          const confirm = listener.win.prompt('На странице отмечен текст.\nЗапустить поиск по имени пользователя по отмеченному (нажать "Да"),\nили по тексту, с открытием диалога для редактирования (нажать "Отмена")?', sel);
                          confirm ? (name = confirm) : (prmpt = true);
                      }
                      if (name && !prmpt) {
                          listener.name = name;
                          if (e.ctrlKey) return;
                      }
                      if (prmpt) {
                          listener.name = (e.button == 2 && listener.options.nameToFillSrchForm)
                              ? listener.options.nameToFillSrchForm
                              : name;
                          sel && (txt = sel);
                          const rVal = yield listener.prompt(listener.options.fillSearchFormWithNames && listener.name, txt);
                          listener.names.length = 0;
                          if (!rVal) return;
                          cs = rVal.cs; ww = rVal.ww;
                          listener.name = rVal.n;
                          listener.text = rVal.rgxp ? [rVal.t, rVal.flags] : rVal.t;
                      }
                      const nmsToSearch = listener.name,
                            txtToSearch = listener.text,
                            isNames = nmsToSearch && !!nmsToSearch.length,
                            isTexxt = txtToSearch && !!txtToSearch.length,
                            txtQuery = isTexxt && listener.getSearchQuery(txtToSearch, cs, ww);
                      if (!isNames && !isTexxt || isTexxt && !txtQuery) return;

                      const pageLinks = listener.get500Pages(),
                            spoilerHead = listener.spHd,
                            spoilerBody = listener.spBd,
                            spoilerTitle = listener.spTTl,
                            errsLbl = document.getElementById("spu-errs"),
                            findedLbl = document.getElementById("spu-fndd");

                      spoilerHead.hidden = false;
                      spoilerTitle.textContent = listener.ttlLdng;
                      spoilerHead.setAttribute("notready", "true");
                      spoilerBody.hidden = true;
                      listener.options.scrollToSearchResults && !listener.options.showAlerts && spoilerHead.scrollIntoView({behavior:"smooth"});

                      let errorsCntr = 0, fnddCntr = 0;
                      errsLbl.textContent = findedLbl.textContent = 0;
                      if (spoilerBody.children && !!spoilerBody.children.length)
                          for (const node of [...spoilerBody.children]) node.remove();

                      const currentStmp = listener.dtStmp;
                      listener.fetchAllPages(
                          pageLinks,
                          isNames && nmsToSearch,
                          isTexxt && txtQuery,
                          currentStmp,
                          (posts, completed, total) => {
                              if (posts && !!posts.length) {
                                  fnddCntr += posts.length;
                                  findedLbl.textContent = fnddCntr;
                              } else if (posts === null) {
                                  errorsCntr += 1;
                                  errsLbl.textContent = errorsCntr;
                              }
                              if (listener.dtStmp !== null) {
                                  spoilerTitle.textContent = `\u23F3 Поиск: проверено ${completed} из ${total} блоков по 500 постов (Найдено: ${fnddCntr})...`;
                              }
                          },
                          statusText => {
                              if (listener.dtStmp !== null) {
                                  spoilerTitle.textContent = `\u23F3 ${statusText}`;
                              }
                          }
                      ).then(posts => {
                          const stmp = listener.dtStmp;
                          if (posts === null || (listener.dtStmp !== null && listener.dtStmp !== stmp)) {
                              return [null, stmp];
                          }
                          return listener.procesPosts(posts, stmp);
                      })
                      .then(([founded, stmp]) => {
                          if (listener.dtStmp !== null && listener.dtStmp !== stmp) return;
                          spoilerHead.removeAttribute("notready");

                          if (listener.dtStmp === null) {
                              const actualCount = spoilerBody.querySelectorAll('.tb').length;
                              if (actualCount > 0) {
                                  spoilerBody.hidden = false;
                                  spoilerTitle.textContent = `\u23F9 Остановлено. Найдено: ${fnddCntr || actualCount}. ` + listener.ttlHide;
                              } else {
                                  spoilerTitle.textContent = '\u23F9 Остановлено. Ничего не найдено.';
                              }
                              return;
                          }

                          spoilerTitle.textContent = listener.ttlShow;
                          if (listener.options.showAlerts) {
                              listener.endNotify(fnddCntr, errorsCntr);
                          } else if (listener.options.autoOpenSpoilerWithResult) {
                              spoilerBody.hidden = false;
                              spoilerTitle.textContent = listener.ttlHide;
                          }
                      })
                      .catch(err => {
                          const wasStopped = (listener.dtStmp === null);
                          spoilerHead.removeAttribute("notready");

                          if (Array.isArray(err)) {
                              if (listener.dtStmp !== null && listener.dtStmp !== err[1]) return;
                              if (wasStopped) {
                                  const actualCount = spoilerBody.querySelectorAll('.tb').length;
                                  if (actualCount > 0) {
                                      spoilerBody.hidden = false;
                                      spoilerTitle.textContent = `\u23F9 Остановлено. Найдено: ${fnddCntr || actualCount}. ` + listener.ttlHide;
                                  } else {
                                      spoilerTitle.textContent = '\u23F9 Остановлено. Ничего не найдено.';
                                  }
                              } else if (err[0] === 'not found') {
                                  spoilerTitle.textContent = listener.ttlNotFnd;
                              }
                          } else {
                              errorsCntr += 1;
                              errsLbl.textContent = errorsCntr;
                          }

                          if (fnddCntr) {
                              const msg = wasStopped ? `\u23F9 Остановлено. Найдено: ${fnddCntr}. ` : '';
                              spoilerTitle.textContent = msg + listener.ttlShow;
                              if ((listener.options.autoOpenSpoilerWithResult || wasStopped) && !listener.options.showAlerts) {
                                  spoilerBody.hidden = false;
                                  spoilerTitle.textContent = msg + listener.ttlHide;
                              }
                          }

                          if (!wasStopped && listener.options.showAlerts) listener.endNotify(fnddCntr, errorsCntr);
                      });

                      listener.names.length = 0;
                  });
              }
          },
          prmptTxt = 'На странице был выделен текст.\nЗапустить поиск с именем пользователя из выделенного текста (нажать "Да"),\nили по тексту, с открытием диалога для редактирования (нажать "Отмена")?',
          hlpNms = 'Чтобы искать посты для всех пользователей, по тексту, - оставьте поле имени пустым.\nИмена в форму поиска вводить без учета регистра, разделяя запятой (без пробела).\nИмена с пробелами - ищутся и с пробелом и с _.',
          hlpTxt =
          [
              'Чтобы искать только посты по именам пользователей - оставьте поле текста пустым и наоборот. При поиске без регулярок все пробелы, переносы, табуляции - заменяются на единичный пробел, как в задании для поиска, так и в тексте постов. Слово &quot;поле&quot; - найдется и в &quot;Наполеон&quot; если не включен чекбокс &quot;Точное соответствие&quot;.',
              'Поиск без регулярок:',
              '\tраз два три - искать любую из разделенных пробелами частей',
              '\tраз два OR три OR пять - искать любую из фраз: &quot;раз два&quot;, &quot;три&quot;, &quot;пять&quot;',
              '\tраз два AND три AND пять - искать все фразы',
              '\t&quot;раз два три&quot; - (в двойных кавычках) искать фразу целиком',
              '\tОператор исключения NOT:',
              '\t\tИмеет приоритет над остальными. Ставить после текста (с любыми операторами, без них, фразой) для поиска',
              '\t\tОпции &quot;Точное соответствие&quot;, &quot;Без учета регистра&quot; - влияют и на слова исключения',
              '\t\tраз два OR три OR пять NOT шесть NOT семь восемь - найдет посты удовлетворяющие условиям поиска, за исключением тех, в которых есть &quot;шесть&quot; или &quot;семь восемь&quot;',
              '\t\tNOT шесть NOT семь - найдет любые посты без этих слов',
              '\t\tраз OR три NOT шесть NOT семь AND восемь - найдет посты удовлетворяющие условиям поиска, за исключением тех, в которых есть &quot;шесть&quot;, либо &quot;семь&quot; И(!) &quot;восемь&quot;',
              'Комбинировать операторы пока нельзя. За искличением NOT (см. выше).',
              'Регулярные выражения вводить включив чекбокс. Без начального и закрывающего слеша. Для ввода флагов - отдельное поле, Регулярки не проверяются на валидность.',
          ].join('\n').replace(/"/g, '&quot;'),
          highlightHlp = 'Включает подсветку совпадений в тексте найденных постов.\nВлияет на производительность и может поломать верстку (если, например, часть найденной фразы находится внутри одного элемента, а часть - за его пределами).\nПодсветит результат и в цитатах / подписях, даже при их исключении из поиска (только подсветит, на результаты не влияет).\nЦвет подсветки задается в опциях, в коде скрипта.',
          wholeHlp = 'Искать слово(-а) или фразу(-ы) только если предыдущий и последующий символы не являются буквенно-цифровыми',
          nmBtnHlp = 'Открыть меню для добавления имен из списка сохраненных.\nИмена задаются в опциях скрипта, в коде\n(при обновлении скрипта пользовательские изменения сбрасываются, делайте копию списка)',
          clsImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAIGNIUk0AAHolAACAgwAA+f8AAIDoAABSCAABFVgAADqXAAAXb9daH5AAAAEhSURBVHja1FMxS8NgEH1XxCUuri24VKmLY6qDPyDoIF0k0Dmj4GBoQZBWBLEVOnaI0LEiXTIo/gAHO7sIOjm4SsEu4nfPJQGNIRk6iA/ecI/jeHePE5KYBQXMiL8fMJcUVja2VwG4ALrP45spACyvb1kAfACXT/fXj5kOSHVJBal+uepY5apjkepHmpu7wklj74JGEdGPCBrF6eF+kOyXlBjlKrwtNo7PvYKIAoCShbOjg2B3x3kFwEwHIsJefzBR84nv7PUHExFhroOltc34YGnovjzcTTMdqDG+GgM1Bp12M+i0m0FcqzG/B5P8wVrds4sVuzUchSWSQlKGo7BUrNitWt2zk/1pR5wHsADgLd6ZpABYBPAO4CMvhX/2C18DAHuyrpoNc5ujAAAAAElFTkSuQmCC',
          questionMark = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAn1BMVEUAAAAAbfMAbfEAbe8AbfAAbfAAbfEAbu8AcO8AAP8Abu8AbfAAbfAAbfEAgP8AbPAAbfAAbPIAa/IAbvAAbfAAbPEAbe0AcO8AbPAAbfAAceMAbfAAbfAAbfAAbPAAbfAAbfAAZv8AafAAbfEAavQAVf8AbPEAcfEAbf8AbfAAbfAAbe8Abe8AbfAAbfAAbfAAa/IAbfAAbfAAbfAAAADuFkhRAAAAM3RSTlMAKn606eKxgCABcvj0bgK19ztMl+1cDhA0+gnw4fnI09sFEcMYA6ASB77xcJOvzc4T8kSdjffTAAAAAWJLR0QAiAUdSAAAAAlwSFlzAAAN1wAADdcBQiibeAAAAAd0SU1FB+IIDBMlMtO6eB4AAAChSURBVBjTTY/pDoMgEIQHAVHE2lNr7/uyt+//bl3Ypun8YL5dks0MQBKRVDo2CVipzdogl3f83Cnan4qUFjlB1/T6gyGBBRJHPkJZYUyQCRiyelJOXYUZYYSY3vli2a7Wm5pQQvO57W5/8K6geHE8nYNryOCX5sofMSKG253dQISYDzw5LMW3Hl7vJixyX+U/OpfJHY+ZTb99ExNrJSPh+QOxnx6dvxBTegAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAxOC0wOC0xMlQxOTozNzo1MCswMjowMEnQ2mMAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMTgtMDgtMTJUMTk6Mzc6NTArMDI6MDA4jWLfAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAABJRU5ErkJggg==',
          upArrow = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAMAAADXqc3KAAAAA3NCSVQICAjb4U/gAAAACXBIWXMAAAYnAAAGJwFNVNjHAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAGZQTFRFAJjmAJbmAJbnAJbmAJbmApfmCprnDZvnDpznE57oFp/oHqLpPa/sZsDwic/0ldP1tuH40Oz60+372/D74vP86fb96vb96/f97Pf97fj97/j97/n98fn98fn+9fv+9/z+/P7/////B9XeKgAAAAR0Uk5TNM/x8gg9m90AAACFSURBVCjPpdJJDoMwEETRts08JxDbmASo+1+SBSRiaEtI+du36y4iIdUlKYhEwCZI8iBJ8aBuQRzzEHVdxEI1jhUH+QC4nIFmBubmCoUDAFecIWwBAGjDE5SfFd7lERKLLZMcoJ6+MNV7yBx+9dkO0sdLa22MtbZ/pveP+C94X+sdg28+CxzeEOjnGCz7AAAAAElFTkSuQmCC',
          downArrow = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAMAAADXqc3KAAAAA3NCSVQICAjb4U/gAAAACXBIWXMAAAYnAAAGJwFNVNjHAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAGZQTFRFAJjmAJbmAJbnAJbmAJbmApfmCprnDZvnDpznE57oFp/oHqLpPa/sZsDwic/0ldP1tuH40Oz60+372/D74vP86fb96vb96/f97Pf97fj97/j97/n98fn98fn+9fv+9/z+/P7/////B9XeKgAAAAR0Uk5TNM/x8gg9m90AAACISURBVCjPrZLHEoAgDEQD2HsFrMj//6SODo4lnHSPeRM2WQJAKHuJEgDioCJAcUCB4YD9DsKqk1IKwTlvy/ACok6f6qPrU7kydZXfPAJhgAzu5ul41Kf0MZVbH6B2n+Mm/e6cvPcoFq2XAlkw3lqGGNs8m+cMjcRrGg/Pyve/pWv9Wusx2M5nBYeDEOi0fx6VAAAAAElFTkSuQmCC',
          homeArrow = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAYnAAAGJwFNVNjHAAAAIGNIUk0AAHolAACAgwAA+f8AAIDoAABSCAABFVgAADqXAAAXb9daH5AAAAFCSURBVHja7NY9bsIwGAZgiwOwIDGys7NyAu6BOnGPHoDAgEBiYWSCmYoDpBJDByYWJ+RHiVGDTWP77QBqqZoIkhCpQy29kyU/8vfZsgkZ0hYxqEkMixGDHh4TixGDmmRIW+S8OEVJMclFKwmwGLls68dEc+bg6SXMlObMSUIOiUBn4SPr6Cz8PwQklai3ZrAiCZdL9NasWImS8my+I4o1uNQYvR3TFswHNKZ7BCf1VY5AKDSm+8cBy52A1N/1lhpY7sRjgPbcQyDUr6YGQqE994oBlQHFNoxTT842jFEZFAC6qxDspFMBdlLorsJ8QHVkwePq5vl3uUJ1ZGUH+psIXOqbAJca/U2UDahP7MTGpg1fKNQn9v1AbWzj1fvA/qjgXMXl53hX8YXCxo9RG9vFbnLO/AN3AeU/mSU/+iV/Wz4HAO0TO0w8lLnaAAAAAElFTkSuQmCC',
          endArrow = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAYnAAAGJwFNVNjHAAAAIGNIUk0AAHolAACAgwAA+f8AAIDoAABSCAABFVgAADqXAAAXb9daH5AAAAE/SURBVHja7JY9bsJAEIVXHIAGiZKenpYTcA+UintwAAwFAomGkgpqIg7gSC6poFj/YMtewNiOvX4pYglQIP7BK6XISK9aaT7NvBnNEjKiLSJRmUgqIxI9liOVEYnKZERb5Ds5hSDJJKEJAqiMJGWJquD4DygGqE00KFYIy+cwvasOiYzLVfqF48P8RG2iZQfUpxosnyNr2D5Hfarla9FAceFFcWpyL4oxUNz8HlTHKg5eehWmx1Edq8VM7q4dsOA5hAUxumun+BRVhhRbJ3wK2DohKsMXx7S9MGE/MNz2OdoLs5w9WO183PodxcBq55e3aI2ZfleFHXA0Znq5m9yXz3DDGG4Yoy+fX9vk5tzA27tzp96GYX+KsD9F6G3Yj/fm3MgO6Cwt5I3O0vpDgEctStMvLRJ/MgUffcHflq8BAGM1Oto/EMphAAAAAElFTkSuQmCC',
          html =
          [
              '<div id="spu-modal">',
              '    <div>',
              '        <button class="spu" id="spu-close" title="Отменить поиск">X</button><br>',
              '        <li>',
              '           <fieldset>',
              '               <legend>Сортировать найденное</legend>',
              '               <li>',
              '                  <label for="spu-fromnew">От новых к старым</label>',
              '                  <input id="spu-fromnew" name="sort" type="radio">',
              '                  <input id="spu-fromold" name="sort" type="radio">',
              '                  <label for="spu-fromold">От старых к новым</label>',
              '               </li>',
              '           </fieldset>',
              '           <fieldset>',
              '               <legend>Дополнительно</legend>',
              '               <li>',
              '                  <label for="spu-head">Шапку в результаты',
              '                      <img src="' + questionMark + '" title="Включать шапку темы в результат поиска, при удовлетворении условиям">',
              '                  </label>',
              '                  <input id="spu-head" type="checkbox">',
              '               </li>',
              '               <li>',
              '                  <label for="spu-imgs">Без картинок',
              '                      <img src="' + questionMark + '" title="Заменить картинки в найденных постах ссылками на них (исключая смайлы)">',
              '                  </label>',
              '                  <input id="spu-imgs" type="checkbox">',
              '               </li>',
              '           </fieldset>',
              '        </li>',
              '        <fieldset>',
              '            <legend>Введите имя(-ена)',
              '                <img src="' + questionMark + '" title="' + hlpNms + '">',
              '            </legend>',
              '            <li>',
              '                <button class="spu" id="spu-names-list" title="' + nmBtnHlp + '">Добавить имена',
              '                    <img src="' + questionMark + '">',
              '                </button>',
              '                <div>',
              '                    <ul id="spu-nms-menu" hidden="true">',
              '                    </ul>',
              '                </div>',
              '            </li>',
              '            <img class="spu clear-form" src="' + clsImg + '" title="Очистить форму">',
              '            <input id="spu-names">',
              '        </fieldset>',
              '        <fieldset id="spu-col">',
              '            <legend>Введите текст',
              '                <img src="' + questionMark + '" title="' + hlpTxt + '">',
              '            </legend>',
              '            <fieldset>',
              '                <legend>Опции поиска</legend> ',
              '               <li>',
              '                   <label for="spu-highlight">Подсветить найденное',
              '                       <img src="' + questionMark + '" title="' + highlightHlp + '">',
              '                   </label>',
              '                   <input id="spu-highlight" type="checkbox">',
              '               </li>',
              '               <li>',
              '                   <label for="spu-sig">В подписях</label>',
              '                   <input id="spu-sig" type="checkbox">',
              '               </li>',
              '               <li>',
              '                   <label for="spu-qt">В цитатах</label>',
              '                   <input id="spu-qt" type="checkbox">',
              '               </li>',
              '               <li>',
              '                   <label for="spu-sentence">Фразу</label>',
              '                   <input id="spu-sentence" type="checkbox">',
              '               </li>',
              '               <li>',
              '                   <label for="spu-whole">Точное соответствие',
              '                       <img src="' + questionMark + '" title="' + wholeHlp + '">',
              '                   </label>',
              '                   <input id="spu-whole" type="checkbox">',
              '               </li>',
              '               <li>',
              '                   <label for="spu-case">Без учета регистра</label>',
              '                   <input id="spu-case" type="checkbox">',
              '               </li>',
              '               <li>',
              '                   <label for="spu-regexp">RegExp</label>',
              '                   <input id="spu-regexp" type="checkbox">',
              '                   <input id="spu-flags" size="6" disabled="" hidden="" placeholder="Флаги" type="text">',
              '               </li>',
              '            </fieldset>',
              '            <div>',
              '                <img class="spu clear-form" src="' + clsImg + '" title="Очистить форму">',
              '                <textarea id="spu-txtarea"></textarea>',
              '            </div>',
              '        </fieldset><br>',
              '        <div></div>',
              '        <div id="spu-sticky">',
              '            <button id="spu-srch-strt" class="spu">Начать поиск</button>',
              '        </div>',
              '    </div>',
              '</div>'
          ].join('\n'),
          // Стиль без жестких фоновых цветов постов, чтобы подходила любая сторонняя тема
          css =
          [
              '#spu-spoiler-head {',
              '    -moz-user-select: none !important;',
              '    -webkit-user-select: none !important;',
              '    -ms-user-select: none !important;',
              '    user-select: none !important;',
              '    cursor: pointer !important',
              '}',
              '#spu-spoiler-head[notready] {',
              '    cursor: not-allowed !important;',
              '}',
              '#spu-spoiler-body {',
              '    border: 1px solid #8b8b8b !important;',
              '    padding: .5em 0 !important;',
              '    box-sizing: border-box !important;',
              '}',
              '#spu-spoiler-body:not([hidden]) {',
              '    display: block !important;',
              '}',
              '#spu-spoiler-body button.spu' + (listener.options.hideSearchButton ? ', .tb:not(:hover) button.spu' : '') + '{',
              '    visibility: hidden !important;',
              '}',
              '#spu-spoiler-body > .tb:last-of-type {',
              '    border-bottom-width: 1px !important;',
              '    margin-bottom: -100px !important;',
              '}',
              '#spu-spoiler-body > .tb spu-layer {',
              '    background-color: ' + listener.options.highlightColor + ' !important;',
              '}',
              '.spu {',
              '    padding: .05em .5em .1em !important;',
              '    border: 1px solid rgba(66,78,90,0.2) !important;',
              '    border-radius: 2px !important;',
              '    box-shadow: none !important;',
              '    font-size: 1em !important;',
              '    cursor: pointer;',
              '}',
              '.spu:hover {',
              '    background: rgb(235,235,235);',
              '}',
              '.spu:active {',
              '    background: rgb(225,225,225) !important;',
              '}',
              'td.dats button.spu {',
              '    display: inline-flex !important;',
              '    align-items: center !important;',
              '    justify-content: center !important;',
              '    width: 28px !important;',
              '    height: 25px !important;',
              '    padding: 0 !important;',
              '    margin: 4px auto 2px auto !important;',
              '    border-radius: 4px !important;',
              '    border: 1px solid rgba(128, 128, 128, 0.25) !important;',
              '    background: rgba(128, 128, 128, 0.08) !important;',
              '    color: inherit !important;',
              '    opacity: 0.8 !important;',
              '    transition: all 0.15s ease-in-out !important;',
              '    box-sizing: border-box !important;',
              '    cursor: pointer !important;',
              '    outline: none !important;',
              '}',
              'td.dats button.spu:hover {',
              '    opacity: 1 !important;',
              '    color: #1e88e5 !important;',
              '    background: rgba(30, 136, 229, 0.14) !important;',
              '    border-color: rgba(30, 136, 229, 0.45) !important;',
              '    transform: translateY(-1px) !important;',
              '    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12) !important;',
              '}',
              'td.dats button.spu:active {',
              '    transform: translateY(0) !important;',
              '    background: rgba(30, 136, 229, 0.25) !important;',
              '}',
              'td.dats button.spu svg {',
              '    display: block !important;',
              '    pointer-events: none !important;',
              '}',
              '#spu-nav {',
              '    position: -webkit-sticky !important;',
              '    position: sticky !important;',
              '    display: inline-block !important;',
              '    height: 0 !important;',
              '    top: 0 !important;',
              '    bottom: calc(50vh + 50px) !important;',
              '    left: 0 !important;',
              '    margin-bottom: 100px !important;',
              '}',
              '#spu-nav ul {',
              '    padding: 0 !important;',
              '    margin: 0 !important;',
              '}',
              '.spu-nav-btn {',
              '    list-style-position: inside !important;',
              '}',
              '#spu-nav-up {',
              '    list-style-image: url("' + upArrow + '") !important;',
              '}',
              '#spu-nav-down {',
              '    list-style-image: url("' + downArrow + '") !important;',
              '}',
              '#spu-nav-home {',
              '    list-style-image: url("' + homeArrow + '") !important;',
              '}',
              '#spu-nav-end {',
              '    list-style-image: url("' + endArrow + '") !important;',
              '}',
              '#spu-modal {',
              '    position: fixed !important;',
              '    top: 0 !important;',
              '    right: 0 !important;',
              '    bottom: 0 !important;',
              '    left: 0 !important;',
              '    background: rgba(0,0,0,0.8) !important;',
              '    z-index: 2147483646 !important;',
              '}',
              '#spu-modal > div {',
              '    position: relative !important;',
              '    width: 60vw;',
              '    max-width: 1200px;',
              '    max-height: 80vh !important;',
              '    display: flex !important;',
              '    flex-flow: column !important;',
              '    margin: 10vh auto !important;',
              '    padding: 20px !important;',
              '    border-radius: 3px !important;',
              '    background: rgb(251, 251, 251) !important;',
              '    resize: both !important;',
              '    overflow: auto !important;',
              '}',
              '#spu-modal > div > li > fieldset {',
              '    flex-grow: 1 !important;',
              '}',
              '#spu-modal fieldset,',
              '#spu-modal fieldset div {',
              '    display: flex !important;',
              '    position: relative !important;',
              '    flex-flow: column !important;',
              '    font-weight: 600 !important;',
              '}',
              '#spu-modal img:not([class]) {',
              '    cursor: help !important;',
              '    padding: 0 5px !important;',
              '    vertical-align: text-bottom !important;',
              '}',
              '#spu-modal .clear-form {',
              '    position: absolute !important;',
              '    padding: 0 !important;',
              '    border-radius: 100% !important;',
              '}',
              '#spu-modal fieldset > .clear-form {',
              '    top: -5px !important;',
              '    right: 0 !important;',
              '}',
              '#spu-modal div > .clear-form {',
              '    top: 0 !important;',
              '    right: -7px !important;',
              '}',
              '#spu-modal fieldset:not([id]) {',
              '    display: flex;',
              '    flex-flow: wrap !important;',
              '    align-items: center !important;',
              '    justify-content: space-evenly !important;',
              '}',
              '#spu-modal > div > li {',
              '    display: flex;',
              '    flex-flow: wrap !important;',
              '    align-items: stretch !important;',
              '    justify-content: space-between !important;',
              '}',
              '#spu-modal #spu-col,',
              '#spu-modal fieldset > div,',
              '#spu-modal input:not([type]) {',
              '    flex-grow: 1 !important;',
              '    flex-basis: auto !important;',
              '}',
              '#spu-modal #spu-names {',
              '    align-self: center !important;',
              '}',
              '#spu-modal label {',
              '    -moz-user-select: none !important;',
              '    -webkit-user-select: none !important;',
              '    user-select: none !important;',
              '    font-weight: 400 !important;',
              '}',
              '#spu-modal input:not([type]),',
              '#spu-modal #spu-names-list {',
              '    height: 2.5em !important;',
              '}',
              '#spu-modal textarea {',
              '    resize: none !important;',
              '    flex-basis: 30vh !important;',
              '    flex-grow: 1 !important;',
              '    margin: 10px 2px 0 !important;',
              '}',
              '#spu-modal button {',
              '    font-weight: 600 !important;',
              '}',
              '#spu-modal #spu-close {',
              '    position: fixed !important;',
              '    align-self: flex-end !important;',
              '    padding: 0 15px !important;',
              '    margin: -20px -20px 0 20px !important;',
              '    z-index: 2147483647 !important;',
              '}',
              '#spu-modal #spu-srch-strt {',
              '    padding: 5px 0 !important;',
              '    flex-grow: 1 !important;',
              '}',
              '#spu-modal div:empty {',
              '    min-height: 20px;',
              '}',
              '#spu-modal #spu-sticky {',
              '    display: flex !important;',
              '    position: -webkit-sticky !important;',
              '    position: sticky !important;',
              '    bottom: -20px;',
              '}',
              '#spu-modal fieldset > li {',
              '    display: inline-flex !important;',
              '    position: relative !important;',
              '}',
              '#spu-modal #spu-nms-menu li:not(:last-child) {',
              '    border-bottom: solid .5px lightgrey !important;',
              '}',
              '#spu-modal #spu-nms-menu li {',
              '    padding: .25em !important;',
              '    padding-left: 1em !important;',
              '    cursor: default !important;',
              '    text-align: start !important;',
              '    font-weight: 400 !important;',
              '}',
              '#spu-modal #spu-nms-menu li:hover {',
              '    color: #fff !important;',
              '    background: linear-gradient(to bottom, #6f81f5, #3f51f2) repeat-x !important;',
              '}',
              '#spu-modal li {',
              '    list-style-type: none !important;',
              '}',
              '#spu-modal li > div {',
              '    position: absolute !important;',
              '    top: 100% !important;',
              '    left: 0 !important;',
              '    right: 0 !important;',
              '    z-index: 999',
              '}',
              '#spu-modal #spu-nms-menu {',
              '    margin-top: 0 !important;',
              '    padding: 0 !important;',
              '    background: #fff !important;',
              '    border: 1px solid rgba(66,78,90,0.2) !important;',
              '}',
              '@media screen and (-webkit-min-device-pixel-ratio:0) {',
              '    #spu-modal fieldset:not([id]),',
              '    #spu-modal > div > li {',
              '        display: inline !important;',
              '        text-align: center !important;',
              '        vertical-align: middle !important;',
              '    }',
              '    #spu-modal > div > li > fieldset {',
              '        width: calc(50% - 28.5px) !important;',
              '    }',
              '    #spu-modal input:not([type]) {',
              '        width: calc(100% - 148px) !important;',
              '        min-width: 60% !important;',
              '    }',
              '    #spu-modal label {',
              '        vertical-align: middle !important;',
              '    }',
              '    #spu-modal fieldset > .clear-form {',
              '        top: 8px !important;',
              '        right: 2px !important;',
              '    }',
              '    #spu-modal #spu-sticky {',
              '        bottom: 0px !important;',
              '    }',
              '    #spu-modal div:empty {',
              '        min-height: 0 !important;',
              '    }',
              '    #spu-modal #spu-srch-strt {',
              '        height: max-content !important;',
              '    }',
              '    @supports not ((position: sticky) or (position: -webkit-sticky)) {',
              '        #spu-nav {',
              '            position: fixed !important;',
              '            bottom: 0 !important;',
              '            left: auto !important;',
              '        }',
              '        #spu-modal #spu-sticky {',
              '            bottom: 0px !important;',
              '            position: relative !important;',
              '        }',
              '    }',
              '}'
          ].join('\n');

    style.type = "text/css"; style.textContent = css;
    if (dats) {
        for (const dat of dats) {
            const button = dat.appendChild(document.createElement("br"))
                               && dat.appendChild(document.createElement("button")),
                  name = dat.getElementsByTagName("b")[0].textContent;
            button.className = "spu";
            button.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>';
            button.title = "Ctrl + ЛКМ: Добавить этого пользователя в задание для поиска\nЛКМ:\n\tПоиск постов для пользователя(-ей)\n\tПри наличии выделенного текста - поиск по тексту и/или по имени\n\tс диалогом выбора и редактирования\nПКМ: Показать форму для поиска";
            button.onclick = button.oncontextmenu = e => listener.handleEvent(e, name, e.button == 2);
        }
    }
    if (listener.options.searchOnProfileLinksByRMB)
        body.addEventListener("contextmenu", e => {
            const target = e.target.closest("a[href*='?action=show&member=']"),
                  name = target && target.search.split("&member=")[1];
            if (!target || !name || e.altKey || e.shiftKey || e.ctrlKey || e.metaKey
                || !!listener.getSel() || target.closest("#spu-spoiler-body")) return;
            listener.handleEvent(e, name);
        });
    if (listener.isFF && listener.options.createCnMenu) {
        const context = body.getAttribute("contextmenu"),
              menu = context
                        ? document.getElementById(context)
                        : body.appendChild(document.createElement("menu")),
              mitem = menu.appendChild(document.createElement("menuitem"));
        if (!context) {
            menu.id = "GM_page-actions";
            menu.type = "context";
            body.setAttribute("contextmenu", "GM_page-actions");
        };
        mitem.label = "Найти собщения пользователя(-ей)";
        mitem.onclick = e => listener.handleEvent(e, null, !listener.getSel());
    };
});
