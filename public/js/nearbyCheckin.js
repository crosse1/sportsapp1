
(function () {
  const COOLDOWN_MS = 60 * 1000; // 1 minute; adjust as needed

  window.addEventListener('load', function () {
    if (!window.loggedInUser) {
      console.log('[checkin] not logged in; abort');
      return;
    }

    // Cooldown gate instead of a permanent session lock
    const lastTs = Number(sessionStorage.getItem('nearbyCheckTs') || 0);
    if (Date.now() - lastTs < COOLDOWN_MS) {
      console.log('[checkin] cooldown active; skipping');
      return;
    }
    sessionStorage.setItem('nearbyCheckTs', String(Date.now()));

    if (!navigator.geolocation) {
      console.warn('[checkin] geolocation not available');
      return;
    }

    navigator.geolocation.getCurrentPosition(async function (pos) {
      try {
        const payload = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log('[checkin] sending position', payload);

        const res = await fetch('/api/nearbyGameCheckin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          console.warn('[checkin] nearby endpoint not ok:', res.status);
          return;
        }

        const data = await res.json();
        console.log('[checkin] nearby response:', data);

        if (data && data.game) {
          const game = data.game;
          const key = 'nearbySeen:' + (game._id || game.gameId);
          if (sessionStorage.getItem(key)) {
            console.log('[checkin] game already shown this session; skipping');
            return;
          }
          // Mark as seen immediately to avoid racey double modals
          sessionStorage.setItem(key, '1');
          showCheckinModal(game);
        } else {
          console.log('[checkin] No game nearby');
        }
      } catch (err) {
        console.error('[checkin] error:', err);
      }
    }, function (err) {
      console.error('[checkin] geolocation error:', err);
    });
  });

  function showCheckinModal(game) {
    if (!window.bootstrap) return;

    const awayLogo = game.awayTeam?.logos?.[0] || 'https://via.placeholder.com/60';
    const homeLogo = game.homeTeam?.logos?.[0] || 'https://via.placeholder.com/60';
    const awayName = game.awayTeamName || game.awayTeam?.school || '';
    const homeName = game.homeTeamName || game.homeTeam?.school || '';
    const dateStr = new Date(game.startDate).toLocaleString();

    const html = `
      <div class="modal fade checkin-modal" id="checkinModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content p-4 text-center gradient-bg text-white">
            <div class="modal-body">
              <div class="d-flex align-items-center justify-content-between mb-3">
                <div class="logo-wrapper">
                  <div class="team-logo-container mb-1"><img src="${awayLogo}" alt="${awayName}"></div>
                  <span class="team-name">${awayName}</span>
                </div>
                <div class="fs-3">@</div>
                <div class="logo-wrapper">
                  <div class="team-logo-container mb-1"><img src="${homeLogo}" alt="${homeName}"></div>
                  <span class="team-name">${homeName}</span>
                </div>
              </div>
              <div class="game-date mb-3">${dateStr}</div>
              <button class="btn gradient-glass-btn w-100 fw-bold" id="confirmCheckin">Check In</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal fade checkin-modal" id="badgeCompleteModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content p-4 text-center gradient-bg text-white">
            <div class="modal-body">
              <div id="badgeCompleteContent"></div>
              <button class="btn gradient-glass-btn mt-3" id="badgeNextBtn">Next</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal fade checkin-modal" id="badgeProgressModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content p-4 text-center gradient-bg text-white">
            <div class="modal-body">
              <h5 class="fw-bold mb-3">Badge Progress</h5>
              <div id="badgeProgressContainer" class="d-flex flex-wrap justify-content-center gap-3"></div>
              <button class="btn gradient-glass-btn mt-3" id="progressNextBtn">Continue</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal fade checkin-modal" id="checkinThanks" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content p-3 text-center gradient-bg text-white">
            <div class="modal-body">Thank you for checking in!</div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const modalEl = document.getElementById('checkinModal');
    const completeEl = document.getElementById('badgeCompleteModal');
    const progressEl = document.getElementById('badgeProgressModal');
    const thanksEl = document.getElementById('checkinThanks');
    const modal = new bootstrap.Modal(modalEl);
    const completeModal = new bootstrap.Modal(completeEl);
    const progressModal = new bootstrap.Modal(progressEl);
    const thanks = new bootstrap.Modal(thanksEl);

    [modalEl, completeEl, progressEl, thanksEl].forEach(el => {
      el.addEventListener('hidden.bs.modal', () => el.remove());
    });

    modalEl.querySelector('#confirmCheckin').addEventListener('click', async function () {
      let completed = [];
      let progressed = [];
      try {
        const idToSend = game._id || game.gameId; // support either shape
        const res = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ gameId: idToSend })
        });
        if (res.ok) {
          const data = await res.json();
          completed = data.completedBadges || [];
          progressed = data.progressedBadges || [];
        }
      } catch (err) {
        console.error('[checkin] checkin POST error:', err);
      }
      modal.hide();
      handleBadgeFlow(completed, progressed);
    });

    function handleBadgeFlow(completed, progressed) {
      function buildBadgeIcon(b, extra = '') {
        const showOverlay = b.percent < 100;
        const spans = Array(6).fill('<span>2025 2025 2025 2025 2025</span>').join('');
        const cls = `badge-icon badge-icon-container ${b.styleClass || ''} ${extra}`.trim();
        let inner = '';
        if (b.styleClass === 'special-badge-container') {
          inner = `
            <div class="special-badge-metal-bg">${spans}</div>
            <img src="${b.iconUrl}" alt="${b.badgeName}" class="special-badge-logo${showOverlay ? ' blurred' : ''}">
            ${showOverlay ? `<div class="badge-icon-overlay">${b.percent}%</div>` : ''}`;
        } else if (b.styleClass === 'gold-badge-container') {
          inner = `
            <div class="gold-badge-metal-bg">${spans}</div>
            <img src="${b.iconUrl}" alt="${b.badgeName}" class="special-badge-logo${showOverlay ? ' blurred' : ''}">
            ${showOverlay ? `<div class="badge-icon-overlay">${b.percent}%</div>` : ''}`;
        } else if (b.styleClass === 'bronze-badge-container') {
          inner = `
            <div class="bronze-badge-metal-bg">${spans}</div>
            <img src="${b.iconUrl}" alt="${b.badgeName}" class="special-badge-logo${showOverlay ? ' blurred' : ''}">
            ${showOverlay ? `<div class="badge-icon-overlay">${b.percent}%</div>` : ''}`;
        } else {
          inner = `
            <img src="${b.iconUrl}" alt="${b.badgeName}" ${showOverlay ? 'style="filter: blur(2px);"' : ''}>
            ${showOverlay ? `<div class="badge-icon-overlay">${b.percent}%</div>` : ''}`;
        }
        return `<div class="${cls}">${inner}</div>`;
      }

      const showThankYou = () => {
        thanks.show();
        setTimeout(() => thanks.hide(), 2500);
      };

      const showProgress = () => {
        const container = progressEl.querySelector('#badgeProgressContainer');
        container.innerHTML = '';
        const combined = [...completed, ...progressed];
        if (!combined.length) {
          showThankYou();
          return;
        }
        combined.forEach(b => {
          const card = document.createElement('div');
          card.className = 'badge-card p-2 d-flex align-items-center gap-3';
          if (completed.find(cb => cb._id === b._id)) {
            card.classList.add('badge-celebrate');
          }
          card.innerHTML = `
            ${buildBadgeIcon(b)}
            <div class="text-start">
              <div class="gradient-text fs-5">${b.badgeName}</div>
              <div class="gradient-text fw-light small">${b.description || ''}</div>
              <div class="gradient-text small">${b.progress}/${b.reqGames} (${b.percent}%)</div>
            </div>`;
          container.appendChild(card);
        });
        progressModal.show();
        progressEl.querySelector('#progressNextBtn').onclick = () => {
          progressModal.hide();
          showThankYou();
        };
      };

      if (completed.length) {
        let index = 0;
        const content = completeEl.querySelector('#badgeCompleteContent');
        const nextBtn = completeEl.querySelector('#badgeNextBtn');

        const showBadge = () => {
          const b = completed[index];
          content.innerHTML = `
            ${buildBadgeIcon(b, 'mb-3 badge-celebrate')}
            <h3 id="badgeCompleteTitle" class="fw-bold mb-2 gradient-text">${b.badgeName}</h3>
            <p id="badgeCompleteDesc" class="mb-0 gradient-text fw-light">${b.description || ''}</p>`;
          completeModal.show();
        };

        nextBtn.onclick = () => {
          index++;
          if (index < completed.length) {
            showBadge();
          } else {
            completeModal.hide();
            showProgress();
          }
        };

        showBadge();
      } else {
        showProgress();
      }
    }

    modal.show();
  }
})();

