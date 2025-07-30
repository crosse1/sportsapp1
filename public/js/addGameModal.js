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
    const submitBtn = $('#submitGameBtn');
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
    const eloGames = window.eloGamesData || [];
    const finalizedGames = eloGames.filter(g => g.finalized);
    const eloCount = eloGames.length;
    let randomGame1 = null;
    let randomGame2 = null;
    let comparisonStep = 0;
    let minRange = 1000;
    let maxRange = 2000;
    let selectedGameData = null;
    const existingGameIds = window.existingGameIds || [];
    const gameEntryCount = window.gameEntryCount || 0;
    const gameEntryNames = window.gameEntryNames || [];
    let rankingDone = finalizedGames.length === 0;

    if(finalizedGames.length){
      if(nextBtn) nextBtn.show();
      if(eloStep) eloStep.hide();
      if(infoStep) infoStep.show();
      backBtn.addClass('d-none');
      submitBtn.prop('disabled', true);
    } else {
      if(nextBtn) nextBtn.hide();
      if(eloStep) eloStep.hide();
      if(infoStep) infoStep.show();
    }

    function updateRating(){
      if(ratingRange && ratingValue){ ratingValue.textContent = ratingRange.value; }
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

    function pickRandomGame(min,max,exclude){
      exclude = exclude || [];
      const eligible = finalizedGames.filter(g=>{
        const id = String(g.game && g.game._id ? g.game._id : g.game);
        return g.elo >= min && g.elo <= max && !exclude.includes(id);
      });
      if(!eligible.length) return null;
      const idx = Math.floor(Math.random()*eligible.length);
      return eligible[idx];
    }

    function showComparison1(){
      randomGame1 = pickRandomGame(minRange,maxRange);
      if(!randomGame1){
        rankingDone = true;
        $('#comparisonPrompt').text('No comparison available');
        updateSubmitState();
        return;
      }
      const comp = randomGame1.game || {};
      compareGameInput1.val(comp._id ? comp._id : randomGame1.game);
      const compData = {
        awayLogo: comp.awayTeam && comp.awayTeam.logos && comp.awayTeam.logos[0],
        homeLogo: comp.homeTeam && comp.homeTeam.logos && comp.homeTeam.logos[0],
        awayPoints: comp.AwayPoints ?? comp.awayPoints,
        homePoints: comp.HomePoints ?? comp.homePoints,
        gameDate: comp.StartDate || comp.startDate
      };
      $('#comparisonPrompt').text('Which game is better?');
      renderCard(newCard, selectedGameData);
      renderCard(existingCard, compData);
      $('#comparisonButtons').show();
      comparisonStep = 1;
    }

    function showComparison2(){
      randomGame2 = pickRandomGame(minRange,maxRange,[String(randomGame1.game && randomGame1.game._id ? randomGame1.game._id : randomGame1.game)]);
      if(!randomGame2){
        rankingDone = true;
        $('#comparisonPrompt').text('No second comparison available');
        $('#comparisonButtons').hide();
        updateSubmitState();
        return;
      }
      const comp = randomGame2.game || {};
      compareGameInput2.val(comp._id ? comp._id : randomGame2.game);
      const compData = {
        awayLogo: comp.awayTeam && comp.awayTeam.logos && comp.awayTeam.logos[0],
        homeLogo: comp.homeTeam && comp.homeTeam.logos && comp.homeTeam.logos[0],
        awayPoints: comp.AwayPoints ?? comp.awayPoints,
        homePoints: comp.HomePoints ?? comp.homePoints,
        gameDate: comp.StartDate || comp.startDate
      };
      $('#comparisonPrompt').text('Which game is better?');
      renderCard(newCard, selectedGameData);
      renderCard(existingCard, compData);
      $('#comparisonButtons').show();
      comparisonStep = 2;
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
        showComparison1();
        updateSubmitState();
      });
    }

    if(backBtn){
      backBtn.on('click', function(){
        if(infoStep) infoStep.show();
        if(eloStep) eloStep.hide();
        nextBtn.show();
        backBtn.addClass('d-none');
        comparisonStep = 0;
        randomGame1 = null;
        randomGame2 = null;
        winnerInput1.val('');
        winnerInput2.val('');
        compareGameInput1.val('');
        compareGameInput2.val('');
        rankingDone = finalizedGames.length === 0;
        $('#comparisonButtons').hide();
        $('#comparisonPrompt').text('');
        updateSubmitState();
      });
    }

    function finalize(){
      rankingDone = true;
      $('#comparisonPrompt').text('Placement recorded');
      $('#comparisonButtons').hide();
      updateSubmitState();
    }

    betterBtn.off('click').on('click', function(){
      if(comparisonStep === 1){
        winnerInput1.val('new');
        minRange = randomGame1.elo;
        showComparison2();
      } else if(comparisonStep === 2){
        winnerInput2.val('new');
        minRange = randomGame2.elo;
        finalize();
      }
    });

    worseBtn.off('click').on('click', function(){
      if(comparisonStep === 1){
        winnerInput1.val('existing');
        maxRange = randomGame1.elo;
        showComparison2();
      } else if(comparisonStep === 2){
        winnerInput2.val('existing');
        maxRange = randomGame2.elo;
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
      return $(
        `<div class="d-flex align-items-center">`+
        `<img src="${awayLogo}" style="width:30px;height:30px;border-radius:50%;" class="me-2">`+
        `<span>${option.awayTeamName}</span>`+
        `<span class="mx-1">vs</span>`+
        `<span>${option.homeTeamName}</span>`+
        `<img src="${homeLogo}" style="width:30px;height:30px;border-radius:50%;" class="ms-2">`+
        `<span class="ms-2 text-white">(${option.scoreDisplay})</span>`+
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
      const game = gameSelect.val();
      const commentValid = commentInput.val().length <= 100;
      const duplicate = game && existingGameIds.includes(game);
      let enable = league && season && team && game && commentValid && !duplicate;
      if(finalizedGames.length && !rankingDone) enable = false;
      submitBtn.prop('disabled', !enable);
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
      const data = gameSelect.select2('data')[0];
      selectedGameData = data ? {
        awayLogo:data.awayLogo,
        homeLogo:data.homeLogo,
        awayPoints:data.awayPoints,
        homePoints:data.homePoints,
        gameDate:data.gameDate
      } : null;
      updateSubmitState();
    });

    modal.on('shown.bs.modal', function(){
      rankingDone = finalizedGames.length === 0;
      randomGame1 = null;
      randomGame2 = null;
      comparisonStep = 0;
      winnerInput1.val('');
      winnerInput2.val('');
      compareGameInput1.val('');
      compareGameInput2.val('');
      if(ratingGroup){
        if(eloCount < 5){
          ratingGroup.show();
          ratingRange && ratingRange.setAttribute('required','');
        } else {
          ratingGroup.hide();
          ratingRange && ratingRange.removeAttribute('required');
        }
      }
      if(finalizedGames.length){
        nextBtn.show();
        eloStep.hide();
        infoStep.show();
        backBtn.addClass('d-none');
        $('#comparisonButtons').hide();
        $('#comparisonPrompt').text('');
      } else {
        nextBtn.hide();
        eloStep.hide();
        infoStep.show();
      }
      updateSubmitState();
      if(!$('#leagueSelect option').length){
        fetch('/pastGames/leagues').then(r=>r.json()).then(data=>{
          const opts = data.map(l=>`<option value="${l.leagueId}">${l.leagueName}</option>`).join('');
          leagueSelect.append('<option value="">Select league</option>'+opts);
        });
      }
    });
  });
})();
