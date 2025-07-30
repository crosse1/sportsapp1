(function(){
  window.addEventListener('load', function(){
    const modalEl = document.getElementById('editGameModal');
    if(!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);
    const form = document.getElementById('editGameForm');
    const ratingRange = document.getElementById('editRatingRange');
    const ratingValue = document.getElementById('editRatingValue');
    const commentInput = document.getElementById('editCommentInput');
    const commentCounter = document.getElementById('editCommentCounter');
    const entryIdInput = document.getElementById('editEntryId');

    function updateRating(){
      if(ratingValue) ratingValue.textContent = ratingRange.value;
    }
    if(ratingRange){
      ratingRange.addEventListener('input', updateRating);
    }
    if(commentInput){
      commentInput.addEventListener('input', () => {
        commentCounter.textContent = `${commentInput.value.length}/100`;
      });
    }

    window.openEditEntryModal = function(id){
      const data = (window.gameEntriesData || []).find(e => e._id === id);
      if(!data) return;
      entryIdInput.value = id;
      if(ratingRange){
        const r = data.elo ? ((data.elo - 1000) / 1000) * 9 + 1 : 5;
        ratingRange.value = r;
        updateRating();
      }
      if(commentInput){ commentInput.value = data.comment || ''; commentCounter.textContent = `${(data.comment||'').length}/100`; }
      modal.show();
    };

    form.addEventListener('submit', async function(e){
      e.preventDefault();
      const id = entryIdInput.value;
      const formData = new FormData(form);
      try{
        const res = await fetch(`/gameEntry/${id}`, { method:'PUT', body: formData });
        if(!res.ok) throw new Error('Failed');
        const json = await res.json();
        if(json && json.entry){
          const wrapper = document.querySelector(`.rating-wrapper[data-entry-id="${id}"]`);
          if(wrapper){
            const r = json.entry.elo ? ((json.entry.elo - 1000) / 1000) * 9 + 1 : 5;
            wrapper.querySelector('.rating-number').textContent = `${r.toFixed(1)}/10`;
            const commentEl = wrapper.querySelector('.rating-comment');
            if(commentEl){ commentEl.textContent = json.entry.comment || ''; }
          }
          const idx = (window.gameEntriesData || []).findIndex(e => e._id === id);
          if(idx > -1){ window.gameEntriesData[idx] = json.entry; }
        }
        modal.hide();
      }catch(err){
        alert('Update failed');
      }
    });

    document.querySelectorAll('.edit-entry-icon').forEach(icon => {
      icon.addEventListener('click', () => {
        const id = icon.getAttribute('data-entry-id');
        window.openEditEntryModal(id);
      });
    });

    document.querySelectorAll('.delete-entry-icon').forEach(icon => {
      icon.addEventListener('click', async () => {
        const id = icon.getAttribute('data-entry-id');
        if(!confirm('Delete this entry?')) return;
        try {
          const res = await fetch(`/gameEntry/${id}`, { method: 'DELETE' });
          if(!res.ok) throw new Error('Failed');
          const col = icon.closest('.col');
          if(col) col.remove();
          const idx = (window.gameEntriesData || []).findIndex(e => e._id === id);
          if(idx > -1){ window.gameEntriesData.splice(idx,1); }
        } catch(err){
          alert('Delete failed');
        }
      });
    });
  });
})();
