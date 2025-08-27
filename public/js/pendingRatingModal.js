(function(){
  window.addEventListener('load', function(){
    const pending = window.pendingRatings || [];
    if(!pending.length) return;
    let index = 0;
    const modalEl = document.getElementById('pendingRatingModal');
    if(!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);
    const form = document.getElementById('pendingRatingForm');
    const entryIdInput = document.getElementById('pendingEntryId');
    const ratingRange = document.getElementById('pendingRatingRange');
    const ratingValue = document.getElementById('pendingRatingValue');
    const commentInput = document.getElementById('pendingCommentInput');
    const commentCounter = document.getElementById('pendingCommentCounter');
    const gameInfo = document.getElementById('pendingGameInfo');

    function updateRating(){
      if(ratingValue) ratingValue.textContent = ratingRange.value;
    }
    if(ratingRange) ratingRange.addEventListener('input', updateRating);
    if(commentInput){
      commentInput.addEventListener('input', () => {
        commentCounter.textContent = `${commentInput.value.length}/100`;
      });
    }

    function showEntry(e){
      entryIdInput.value = e._id;
      if(ratingRange){ ratingRange.value = 5; updateRating(); }
      if(commentInput){ commentInput.value = ''; commentCounter.textContent = '0/100'; }
      const g = e.game || {};
      const awayLogo = g.awayLogo || '/images/placeholder.jpg';
      const homeLogo = g.homeLogo || '/images/placeholder.jpg';
      const dateStr = g.startDate ? new Date(g.startDate).toLocaleDateString() : '';
      const awayPts = g.awayPoints ?? '';
      const homePts = g.homePoints ?? '';
      gameInfo.innerHTML =
        `<div class="elo-game-grid">`+
        `<div></div><div>${dateStr}</div><div></div>`+
        `<div><img src="${awayLogo}"></div><div>@</div><div><img src="${homeLogo}"></div>`+
        `<div>${awayPts}</div><div></div><div>${homePts}</div>`+
        `</div>`;
      modal.show();
    }

    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      const id = entryIdInput.value;
      const formData = new FormData(form);
      try{
        const res = await fetch(`/gameEntry/${id}`, { method: 'PUT', body: formData });
        if(!res.ok) throw new Error('Failed');
        index++;
        if(index < pending.length){
          showEntry(pending[index]);
        } else {
          modal.hide();
        }
      }catch(err){
        alert('Save failed');
      }
    });

    showEntry(pending[index]);
  });
})();
