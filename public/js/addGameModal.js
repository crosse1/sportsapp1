(function(){
  window.addEventListener('load', function(){
    const modal = $('#addGameModal');
    if(!modal.length) return;
    const leagueSelect = $('#leagueSelect');
    const seasonSelect = $('#seasonSelect');
    const teamSelect = $('#teamSelect');
    const gameSelect = $('#gameSelect');
    const gameSpinner = $('#gameSpinner');
    const commentInput = $('#commentInput');
    const commentCounter = $('#commentCounter');
    const commentGroup = $('#commentGroup');
    const photoGroup = $('#photoGroup');
    const photoInput = $('#photoInput');
    const submitBtn = $('#submitGameBtn');
    const originalSubmitLabel = submitBtn.length ? submitBtn.text() : 'Submit';
    const ratingRange = document.getElementById('ratingRange');
    const ratingValue = document.getElementById('ratingValue');
    const ratingGroup = $('#ratingGroup');
    const nextBtn = $('#nextBtn');
    const infoStep = $('#gameInfoStep');
    const eloStep = $('#eloStep');
    const backBtn = $('#backBtn');
    const newCard = $('#newGameCard');
    const existingCard = $('#existingGameCard');
    const betterBtn = $('#betterBtn');
    const worseBtn = $('#worseBtn');
    const compareGameInput1 = $('#compareGameId1');
    const winnerInput1 = $('#winnerInput1');
    const compareGameInput2 = $('#compareGameId2');
    const winnerInput2 = $('#winnerInput2');
    const compareGameInput3 = $('#compareGameId3');
    const winnerInput3 = $('#winnerInput3');
    const confirmModal = $('#gameAddedModal');
    const addedCard = $('#addedGameCard');
    const addedRating = $('#addedGameRating');
    const addedRatingText = $('#addedGameRatingText');
    const form = modal.find('form');
    const eloGames = window.eloGamesData || [];
    const finalizedGames = eloGames.filter(g => g.finalized);
    const autoSubmitOverlay = $('#autoSubmitOverlay');
    const multiNotice = $('#multiSelectionNotice');
    const multiDuplicateWarning = $('#multiDuplicateWarning');
    const highestElo = finalizedGames.reduce((m,g)=> g.elo>m ? g.elo : m, finalizedGames.length ? finalizedGames[0].elo : 0);
    const lowestElo = finalizedGames.reduce((m,g)=> g.elo<m ? g.elo : m, finalizedGames.length ? finalizedGames[0].elo : 0);
    let randomGame1 = null;
    let randomGame2 = null;
    let randomGame3 = null;
    let comparisonStep = 0;
    let minRange = 1000;
    let maxRange = 2000;
    let selectedGameData = null;
    const existingGameIds = window.existingGameIds || [];
    const gameEntryCount = window.gameEntryCount || 0;
    const gameEntryNames = window.gameEntryNames || [];
    let rankingDone = gameEntryCount < 5 ? true : finalizedGames.length === 0;
    let multiMode = false;


    
    function getEloEntryId(entry){
  if (!entry) return null;

  if (entry.gameId) return String(entry.gameId);

  const game = entry.game;
  if (typeof game === 'string' || typeof game === 'number') return String(game);
  if (game && typeof game === 'object') {
    if (game.gameId) return String(game.gameId);
    if (game.Id) return String(game.Id);
    if (game._id) return String(game._id);
  }

  return null;
}


    function resetForm(){
      if(!form.length) return;
      form[0].reset();
      leagueSelect.val(null).trigger('change');
      seasonSelect.prop('disabled', true).val(null).trigger('change');
      teamSelect.prop('disabled', true).val(null).trigger('change');
      gameSelect.prop('disabled', true).val(null).trigger('change');
      if(commentCounter && commentCounter.length){
        commentCounter.text('0/100');
      }
      if(ratingRange){ ratingRange.value = 5; updateRating(); }
      rankingDone = gameEntryCount < 5 ? true : finalizedGames.length === 0;
      if(typeof updateMultiMode === 'function'){
        updateMultiMode();
      } else if(typeof updateSubmitState === 'function'){
        updateSubmitState();
      }
    }

    if(nextBtn){
      if(gameEntryCount < 5){
        nextBtn.hide();
      } else {
        nextBtn.show();
      }
    }
    if(eloStep) eloStep.hide();
    if(infoStep) infoStep.show();
    backBtn.addClass('d-none');
    submitBtn.prop('disabled', true);

    function updateRating(){
      if(ratingRange && ratingValue){
        const val = parseFloat(ratingRange.value);
        ratingValue.textContent = isNaN(val) ? '' : val.toFixed(1);
      }
    }
    if(ratingRange){
      updateRating();
      ratingRange.addEventListener('input', updateRating);
    }

    function renderCard(el,data){
      if(!el) return;
      if(!data){ el.empty(); return; }
      const dateStr = data.gameDate ? new Date(data.gameDate).toLocaleDateString() : '';
      const awayLogo = data.awayLogo || '/images/placeholder.jpg';
      const homeLogo = data.homeLogo || '/images/placeholder.jpg';
      const awayScore = data.awayPoints ?? '';
      const homeScore = data.homePoints ?? '';
      el.html(
        `<div class="elo-game-grid">`+
        `<div></div><div>${dateStr}</div><div></div>`+
        `<div><img src="${awayLogo}"></div><div>@</div><div><img src="${homeLogo}"></div>`+
        `<div>${awayScore}</div><div></div><div>${homeScore}</div>`+
        `</div>`
      );
    }

    function updateDuplicateWarning(selected){
      if(!multiDuplicateWarning || !multiDuplicateWarning.length) return;
      const hasDuplicate = (selected || []).some(id => existingGameIds.includes(String(id)));
      multiDuplicateWarning.toggleClass('d-none', !hasDuplicate);
    }

    function updateMultiMode(){
      const selected = getSelectedGameIds();
      const isMulti = selected.length > 1;
      multiMode = isMulti;
      if(multiNotice && multiNotice.length){
        multiNotice.toggleClass('d-none', !isMulti);
      }
      updateDuplicateWarning(selected);

      if(isMulti){
        if(ratingGroup && ratingGroup.length){
          ratingGroup.hide();
        }
        if(ratingRange){
          ratingRange.removeAttribute('required');
          ratingRange.disabled = true;
        }
        if(photoGroup && photoGroup.length){
          photoGroup.hide();
        }
        if(photoInput && photoInput.length){
          photoInput.val('').prop('disabled', true);
        }
        if(commentGroup && commentGroup.length){
          commentGroup.hide();
        }
        if(commentInput && commentInput.length){
          commentInput.val('').prop('disabled', true);
        }
        if(commentCounter && commentCounter.length){
          commentCounter.text('0/100');
        }
        if(nextBtn && nextBtn.length){
          nextBtn.hide();
        }
        if(backBtn){
          backBtn.addClass('d-none');
        }
        if(infoStep && infoStep.length){
          infoStep.show();
        }
        if(eloStep && eloStep.length){
          eloStep.hide();
        }
        if(submitBtn && submitBtn.length){
          submitBtn.removeClass('d-none');
          submitBtn.text('Add Games');
        }
        rankingDone = true;
      } else {
        const infoVisible = !infoStep || !infoStep.length || infoStep.is(':visible');
        if(ratingRange){
          ratingRange.disabled = false;
        }
        if(commentInput && commentInput.length){
          commentInput.prop('disabled', false);
          commentCounter && commentCounter.length && commentCounter.text(`${commentInput.val().length}/100`);
        }
        if(photoInput && photoInput.length){
          photoInput.prop('disabled', false);
        }
        if(photoGroup && photoGroup.length){
          photoGroup.show();
        }
        if(commentGroup && commentGroup.length){
          commentGroup.show();
        }
        if(ratingGroup && ratingGroup.length){
          if(gameEntryCount < 5){
            ratingGroup.show();
            ratingRange && ratingRange.setAttribute('required','');
          } else {
            ratingGroup.hide();
            ratingRange && ratingRange.removeAttribute('required');
          }
        }
        if(nextBtn && nextBtn.length && infoVisible){
          if(gameEntryCount < 5){
            nextBtn.hide();
          } else {
            nextBtn.show();
          }
        }
        if(submitBtn && submitBtn.length){
          submitBtn.text(originalSubmitLabel || 'Submit');
          if(gameEntryCount < 5){
            submitBtn.removeClass('d-none');
          } else if(infoVisible){
            submitBtn.addClass('d-none');
          }
        }
        rankingDone = gameEntryCount < 5 ? true : finalizedGames.length === 0;
      }

      updateSubmitState();
    }

    function pickRandomGame(min, max, exclude) {
  exclude = (exclude || []).map(String);

  if (isNaN(min) || isNaN(max) || min > max) return null;

  const eligible = finalizedGames.filter(g => {
    const id = getEloEntryId(g);
    // ❌ CURRENT: (!id || !exclude.includes(String(id)))
    // ✅ FIX: must have an id, and it must not be excluded, and elo in range
    return id && g.elo >= min && g.elo <= max && !exclude.includes(String(id));
  });

  if (!eligible.length) return null;

  const midpoint = Math.floor((min + max) / 2);
  let closest = eligible[0];
  let bestDist = Math.abs(closest.elo - midpoint);
  for (let i = 1; i < eligible.length; i++) {
    const dist = Math.abs(eligible[i].elo - midpoint);
    if (dist < bestDist) {
      closest = eligible[i];
      bestDist = dist;
    }
  }
  return closest;
}
function getSelectedGameIds(){
  if(!gameSelect || !gameSelect.length) return [];
  const raw = gameSelect.val();
  if(raw == null) return [];
  if(Array.isArray(raw)){
    return raw.filter(v => v !== null && v !== undefined && v !== '');
  }
  return [raw];
}

function getSelectedGameId(){
  const ids = getSelectedGameIds();
  return ids.length ? String(ids[ids.length - 1]) : null;
}

    function showComparison1(){
  const exclude = [];
  const newId = getSelectedGameId();
  if (newId) exclude.push(newId);

  randomGame1 = pickRandomGame(minRange, maxRange, exclude);
  if(!randomGame1){ finalize(); return; }

  const compId = getEloEntryId(randomGame1);
  compareGameInput1.val(compId || '');

  const comp = randomGame1.game || {};
  const compData = {
    awayLogo: comp.awayTeam?.logos?.[0],
    homeLogo: comp.homeTeam?.logos?.[0],
    awayPoints: comp.AwayPoints ?? comp.awayPoints,
    homePoints: comp.HomePoints ?? comp.homePoints,
    gameDate: comp.StartDate || comp.startDate
  };

  $('#comparisonPrompt').text('');
  renderCard(newCard, selectedGameData);
  renderCard(existingCard, compData);
  $('#comparisonButtons').hide();
  comparisonStep = 1;
}

function showComparison2(){
  const exclude = [];
  const newId = getSelectedGameId();
  if (newId) exclude.push(newId);

  const firstId = getEloEntryId(randomGame1);
  if (firstId) exclude.push(String(firstId));

  randomGame2 = pickRandomGame(minRange, maxRange, exclude);
  if(!randomGame2){ finalize(); return; }

  const compId = getEloEntryId(randomGame2);
  compareGameInput2.val(compId || '');

  const comp = randomGame2.game || {};
  const compData = {
    awayLogo: comp.awayTeam?.logos?.[0],
    homeLogo: comp.homeTeam?.logos?.[0],
    awayPoints: comp.AwayPoints ?? comp.awayPoints,
    homePoints: comp.HomePoints ?? comp.homePoints,
    gameDate: comp.StartDate || comp.startDate
  };

  $('#comparisonPrompt').text('');
  renderCard(newCard, selectedGameData);
  renderCard(existingCard, compData);
  $('#comparisonButtons').hide();
  comparisonStep = 2;
}

function showComparison3(){
  const exclude = [];
  const newId = getSelectedGameId();
  if (newId) exclude.push(newId);

  const excludeId1 = getEloEntryId(randomGame1);
  const excludeId2 = getEloEntryId(randomGame2);
  if (excludeId1) exclude.push(String(excludeId1));
  if (excludeId2) exclude.push(String(excludeId2));

  randomGame3 = pickRandomGame(minRange, maxRange, exclude);
  if(!randomGame3){ finalize(); return; }

  const compId = getEloEntryId(randomGame3);
  compareGameInput3.val(compId || '');

  const comp = randomGame3.game || {};
  const compData = {
    awayLogo: comp.awayTeam?.logos?.[0],
    homeLogo: comp.homeTeam?.logos?.[0],
    awayPoints: comp.AwayPoints ?? comp.awayPoints,
    homePoints: comp.HomePoints ?? comp.homePoints,
    gameDate: comp.StartDate || comp.startDate
  };

  $('#comparisonPrompt').text('');
  renderCard(newCard, selectedGameData);
  renderCard(existingCard, compData);
  $('#comparisonButtons').hide();
  comparisonStep = 3;
}


    if(nextBtn){
      nextBtn.on('click', function(){
        nextBtn.hide();
        if(infoStep) infoStep.hide();
        if(eloStep) eloStep.show();
        if(backBtn) backBtn.removeClass('d-none');
        const data = gameSelect.select2('data')[0];
        selectedGameData = {
          awayLogo: data?.awayLogo,
          homeLogo: data?.homeLogo,
          awayPoints: data?.awayPoints,
          homePoints: data?.homePoints,
          gameDate: data?.gameDate
        };
        minRange = 1000;
        maxRange = 2000;
        comparisonStep = 0;
        if(gameEntryCount < 5){
          finalize();
        } else {
          showComparison1();
        }
        updateSubmitState();
      });
    }

    if(backBtn){
      backBtn.on('click', function(){
        if(infoStep) infoStep.show();
        if(eloStep) eloStep.hide();
        if(gameEntryCount < 5){
          nextBtn.hide();
        } else {
          nextBtn.show();
        }
        backBtn.addClass('d-none');
        comparisonStep = 0;
        randomGame1 = null;
        randomGame2 = null;
        randomGame3 = null;
        winnerInput1.val('');
        winnerInput2.val('');
        winnerInput3.val('');
        compareGameInput1.val('');
        compareGameInput2.val('');
        compareGameInput3.val('');
        rankingDone = gameEntryCount < 5 ? true : finalizedGames.length === 0;
        $('#comparisonButtons').hide();
        $('#comparisonPrompt').text('');
        updateSubmitState();
      });
    }

    function finalize(){
      rankingDone = true;
      $('#comparisonPrompt').text('');
      $('#comparisonButtons').hide();
      updateSubmitState();
      if(gameEntryCount >= 5){
        autoSubmit();
      }
    }

    betterBtn.off('click').on('click', function(){
  if(comparisonStep === 1){
    winnerInput1.val('new');
    if (randomGame1) minRange = Math.min(maxRange, randomGame1.elo + 1);
    if(randomGame1 && randomGame1.elo === highestElo){
      finalize();
    } else {
      showComparison2();
    }
  } else if(comparisonStep === 2){
    winnerInput2.val('new');
    if (randomGame2) minRange = Math.min(maxRange, randomGame2.elo + 1);
    showComparison3();
  } else if(comparisonStep === 3){
    winnerInput3.val('new');
    if (randomGame3) minRange = Math.min(maxRange, randomGame3.elo + 1);
    finalize();
  }
});

worseBtn.off('click').on('click', function(){
  if(comparisonStep === 1){
    winnerInput1.val('existing');
    if (randomGame1) maxRange = Math.max(minRange, randomGame1.elo - 1);
    if(randomGame1 && randomGame1.elo === lowestElo){
      finalize();
    } else {
      showComparison2();
    }
  } else if(comparisonStep === 2){
    winnerInput2.val('existing');
    if (randomGame2) maxRange = Math.max(minRange, randomGame2.elo - 1);
    showComparison3();
  } else if(comparisonStep === 3){
    winnerInput3.val('existing');
    if (randomGame3) maxRange = Math.max(minRange, randomGame3.elo - 1);
    finalize();
  }
});


    if(newCard){
      newCard.on('click', function(){
        if(betterBtn) betterBtn.trigger('click');
      });
    }

    if(existingCard){
      existingCard.on('click', function(){
        if(worseBtn) worseBtn.trigger('click');
      });
    }

    function showConfirmation(entry){
      if(!confirmModal.length) return;
      const game = entry.game || {};
      const data = {
        awayLogo: game.awayTeam && game.awayTeam.logos && game.awayTeam.logos[0],
        homeLogo: game.homeTeam && game.homeTeam.logos && game.homeTeam.logos[0],
        awayPoints: game.AwayPoints ?? game.awayPoints,
        homePoints: game.HomePoints ?? game.homePoints,
        gameDate: game.StartDate || game.startDate
      };
      renderCard(addedCard, data);
      
      const elo = entry.elo;
      const rawScore = ((elo - 1000) / 1000) * 9 + 1;
      const rating = Math.max(1.0, Math.min(10.0, Math.round(rawScore * 10) / 10));
      const ratingStr = rating.toFixed(1);
      addedRating.text(ratingStr);
      if(addedRatingText){ addedRatingText.text(ratingStr + '/10'); }
      bootstrap.Modal.getOrCreateInstance(confirmModal[0]).show();
    }

    async function autoSubmit(){
      if(!form.length) return;
      submitBtn.prop('disabled', true);
      if(autoSubmitOverlay){ autoSubmitOverlay.show(); }
      try{
        const res = await fetch(form.attr('action'), { method:'POST', body:new FormData(form[0]), headers:{ 'Accept':'application/json' } });
        if(res.ok){
          const json = await res.json();
          if(autoSubmitOverlay){ autoSubmitOverlay.hide(); }
          if(json && json.entry){
            showConfirmation(json.entry);
            if(window.gameEntriesData){
              window.gameEntriesData.push(json.entry);
            }
          }
        }else{
          if(autoSubmitOverlay){ autoSubmitOverlay.hide(); }
          alert('Save failed');
        }
      }catch(err){
        if(autoSubmitOverlay){ autoSubmitOverlay.hide(); }
        alert('Save failed');
      }finally{
        submitBtn.prop('disabled', false);
        bootstrap.Modal.getInstance(modal[0]).hide();
        resetForm();
      }
    }

    function formatTeam(option){
      if(!option.id) return option.text;
      const logo = option.logo || '/images/placeholder.jpg';
      return $(
        `<div class="d-flex align-items-center">`+
        `<img src="${logo}" style="width:30px;height:30px;border-radius:50%;" class="me-2">`+
        `<span>${option.text}</span>`+
        `</div>`
      );
    }

    function formatGame(option){
      if(!option.id) return option.text;
      const homeLogo = option.homeLogo || '/images/placeholder.jpg';
      const awayLogo = option.awayLogo || '/images/placeholder.jpg';
      const scoreDisplay = option.scoreDisplay || '';
      return $(
        `<div class="game-result-option d-flex align-items-center justify-content-between w-100">`+
          `<div class="d-flex align-items-center flex-grow-1 gap-2">`+
            `<img src="${awayLogo}" class="game-result-logo">`+
            `<span class="fw-semibold text-white">${option.awayTeamName}</span>`+
            `<span class="text-white-50">@</span>`+
            `<img src="${homeLogo}" class="game-result-logo">`+
            `<span class="fw-semibold text-white">${option.homeTeamName}</span>`+
          `</div>`+
          `<span class="game-result-score text-white-50 ms-3">${scoreDisplay}</span>`+
        `</div>`
      );
    }

    teamSelect.select2({
      dropdownParent: modal,
      placeholder:'Select Team',
      width:'100%',
      containerCssClass:'glass-select2',
      dropdownCssClass:'glass-select2',
      templateResult: formatTeam,
      templateSelection: formatTeam,
      ajax:{
        url:'/pastGames/teams',
        dataType:'json',
        delay:250,
        data:function(params){
          return { leagueId: leagueSelect.val(), season: seasonSelect.val(), q: params.term };
        },
        processResults:function(data){
          return { results:data.map(t=>({ id:t.teamId, text:t.school, logo:(t.logos&&t.logos[0]) })) };
        }
      }
    });

    gameSelect.select2({
      dropdownParent: modal,
      placeholder:'Select Game',
      width:'100%',
      templateResult: formatGame,
      templateSelection: formatGame,
      containerCssClass:'glass-select2',
      dropdownCssClass:'glass-select2',
      closeOnSelect:false,
      ajax:{
        url:'/pastGames/search',
        dataType:'json',
        delay:250,
        beforeSend:function(){
          if(gameSpinner){ gameSpinner.show(); }
        },
        data:function(params){
          return {
            leagueId: leagueSelect.val(),
            season: seasonSelect.val(),
            teamId: teamSelect.val(),
            q: params.term
          };
        },
        processResults:function(data){
          return { results:data.map(g=>{
            const parts = g.score.split('-');
            const home = parts[0] || '';
            const away = parts[1] || '';
            return {
              id:g.id,
              homeTeamName:g.homeTeamName,
              awayTeamName:g.awayTeamName,
              homeLogo:g.homeLogo,
              awayLogo:g.awayLogo,
              score:g.score,
              homePoints:g.homePoints,
              awayPoints:g.awayPoints,
              gameDate:g.gameDate,
              scoreDisplay:`${away}-${home}`,
              text:`${g.awayTeamName} vs ${g.homeTeamName}`
            };
          }) };
        },
        complete:function(){
          if(gameSpinner){ gameSpinner.hide(); }
        }
      }
    });

    function updateSubmitState(){
      const league = leagueSelect.val();
      const season = seasonSelect.val();
      const team = teamSelect.val();
      const selected = getSelectedGameIds();
      const hasSelection = selected.length > 0;
      const commentLength = commentInput && commentInput.length ? commentInput.val().length : 0;
      const commentValid = commentLength <= 100;
      const duplicate = selected.some(id => existingGameIds.includes(String(id)));
      let enable = Boolean(league && season && team && hasSelection) && !duplicate;

      if(selected.length <= 1){
        enable = enable && commentValid;
        if(hasSelection && !rankingDone){
          enable = false;
        }
      }

      submitBtn.prop('disabled', !enable);
      updateDuplicateWarning(selected);
    }

    commentInput.on('input', function(){
      commentCounter.text(`${this.value.length}/100`);
      updateSubmitState();
    });

    leagueSelect.on('change', function(){
      const val = $(this).val();
      seasonSelect.prop('disabled', !val).val(null).trigger('change');
      teamSelect.prop('disabled', true).val(null).trigger('change');
      gameSelect.prop('disabled', true).val(null).trigger('change');
      if(val){
        fetch('/pastGames/seasons?leagueId='+val).then(r=>r.json()).then(data=>{
          const opts = data.map(s=>`<option value="${s}">${s}</option>`).join('');
          seasonSelect.html('<option value="">Select season</option>'+opts);
        });
      } else {
        seasonSelect.html('<option value="">Select season</option>');
      }
      updateSubmitState();
    });

    seasonSelect.on('change', function(){
      const val = $(this).val();
      teamSelect.prop('disabled', !val).val(null).trigger('change');
      gameSelect.prop('disabled', true).val(null).trigger('change');
      updateSubmitState();
    });

    teamSelect.on('change', function(){
      const val = $(this).val();
      gameSelect.prop('disabled', !val).val(null).trigger('change');
      updateSubmitState();
    });

    gameSelect.on('change', function(){
      const dataArr = gameSelect.select2('data') || [];
      if(dataArr.length === 1){
        const data = dataArr[0];
        selectedGameData = {
          awayLogo:data.awayLogo,
          homeLogo:data.homeLogo,
          awayPoints:data.awayPoints,
          homePoints:data.homePoints,
          gameDate:data.gameDate
        };
      } else {
        selectedGameData = null;
      }
      updateMultiMode();
    });

    modal.on('shown.bs.modal', function(){
      rankingDone = gameEntryCount < 5 ? true : finalizedGames.length === 0;
      randomGame1 = null;
      randomGame2 = null;
      randomGame3 = null;
      comparisonStep = 0;
      winnerInput1.val('');
      winnerInput2.val('');
      winnerInput3.val('');
      compareGameInput1.val('');
      compareGameInput2.val('');
      compareGameInput3.val('');
      if(ratingGroup){
        if(gameEntryCount < 5){
          ratingGroup.show();
          ratingRange && ratingRange.setAttribute('required','');
        } else {
          ratingGroup.hide();
          ratingRange && ratingRange.removeAttribute('required');
        }
      }
      if(nextBtn){
        if(gameEntryCount < 5){
          nextBtn.hide();
        } else {
          nextBtn.show();
        }
      }
      if(submitBtn){
        if(gameEntryCount < 5){
          submitBtn.removeClass('d-none');
        } else {
          submitBtn.addClass('d-none');
        }
      }
      if(eloStep) eloStep.hide();
      if(infoStep) infoStep.show();
      backBtn.addClass('d-none');
      $('#comparisonButtons').hide();
      $('#comparisonPrompt').text('');
      updateMultiMode();
      if(!$('#leagueSelect option').length){
        fetch('/pastGames/leagues').then(r=>r.json()).then(data=>{
          const opts = data.map(l=>`<option value="${l.leagueId}">${l.leagueName}</option>`).join('');
          leagueSelect.append('<option value="">Select league</option>'+opts);
        });
      }
    });
    if(confirmModal.length){
      confirmModal.on('hidden.bs.modal', function(){
        window.location.reload();
      });
    }
  });
})();
