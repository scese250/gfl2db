import './style.css';

const SPREADSHEET_ID = '1DogyU3K7ZXw2qbhP1EhRXIAw5nCyIV5G5e-QWviBZME';
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;
const EXCLUDED_TABS = ['Home', 'Quick Links', 'FAQ', 'Weapons', 'Jiangyu(old)'];

let allCharacters = [];
let imageCache = {};
let currentBannerCN = null;
let currentBannerGlobal = null;

function proxySheetUrl(originalUrl) {
  return `/api/sheet-proxy?url=${encodeURIComponent(originalUrl)}`;
}

function proxyImageUrl(originalUrl) {
  return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
}

// Replace all Google Sheets image URLs in HTML with proxied versions
function proxyAllImages(html) {
  return html.replace(
    /https:\/\/docs\.google\.com\/sheets-images-rt\/[^"'\s)]+/g,
    (match) => proxyImageUrl(match)
  );
}

// === ROUTER ===
function getRoute() {
  const hash = window.location.hash || '#/';
  if (hash.startsWith('#/character/')) {
    const gid = hash.replace('#/character/', '');
    return { page: 'character', gid };
  }
  return { page: 'home' };
}

function navigate(hash) {
  window.location.hash = hash;
}

window.addEventListener('hashchange', () => render());

// === INIT ===
async function init() {
  try {
    const sheetListData = await fetchSheetList();
    allCharacters = sheetListData.filter(item => !EXCLUDED_TABS.includes(item.name));

    // Fetch the announcement from the Home tab
    const homeSheet = sheetListData.find(s => s.name === 'Home');
    if (homeSheet) {
      fetchAnnouncement(homeSheet.gid);
    }
    
    // Fetch the banner characters from the Quick Links tab (gid=331249341)
    fetchBannerData('331249341');

    // Start loading portraits in background
    loadAllPortraits(allCharacters);

    render();
  } catch (error) {
    console.error('Failed to initialize:', error);
    document.getElementById('page-content').innerHTML =
      '<div class="error-message">Failed to load data. Please refresh the page.</div>';
  }
}

async function fetchSheetList() {
  const url = proxySheetUrl(`${BASE_URL}/htmlview?gid=331249341`);
  const response = await fetch(url);
  const html = await response.text();

  const regex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"(\d+)"\}/g;
  const sheets = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    sheets.push({ name: match[1].trim(), gid: match[2] });
  }
  return sheets;
}

async function fetchAnnouncement(gid) {
  try {
    const url = proxySheetUrl(`${BASE_URL}/htmlview/sheet?headers=false&gid=${gid}`);
    const response = await fetch(url);
    const html = await response.text();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const table = tempDiv.querySelector('table');

    if (!table) return;

    // Build a grid to resolve merged cells for the announcement
    const grid = [];
    const rows = table.querySelectorAll('tr');
    rows.forEach((row, rIdx) => {
      if (!grid[rIdx]) grid[rIdx] = [];
      const cells = row.querySelectorAll('td');
      let cOffset = 0;
      cells.forEach(cell => {
        while (grid[rIdx][cOffset] !== undefined) cOffset++;
        const rs = cell.rowSpan || 1;
        const cs = cell.colSpan || 1;
        const text = cell.textContent.trim();
        for (let r = 0; r < rs; r++) {
          if (!grid[rIdx + r]) grid[rIdx + r] = [];
          for (let c = 0; c < cs; c++) {
            grid[rIdx + r][cOffset + c] = text;
          }
        }
        cOffset += cs;
      });
    });

    // Announcement: first non-empty cell in first few rows
    for (let r = 0; r < Math.min(6, grid.length); r++) {
      if (!grid[r]) continue;
      for (let c = 0; c < grid[r].length; c++) {
        const text = grid[r][c];
        if (text && text.length > 5 && text.length < 100) {
          const bannerEl = document.getElementById('announcement-banner');
          if (bannerEl) {
            bannerEl.textContent = text;
            if (getRoute().page === 'home') bannerEl.style.display = 'block';
          }
          return; // Fix: Stop scanning entirely once we found the announcement
        }
      }
    }
  } catch (err) {
    console.warn('Failed to fetch announcement:', err);
  }
}

async function fetchBannerData(gid) {
  try {
    const url = proxySheetUrl(`${BASE_URL}/htmlview/sheet?headers=false&gid=${gid}`);
    const response = await fetch(url);
    const html = await response.text();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const table = tempDiv.querySelector('table');

    if (!table) return;

    // Banner characters: scan anchor tags in the table that link to character sheets (#gid=...)
    // The first such link in the CN column region maps to the CN banner character.
    // The second such link maps to the EN/Global banner character.
    let bannerCNGid = null;
    let bannerGlobalGid = null;

    const anchors = table.querySelectorAll('a[href^="#gid="]');
    for (const a of anchors) {
      const hrefGid = a.getAttribute('href').replace('#gid=', '').trim();
      const td = a.closest('td');
      if (!td) continue;
      const tr = td.closest('tr');
      if (!tr) continue;

      // Get the column index of this cell in the physical row
      const cells = Array.from(tr.querySelectorAll('th, td'));
      const cellIdx = cells.indexOf(td);

      // CN side is columns 0-6 (physical cell index), EN side is columns 7+
      if (cellIdx <= 6 && !bannerCNGid) {
        bannerCNGid = hrefGid;
      } else if (cellIdx > 6 && !bannerGlobalGid) {
        bannerGlobalGid = hrefGid;
      }
      if (bannerCNGid && bannerGlobalGid) break;
    }

    if (bannerCNGid) {
      const cnChar = allCharacters.find(c => c.gid === bannerCNGid);
      if (cnChar) currentBannerCN = cnChar.name;
    }
    if (bannerGlobalGid) {
      const globalChar = allCharacters.find(c => c.gid === bannerGlobalGid);
      if (globalChar) currentBannerGlobal = globalChar.name;
    }

    // Re-render banner cards if home page is already rendered
    updateBannerCards();
  } catch (err) {
    console.warn('Failed to fetch banner data:', err);
  }
}

function updateBannerCards() {
  const bannerCNCard = document.getElementById('banner-cn-card');
  const bannerGlobalCard = document.getElementById('banner-global-card');
  if (!bannerCNCard || !bannerGlobalCard) return;

  if (currentBannerCN) {
    const cnChar = allCharacters.find(c => c.name === currentBannerCN);
    if (cnChar) {
      renderGrid([cnChar], bannerCNCard);
      if (imageCache[cnChar.gid]) updateCardImage(cnChar.gid);
    }
  }
  if (currentBannerGlobal) {
    const globalChar = allCharacters.find(c => c.name === currentBannerGlobal);
    if (globalChar) {
      renderGrid([globalChar], bannerGlobalCard);
      if (imageCache[globalChar.gid]) updateCardImage(globalChar.gid);
    }
  }
}

// === PORTRAIT LOADING ===
async function loadAllPortraits(characters) {
  const batchSize = 4;
  for (let i = 0; i < characters.length; i += batchSize) {
    const batch = characters.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(c => loadPortrait(c)));
  }
}

async function loadPortrait(character) {
  if (imageCache[character.gid]) return;
  try {
    const url = proxySheetUrl(`${BASE_URL}/htmlview/sheet?headers=true&gid=${character.gid}`);
    const response = await fetch(url);
    const html = await response.text();

    const imgMatches = [...html.matchAll(/src="(https:\/\/docs\.google\.com\/sheets-images-rt\/[^"]+)"/g)];
    if (imgMatches.length > 0) {
      let selectedImg = imgMatches[0][1];
      // Special case: OTs-14 has a placeholder image before her actual portrait
      if (character.name === 'OTs-14' && imgMatches.length > 1) {
        selectedImg = imgMatches[1][1];
      }
      imageCache[character.gid] = proxyImageUrl(selectedImg);
      updateCardImage(character.gid);
    }
  } catch (err) {
    console.warn(`Portrait failed: ${character.name}`, err);
  }
}

function updateCardImage(gid) {
  const cards = document.querySelectorAll(`[data-gid="${gid}"] .card-image-container`);
  cards.forEach(card => {
    const placeholder = card.querySelector('.card-image-placeholder');
    if (!placeholder) return;
    const img = document.createElement('img');
    img.src = imageCache[gid];
    img.loading = 'lazy';
    placeholder.replaceWith(img);
  });
}

// === RENDER ===
function render() {
  const route = getRoute();
  const content = document.getElementById('page-content');
  const header = document.getElementById('header');
  const footer = document.querySelector('.footer');
  const bannerSection = document.getElementById('banner-section');
  const announcementBanner = document.getElementById('announcement-banner');

  if (route.page === 'character') {
    header.classList.add('compact');
    footer.style.display = 'none';
    if (bannerSection) bannerSection.style.display = 'none';
    if (announcementBanner) announcementBanner.style.display = 'none';
    renderCharacterPage(content, route.gid);
  } else {
    header.classList.remove('compact');
    footer.style.display = '';
    renderHomePage(content);
  }
}

// === HOME PAGE ===
function renderHomePage(container) {
  const searchInput = document.getElementById('search-input');
  const searchContainer = document.getElementById('search-container');
  const bannerSection = document.getElementById('banner-section');
  const announcementBanner = document.getElementById('announcement-banner');
  const bannerGrid = document.getElementById('banner-grid');
  
  searchContainer.style.display = '';
  if (bannerSection) bannerSection.style.display = '';
  if (announcementBanner && announcementBanner.textContent.trim().length > 0) {
    announcementBanner.style.display = 'block';
  }

  // Render Banner (dynamic from Home sheet)
  updateBannerCards();

  container.innerHTML = '<div id="grid" class="character-grid"></div>';
  renderGrid(allCharacters);

  // Rebind search
  const newInput = document.getElementById('search-input');
  newInput.value = '';
  newInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = allCharacters.filter(c => c.name.toLowerCase().includes(query));
    renderGrid(filtered);
  });
}

function renderGrid(characters, targetContainer) {
  const grid = targetContainer || document.getElementById('grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (characters.length === 0) {
    grid.innerHTML = '<div class="no-results">No operatives found.</div>';
    return;
  }

  characters.forEach((char, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-gid', char.gid);
    card.style.animationDelay = `${(index % 20) * 0.03}s`;

    const initial = char.name.charAt(0).toUpperCase();
    const cachedImage = imageCache[char.gid];
    const imageContent = cachedImage
      ? `<img src="${cachedImage}" alt="${char.name}" loading="lazy">`
      : `<span class="card-image-placeholder">${initial}</span>`;

    card.innerHTML = `
      <div class="card-image-container">${imageContent}</div>
      <div class="card-info">
        <div class="card-name">${char.name}</div>
      </div>
    `;

    card.addEventListener('click', () => navigate(`#/character/${char.gid}`));
    grid.appendChild(card);
  });
}

// === CHARACTER PAGE ===
async function renderCharacterPage(container, gid) {
  const character = allCharacters.find(c => c.gid === gid);
  const charName = character ? character.name : 'Loading...';

  document.getElementById('search-container').style.display = 'none';

  container.innerHTML = `
    <div class="character-page">
      <div class="character-nav">
        <button id="back-btn" class="back-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
          Back
        </button>
        <span class="character-page-title">${charName}</span>
      </div>
      <div id="sheet-content" class="sheet-content">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading ${charName} data...</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => navigate('#/'));

  try {
    // Fetch the full HTML of the character's sheet
    const url = proxySheetUrl(`${BASE_URL}/htmlview/sheet?headers=true&gid=${gid}`);
    const response = await fetch(url);
    let html = await response.text();

    // Extract the table from the HTML
    const tableMatch = html.match(/<table[^>]*class="waffle"[^>]*>[\s\S]*?<\/table>/i);
    if (!tableMatch) {
      document.getElementById('sheet-content').innerHTML =
        '<div class="error-message">Could not parse sheet data.</div>';
      return;
    }

    let tableHtml = tableMatch[0];

    // Proxy all image URLs
    tableHtml = proxyAllImages(tableHtml);

    // Remove row header column (the numbered rows on the left)
    tableHtml = tableHtml.replace(/<th[^>]*class="row-headers-background"[^>]*>[\s\S]*?<\/th>/gi, '');
    tableHtml = tableHtml.replace(/<th[^>]*class="freezebar-cell[^>]*>[\s\S]*?<\/th>/gi, '');

    // Also remove the header row numbers column
    tableHtml = tableHtml.replace(/<td[^>]*class="header-row-number"[^>]*>[\s\S]*?<\/td>/gi, '');

    // Remove the thead (A-Z column headers)
    tableHtml = tableHtml.replace(/<thead[\s\S]*?<\/thead>/gi, '');

    // Remove column header background cells
    tableHtml = tableHtml.replace(/<th[^>]*class="column-headers-background"[^>]*>[\s\S]*?<\/th>/gi, '');

    // Parse the table to tag cells for toggling halves
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = tableHtml;
    const sourceTable = tempDiv.querySelector('table');

    if (sourceTable) {
      // Tag the col elements in the colgroup
      const colgroup = sourceTable.querySelector('colgroup');
      if (colgroup) {
        const cols = colgroup.querySelectorAll('col');
        cols.forEach((col, index) => {
          // Google sheets includes row header column as the first col if we didn't remove it,
          // but we didn't remove the <col> for it. Let's account for it.
          // Let's just index them. The first <col> usually corresponds to the row-header.
          // Let's dynamically find out by checking if there's a width of 120px usually for headers?
          // Actually, we can just rebuild a clean colgroup to be 100% sure.
        });
      }
      
      // Let's rebuild the colgroup to perfectly match our columns
      const newColgroup = document.createElement('colgroup');
      // Assume max 30 columns
      for (let i = 0; i < 30; i++) {
        const col = document.createElement('col');
        if (i < 9) { // Columns A-I (9 columns)
          col.className = 'half-1-col';
        } else { // Columns J+
          col.className = 'half-2-col';
        }
        newColgroup.appendChild(col);
      }
      
      if (colgroup) {
        sourceTable.replaceChild(newColgroup, colgroup);
      } else {
        sourceTable.insertBefore(newColgroup, sourceTable.firstChild);
      }

      const grid = [];
      const rows = sourceTable.querySelectorAll('tr');
      
      rows.forEach((row, r) => {
        if (!grid[r]) grid[r] = [];
        let c = 0;
        
        Array.from(row.children).forEach(cell => {
          if (cell.classList.contains('row-headers-background') || cell.classList.contains('freezebar-cell') || cell.classList.contains('header-row-number')) {
            cell.style.display = 'none';
            return;
          }

          while (grid[r][c] === true) {
            c++;
          }

          let colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
          const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);

          // Fix lazy colspans: If a cell starts in the left half (c < 9) 
          // but spans into the right half (c + colspan > 9), truncate it!
          // This prevents left-side headers from leaking into the right view.
          if (c < 9 && c + colspan > 9) {
            colspan = 9 - c;
            cell.setAttribute('colspan', colspan);
          }

          // Mark grid cells as occupied for this cell's span
          for (let i = 0; i < rowspan; i++) {
            for (let j = 0; j < colspan; j++) {
              if (!grid[r + i]) grid[r + i] = [];
              grid[r + i][c + j] = true;
            }
          }
          
          c += colspan;
        });
      });

      tableHtml = sourceTable.outerHTML;
    }

    const sheetContent = document.getElementById('sheet-content');
    sheetContent.innerHTML = `
      <div class="view-toggle-container">
        <button id="btn-half-1" class="toggle-btn active">Unit Information</button>
        <button id="btn-half-2" class="toggle-btn">Recommended Build</button>
      </div>
      <div id="table-view" class="sheet-table-wrapper">${tableHtml}</div>
    `;

    // Setup toggle logic
    const btn1 = document.getElementById('btn-half-1');
    const btn2 = document.getElementById('btn-half-2');
    const tableView = document.getElementById('table-view');

    function updateView(showHalf) {
      const cols1 = tableView.querySelectorAll('.half-1-col');
      const cols2 = tableView.querySelectorAll('.half-2-col');
      
      if (showHalf === 1) {
        cols1.forEach(c => c.style.visibility = 'visible');
        cols2.forEach(c => c.style.visibility = 'collapse');
      } else {
        cols1.forEach(c => c.style.visibility = 'collapse');
        cols2.forEach(c => c.style.visibility = 'visible');
      }
    }

    btn1.addEventListener('click', () => {
      btn1.classList.add('active');
      btn2.classList.remove('active');
      updateView(1);
    });

    btn2.addEventListener('click', () => {
      btn2.classList.add('active');
      btn1.classList.remove('active');
      updateView(2);
    });

    // Initialize to show half 1
    updateView(1);

    // Scroll to top
    window.scrollTo(0, 0);

  } catch (err) {
    console.error('Failed to load character sheet:', err);
    document.getElementById('sheet-content').innerHTML =
      '<div class="error-message">Failed to load character data. Please try again.</div>';
  }
}

document.addEventListener('DOMContentLoaded', init);
