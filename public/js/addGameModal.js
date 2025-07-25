(function(){
  window.addEventListener('load', function(){
    const modal = $('#addGameModal');
    if(!modal.length) return;
    const seasonSelect = $('#seasonSelect');
    const teamSelect = $('#teamSelect');
    const gameSelect = $('#gameSelect');
    const commentInput = $('#commentInput');
    const commentCounter = $('#commentCounter');
    const submitBtn = $('#submitGameBtn');
    const ratingRange = document.getElementById('ratingRange');
    const ratingValue = document.getElementById('ratingValue');
    const existingGameIds = window.existingGameIds || [];

    function updateRating(){
      if(ratingRange && ratingValue){ ratingValue.textContent = ratingRange.value; }
    }
    if(ratingRange){
      updateRating();
      ratingRange.addEventListener('input', updateRating);
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
      minimumResultsForSearch: Infinity,
      templateResult: formatTeam,
      templateSelection: formatTeam,
      ajax:{
        url:'/pastGames/teams',
        dataType:'json',
        delay:250,
        data:function(){ return { season: seasonSelect.val() }; },
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
      minimumResultsForSearch: Infinity,
      ajax:{
        url:'/pastGames/search',
        dataType:'json',
        delay:250,
        data:function(){
          return { season: seasonSelect.val(), teamId: teamSelect.val() };
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
        }
      }
    });

    function updateSubmitState(){
      const season = seasonSelect.val();
      const team = teamSelect.val();
      const game = gameSelect.val();
      const commentValid = commentInput.val().length <= 100;
      const duplicate = game && existingGameIds.includes(game);
      submitBtn.prop('disabled', !(season && team && game && commentValid && !duplicate));
    }

    commentInput.on('input', function(){
      commentCounter.text(`${this.value.length}/100`);
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
      updateSubmitState();
      if(!$('#seasonSelect option').length){
        fetch('/pastGames/seasons').then(r=>r.json()).then(data=>{
          const opts = data.map(s=>`<option value="${s}">${s}</option>`).join('');
          seasonSelect.append('<option value="">Select season</option>'+opts);
        });
      }
    });
  });
})();
