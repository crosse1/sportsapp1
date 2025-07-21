// Handles loading and displaying the messaging modal
(function(){
  const modalEl = document.getElementById('messagesModal');
  if(!modalEl) return;
  const bsModal = new bootstrap.Modal(modalEl);

  async function loadModal(threadId){
    try{
      const res = await fetch(`/messages/modal${threadId?`?thread=${threadId}`:''}`);
      const html = await res.text();
      modalEl.querySelector('.modal-content').innerHTML = html;
      bsModal.show();
      const msgContainer = modalEl.querySelector('#msgContainer');
      if(msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
    }catch(err){
      console.error(err);
    }
  }

  document.querySelectorAll('a[href="/messages"]').forEach(link=>{
    link.addEventListener('click', function(e){
      e.preventDefault();
      loadModal();
    });
  });

  document.addEventListener('click', async function(e){
    const btn = e.target.closest('.message-btn');
    if(btn){
      e.preventDefault();
      const userId = btn.dataset.user;
      try{
        const res = await fetch(`/messages/start/${userId}`, {method:'POST', headers:{'Accept':'application/json'}});
        if(!res.ok){
          const data = await res.json().catch(()=>({}));
          alert(data.error || 'You can only message users who follow you back.');
          return;
        }
        const data = await res.json();
        loadModal(data.threadId);
      }catch(err){
        console.error(err);
      }
    }
  });

  modalEl.addEventListener('click', function(e){
    const link = e.target.closest('.thread-link');
    if(link){
      e.preventDefault();
      const id = link.dataset.thread;
      loadModal(id);
    }
  });

  modalEl.addEventListener('submit', async function(e){
    if(e.target.id === 'messageForm'){
      e.preventDefault();
      const threadId = e.target.dataset.thread;
      const input = modalEl.querySelector('#messageInput');
      const content = input.value.trim();
      if(!content) return;
      try{
        const res = await fetch(`/messages/${threadId}/send`, {
          method:'POST',
          headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
          body: new URLSearchParams({content})
        });
        if(!res.ok){
          const data = await res.json().catch(()=>({}));
          alert(data.error || 'You can only message users who follow you back.');
          return;
        }
        input.value = '';
        loadModal(threadId);
      }catch(err){console.error(err);}
    }
  });
})();
