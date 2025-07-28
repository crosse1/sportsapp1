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
    const comparisonContainer = $('#comparisonContainer');
    const betterBtn = $('#betterBtn');
    const worseBtn = $('#worseBtn');
    const existingGameIds = window.existingGameIds || [];
    const gameEntryCount = window.gameEntryCount || 0;
    const gameEntryNames = window.gameEntryNames || [];
    let rankingDone = gameEntryCount < 5;
    let compareIdx = 0;

    if(gameEntryCount >= 5){
      if(ratingGroup) ratingGroup.hide();
      if(nextBtn) nextBtn.show();
      if(comparisonContainer) comparisonContainer.hide();
      submitBtn.prop('disabled', true);
    } else {
      if(nextBtn) nextBtn.hide();
      if(comparisonContainer) comparisonContainer.hide();
    }

    function updateRating(){
      if(ratingRange && ratingValue){ ratingValue.textContent = ratingRange.value; }
    }
    if(ratingRange){
      updateRating();
      ratingRange.addEventListener('input', updateRating);
    }

    function showComparison(){
      if(!comparisonContainer) return;
      if(compareIdx >= gameEntryNames.length){
        rankingDone = true;
        $('#comparisonButtons').hide();
        $('#comparisonPrompt').text('Placement recorded');
        updateSubmitState();
        return;
      }
      $('#comparisonPrompt').text(`Was this game better than ${gameEntryNames[compareIdx]}?`);
    }

    if(nextBtn){
      nextBtn.on('click', function(){
        nextBtn.hide();
        if(comparisonContainer) comparisonContainer.show();
        showComparison();
      });
    }

    if(betterBtn){
      betterBtn.on('click', function(){
        rankingDone = true;
        $('#comparisonButtons').hide();
        $('#comparisonPrompt').text('Placement recorded');
        updateSubmitState();
      });
    }
    if(worseBtn){
      worseBtn.on('click', function(){
        compareIdx++;
        showComparison();
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
      if(gameEntryCount >= 5 && !rankingDone) enable = false;
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

    gameSelect.on('change', updateSubmitState);

    modal.on('shown.bs.modal', function(){
      if(gameEntryCount >= 5){
        rankingDone = false;
        compareIdx = 0;
        if(ratingGroup) ratingGroup.hide();
        if(nextBtn) nextBtn.show();
        if(comparisonContainer){
          comparisonContainer.hide();
          $('#comparisonButtons').show();
          $('#comparisonPrompt').text('');
        }
      } else {
        if(ratingGroup) ratingGroup.show();
        if(nextBtn) nextBtn.hide();
        if(comparisonContainer) comparisonContainer.hide();
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
