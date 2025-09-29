(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const modalEl = document.getElementById('rateGameModal');
    if(!modalEl) return;

    const modal = new bootstrap.Modal(modalEl);
    const form = modalEl.querySelector('#rateGameForm');
    const manualSection = modalEl.querySelector('#rateManualSection');
    const eloSection = modalEl.querySelector('#rateEloSection');
    const ratingRange = modalEl.querySelector('#rateRatingRange');
    const ratingValue = modalEl.querySelector('#rateRatingValue');
    const commentInput = modalEl.querySelector('#rateCommentInput');
    const commentCounter = modalEl.querySelector('#rateCommentCounter');
    const photoInput = modalEl.querySelector('#ratePhotoInput');
    const photoPreview = modalEl.querySelector('#ratePhotoPreview');
    const photoPreviewImg = photoPreview ? photoPreview.querySelector('img') : null;
    const submitBtn = modalEl.querySelector('#rateSubmitBtn');
    const errorBox = modalEl.querySelector('#rateError');
    const modalTitle = modalEl.querySelector('#rateModalTitle');
    const newGameCard = modalEl.querySelector('#rateNewGameCard');
    const existingGameCard = modalEl.querySelector('#rateExistingGameCard');
    const comparisonPrompt = modalEl.querySelector('#rateComparisonPrompt');
    const comparisonButtons = modalEl.querySelector('#rateComparisonButtons');
    const betterBtn = modalEl.querySelector('#rateBetterBtn');
    const worseBtn = modalEl.querySelector('#rateWorseBtn');
    const compareInputs = [
      modalEl.querySelector('#rateCompareGameId1'),
      modalEl.querySelector('#rateCompareGameId2'),
      modalEl.querySelector('#rateCompareGameId3')
    ];
    const winnerInputs = [
      modalEl.querySelector('#rateWinner1'),
      modalEl.querySelector('#rateWinner2'),
      modalEl.querySelector('#rateWinner3')
    ];
    const entryIdInput = modalEl.querySelector('#rateEntryId');

    const gameEntriesData = Array.isArray(window.gameEntriesData) ? window.gameEntriesData : [];
    const eloGamesData = Array.isArray(window.eloGamesData) ? window.eloGamesData : [];
    const profileUserId = (window.profileUserId || '').toString();
    const loggedInUserId = (window.loggedInUserId || '').toString();

    let currentEntry = null;
    let currentEntryKey = null;
    let currentEntryGameId = null;
    let currentEntryId = null;
    let currentMode = 'manual';
    let comparisonStep = 0;
    let randomComparisons = [];
    let finalizedGames = [];
    let minRange = 1000;
    let maxRange = 2000;

    function normalizeId(value){
      if(value === undefined || value === null) return null;
      const str = String(value);
      return str && str !== 'null' && str !== 'undefined' ? str : null;
    }

    function parseNumericId(value){
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    }

    function getEntryByKey(key){
      if(!key) return null;
      const strKey = String(key);
      return gameEntriesData.find(e => {
        const entryId = normalizeId(e._id || e.id || e.entryId);
        if(entryId && entryId === strKey) return true;
        const gameId = normalizeId(e.gameId);
        return gameId && gameId === strKey;
      }) || null;
    }

    function getEloEntryId(entry){
      if(!entry) return null;
      if(entry.gameId != null){
        const num = parseNumericId(entry.gameId);
        if(num != null) return String(num);
      }
      const game = entry.game;
      if(game && typeof game === 'object'){
        if(game.gameId != null){
          const num = parseNumericId(game.gameId);
          if(num != null) return String(num);
        }
        if(game.Id != null){
          const num = parseNumericId(game.Id);
          if(num != null) return String(num);
        }
        if(game._id != null){
          return normalizeId(game._id);
        }
      } else if(game != null){
        return normalizeId(game);
      }
      return null;
    }

    function updateRatingDisplay(){
      if(!ratingRange || !ratingValue) return;
      const val = parseFloat(ratingRange.value);
      ratingValue.textContent = Number.isNaN(val) ? '' : val.toFixed(1);
    }

    function updateCommentCounter(){
      if(!commentInput || !commentCounter) return;
      commentCounter.textContent = `${commentInput.value.length}/100`;
    }

    function resetHiddenFields(){
      compareInputs.forEach(input => { if(input) input.value = ''; });
      winnerInputs.forEach(input => { if(input) input.value = ''; });
    }

    function clearError(){
      if(!errorBox) return;
      errorBox.classList.add('d-none');
      errorBox.textContent = '';
    }

    function showError(message){
      if(!errorBox) return;
      errorBox.textContent = message || 'Something went wrong.';
      errorBox.classList.remove('d-none');
    }

    function renderCard(container, data){
      if(!container) return;
      if(!data){
        container.innerHTML = '';
        return;
      }
      const date = data.gameDate ? new Date(data.gameDate) : null;
      const dateStr = date ? date.toLocaleDateString() : '';
      const awayLogo = data.awayLogo || '/images/placeholder.jpg';
      const homeLogo = data.homeLogo || '/images/placeholder.jpg';
      const awayPoints = data.awayPoints != null ? data.awayPoints : '';
      const homePoints = data.homePoints != null ? data.homePoints : '';
      container.innerHTML = `
        <div class="elo-game-grid">
          <div></div><div>${dateStr}</div><div></div>
          <div><img src="${awayLogo}" alt="Away"></div><div>@</div><div><img src="${homeLogo}" alt="Home"></div>
          <div>${awayPoints}</div><div></div><div>${homePoints}</div>
        </div>
      `;
    }

    function pickComparisonCandidate(excludeIds){
      const exclude = new Set((excludeIds || []).map(String));
      const eligible = finalizedGames.filter(g => {
        const id = getEloEntryId(g);
        if(!id || exclude.has(id)) return false;
        const elo = g.elo;
        if(typeof elo !== 'number' || Number.isNaN(elo)) return false;
        if(elo < minRange || elo > maxRange) return false;
        return true;
      });
      if(!eligible.length) return null;
      const midpoint = Math.floor((minRange + maxRange) / 2);
      let best = eligible[0];
      let bestDist = Math.abs((best.elo || 0) - midpoint);
      for(let i=1;i<eligible.length;i++){
        const candidate = eligible[i];
        const dist = Math.abs((candidate.elo || 0) - midpoint);
        if(dist < bestDist){
          best = candidate;
          bestDist = dist;
        }
      }
      return best;
    }

    function startComparisons(){
      resetHiddenFields();
      randomComparisons = [null, null, null];
      comparisonStep = 0;
      if(submitBtn) submitBtn.disabled = true;
      proceedToNextComparison();
    }

    function proceedToNextComparison(){
      if(comparisonButtons) comparisonButtons.style.display = 'none';
      comparisonPrompt && (comparisonPrompt.textContent = '');

      const exclude = [currentEntryGameId];
      randomComparisons.forEach(item => {
        const id = item ? getEloEntryId(item) : null;
        if(id) exclude.push(id);
      });

      const nextSlot = randomComparisons.findIndex(item => !item);
      if(nextSlot === -1){
        finalizeComparisons();
        return;
      }

      const candidate = pickComparisonCandidate(exclude);
      if(!candidate){
        finalizeComparisons();
        return;
      }

      randomComparisons[nextSlot] = candidate;
      const compareInput = compareInputs[nextSlot];
      if(compareInput){
        compareInput.value = getEloEntryId(candidate) || '';
      }

      const compGame = candidate.game || {};
      const compData = {
        awayLogo: compGame.awayTeam && compGame.awayTeam.logos ? compGame.awayTeam.logos[0] : compGame.awayLogo,
        homeLogo: compGame.homeTeam && compGame.homeTeam.logos ? compGame.homeTeam.logos[0] : compGame.homeLogo,
        awayPoints: compGame.AwayPoints ?? compGame.awayPoints,
        homePoints: compGame.HomePoints ?? compGame.homePoints,
        gameDate: compGame.StartDate || compGame.startDate
      };

      renderCard(newGameCard, currentEntry);
      renderCard(existingGameCard, compData);
      if(comparisonPrompt){
        comparisonPrompt.textContent = 'Which game was better?';
      }
      if(comparisonButtons){
        comparisonButtons.style.display = 'flex';
      }
      comparisonStep = nextSlot + 1;
    }

    function finalizeComparisons(){
      if(comparisonButtons) comparisonButtons.style.display = 'none';
      if(comparisonPrompt){
        comparisonPrompt.textContent = 'All comparisons complete. Submit your rating!';
      }
      if(submitBtn) submitBtn.disabled = false;
    }

    function handleComparisonResult(result){
      if(!comparisonStep) return;
      const idx = comparisonStep - 1;
      const target = randomComparisons[idx];
      if(!target) return;
      const elo = target.elo;
      if(result === 'new' && typeof elo === 'number'){
        minRange = elo;
      } else if(result === 'existing' && typeof elo === 'number'){
        maxRange = elo;
      }
      const winnerInput = winnerInputs[idx];
      if(winnerInput){
        winnerInput.value = result;
      }
      proceedToNextComparison();
    }

    function populateFromEntry(entry, link){
      currentEntry = null;
      currentEntryKey = link.getAttribute('data-entry-key') || null;
      currentEntryId = normalizeId(entry?._id || link.getAttribute('data-entry-id'));
      currentEntryGameId = normalizeId(entry?.gameId || link.getAttribute('data-game-id'));

      if(entryIdInput){
        entryIdInput.value = currentEntryId || '';
      }

      const manualRating = typeof entry?.rating === 'number' ? entry.rating : null;
      if(ratingRange){
        ratingRange.value = manualRating != null ? manualRating : 5;
        updateRatingDisplay();
      }

      if(commentInput){
        commentInput.value = entry?.comment || '';
        updateCommentCounter();
      }

      if(photoPreview && photoPreviewImg){
        if(entry?.image){
          photoPreviewImg.src = entry.image;
          photoPreview.classList.remove('d-none');
        } else {
          photoPreviewImg.src = '';
          photoPreview.classList.add('d-none');
        }
      }

      currentEntry = {
        awayLogo: link.getAttribute('data-away-logo'),
        homeLogo: link.getAttribute('data-home-logo'),
        awayPoints: link.getAttribute('data-away-score'),
        homePoints: link.getAttribute('data-home-score'),
        gameDate: link.getAttribute('data-game-date')
      };
    }

    function determineMode(entry){
      const entryIdStr = normalizeId(entry?._id);
      const ratedCount = gameEntriesData.reduce((acc, item) => {
        if(normalizeId(item._id) === entryIdStr) return acc;
        return item.elo != null ? acc + 1 : acc;
      }, 0);

      const currentGameIdStr = currentEntryGameId ? String(currentEntryGameId) : null;
      finalizedGames = eloGamesData.filter(g => {
        if(!g || !g.finalized) return false;
        const id = getEloEntryId(g);
        if(!id) return false;
        return !currentGameIdStr || id !== currentGameIdStr;
      });

      const hasComparisons = finalizedGames.length > 0;
      return ratedCount >= 5 && hasComparisons ? 'elo' : 'manual';
    }

    function prepareEloState(entry){
      const entryGameIdStr = currentEntryGameId ? String(currentEntryGameId) : null;
      const existingRecord = eloGamesData.find(g => getEloEntryId(g) === entryGameIdStr);
      minRange = typeof existingRecord?.minElo === 'number' ? existingRecord.minElo : 1000;
      maxRange = typeof existingRecord?.maxElo === 'number' ? existingRecord.maxElo : 2000;
      if(Number.isNaN(minRange) || Number.isNaN(maxRange)){
        minRange = 1000;
        maxRange = 2000;
      }
      if(minRange > maxRange){
        const tmp = minRange;
        minRange = maxRange;
        maxRange = tmp;
      }
      startComparisons();
    }

    function showManualSection(){
      if(manualSection) manualSection.style.display = '';
      if(eloSection) eloSection.style.display = 'none';
      if(submitBtn) submitBtn.disabled = false;
    }

    function showEloSection(){
      if(manualSection) manualSection.style.display = 'none';
      if(eloSection) eloSection.style.display = '';
      prepareEloState(currentEntry);
    }

    function handleLinkClick(event){
      const link = event.currentTarget;
      if(!link) return;
      const canRate = link.getAttribute('data-can-rate');
      if(canRate !== 'true' || profileUserId !== loggedInUserId){
        return;
      }
      event.preventDefault();

      const key = link.getAttribute('data-entry-key');
      const entry = getEntryByKey(key) || null;
      populateFromEntry(entry, link);
      clearError();

      if(modalTitle){
        const awayTeam = link.getAttribute('data-away-team') || 'Away';
        const homeTeam = link.getAttribute('data-home-team') || 'Home';
        modalTitle.textContent = `Rate ${awayTeam} vs ${homeTeam}!`;
      }

      currentMode = determineMode(entry);
      if(currentMode === 'elo'){
        showEloSection();
      } else {
        showManualSection();
      }

      modal.show();
    }

    function resetForm(){
      form && form.reset();
      if(ratingRange){
        ratingRange.value = 5;
        updateRatingDisplay();
      }
      if(commentInput){
        commentInput.value = '';
        updateCommentCounter();
      }
      if(photoPreview && photoPreviewImg){
        photoPreviewImg.src = '';
        photoPreview.classList.add('d-none');
      }
      clearError();
      resetHiddenFields();
      if(manualSection) manualSection.style.display = '';
      if(eloSection) eloSection.style.display = 'none';
      if(comparisonButtons) comparisonButtons.style.display = 'none';
      if(comparisonPrompt) comparisonPrompt.textContent = '';
      if(submitBtn) submitBtn.disabled = false;
      currentEntry = null;
      currentEntryKey = null;
      currentEntryId = null;
      currentEntryGameId = null;
      currentMode = 'manual';
    }

    document.querySelectorAll('.game-link').forEach(link => {
      link.addEventListener('click', handleLinkClick);
    });

    if(ratingRange){
      ratingRange.addEventListener('input', updateRatingDisplay);
      updateRatingDisplay();
    }

    if(commentInput){
      commentInput.addEventListener('input', updateCommentCounter);
      updateCommentCounter();
    }

    if(photoInput && photoPreview && photoPreviewImg){
      photoInput.addEventListener('change', function(){
        const file = this.files && this.files[0];
        if(!file){
          photoPreviewImg.src = '';
          photoPreview.classList.add('d-none');
          return;
        }
        const reader = new FileReader();
        reader.onload = function(ev){
          photoPreviewImg.src = ev.target.result;
          photoPreview.classList.remove('d-none');
        };
        reader.readAsDataURL(file);
      });
    }

    if(betterBtn){
      betterBtn.addEventListener('click', function(){ handleComparisonResult('new'); });
    }
    if(worseBtn){
      worseBtn.addEventListener('click', function(){ handleComparisonResult('existing'); });
    }

    modalEl.addEventListener('hidden.bs.modal', resetForm);

    if(form){
      form.addEventListener('submit', async function(event){
        event.preventDefault();
        clearError();
        if(!currentEntryId){
          showError('Unable to determine which entry to rate.');
          return;
        }
        const url = `/profile/games/${encodeURIComponent(currentEntryId)}/rate`;
        const formData = new FormData(form);
        formData.set('entryId', currentEntryId);
        if(submitBtn) submitBtn.disabled = true;
        try {
          const response = await fetch(url, {
            method: 'POST',
            body: formData
          });
          if(!response.ok){
            const data = await response.json().catch(() => ({}));
            throw new Error(data && data.error ? data.error : 'Failed to submit rating.');
          }
          const redirectTarget = currentEntryKey
            ? `/profileGames/${encodeURIComponent(profileUserId)}/${encodeURIComponent(currentEntryKey)}`
            : `/profileGames/${encodeURIComponent(profileUserId)}`;
          modal.hide();
          window.location.href = redirectTarget;
        } catch (err){
          showError(err.message);
          if(submitBtn) submitBtn.disabled = false;
        }
      });
    }
  });
})();
