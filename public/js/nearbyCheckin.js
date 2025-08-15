(function(){
  window.addEventListener('load', function(){
    if(!window.loggedInUser) return;
    if(sessionStorage.getItem('nearbyCheckDone')) return;
    sessionStorage.setItem('nearbyCheckDone','1');
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async function(pos){
      try{
        const res = await fetch('/api/nearbyGameCheckin',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        });
        if(!res.ok) return;
        const data = await res.json();
        if(data && data.game){
          showCheckinModal(data.game);
        } else {
          console.log('No game nearby');
        }
      }catch(err){console.error(err);}
    }, function(err){ console.error(err); });
  });

  function showCheckinModal(game){
    if(!window.bootstrap) return;
    const awayLogo = game.awayTeam && game.awayTeam.logos && game.awayTeam.logos[0] ? game.awayTeam.logos[0] : 'https://via.placeholder.com/60';
    const homeLogo = game.homeTeam && game.homeTeam.logos && game.homeTeam.logos[0] ? game.homeTeam.logos[0] : 'https://via.placeholder.com/60';
    const awayName = game.awayTeamName || (game.awayTeam && game.awayTeam.school) || '';
    const homeName = game.homeTeamName || (game.homeTeam && game.homeTeam.school) || '';
    const dateStr = new Date(game.startDate).toLocaleString();
    const html = `\n    <div class="modal fade checkin-modal" id="checkinModal" tabindex="-1" aria-hidden="true">\n      <div class="modal-dialog modal-dialog-centered">\n        <div class="modal-content p-4 text-center">\n          <div class="modal-body">\n            <div class="d-flex align-items-center justify-content-between mb-3">\n              <div class="logo-wrapper">\n                <div class="team-logo-container mb-1"><img src="${awayLogo}" alt="${awayName}"></div>\n                <span class="team-name">${awayName}</span>\n              </div>\n              <div class="fs-3">@</div>\n              <div class="logo-wrapper">\n                <div class="team-logo-container mb-1"><img src="${homeLogo}" alt="${homeName}"></div>\n                <span class="team-name">${homeName}</span>\n              </div>\n            </div>\n            <div class="game-date mb-3">${dateStr}</div>\n            <button class="btn gradient-glass-btn w-100" id="confirmCheckin">Check In</button>\n          </div>\n        </div>\n      </div>\n    </div>\n    <div class="modal fade checkin-modal" id="checkinThanks" tabindex="-1" aria-hidden="true">\n      <div class="modal-dialog modal-dialog-centered">\n        <div class="modal-content p-3 text-center">\n          <div class="modal-body">Thank you for checking in!</div>\n        </div>\n      </div>\n    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById('checkinModal');
    const thanksEl = document.getElementById('checkinThanks');
    const modal = new bootstrap.Modal(modalEl);
    const thanks = new bootstrap.Modal(thanksEl);
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
    thanksEl.addEventListener('hidden.bs.modal', () => thanksEl.remove());
    modalEl.querySelector('#confirmCheckin').addEventListener('click', async function(){
      try{
        await fetch('/api/checkin',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ gameId: game._id })
        });
      }catch(err){console.error(err);} 
      modal.hide();
      thanks.show();
      setTimeout(()=>thanks.hide(), 2500);
    });
    modal.show();
  }
})();
