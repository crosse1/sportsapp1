
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
          <div class="modal-content p-4 text-center">
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
              <button class="btn gradient-glass-btn w-100" id="confirmCheckin">Check In</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal fade checkin-modal" id="checkinThanks" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content p-3 text-center">
            <div class="modal-body">Thank you for checking in!</div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const modalEl = document.getElementById('checkinModal');
    const thanksEl = document.getElementById('checkinThanks');
    const modal = new bootstrap.Modal(modalEl);
    const thanks = new bootstrap.Modal(thanksEl);

    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
    thanksEl.addEventListener('hidden.bs.modal', () => thanksEl.remove());

    modalEl.querySelector('#confirmCheckin').addEventListener('click', async function () {
      try {
        const idToSend = game._id || game.gameId; // support either shape
        await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ gameId: idToSend })
        });
      } catch (err) {
        console.error('[checkin] checkin POST error:', err);
      }
      modal.hide();
      thanks.show();
      setTimeout(() => thanks.hide(), 2500);
    });

    modal.show();
  }
})();

