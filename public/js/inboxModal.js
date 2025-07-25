(function(){
  window.addEventListener('load', function(){
    const modalEl = document.getElementById('inboxModal');
    const trigger = document.getElementById('navInbox');
    if(!modalEl || !trigger || !window.bootstrap) return;
    const bsModal = new bootstrap.Modal(modalEl);
  let messagesSeen = !trigger.dataset.unread;
  let followersSeen = !trigger.dataset.newFollowers;

    function updateBadge(){
      if(messagesSeen){
        const tabDot = document.getElementById('messages-tab-dot');
        if(tabDot) tabDot.remove();
      }
      if(followersSeen){
        const tabDot = document.getElementById('followers-tab-dot');
        if(tabDot) tabDot.remove();
      }
      if(messagesSeen && followersSeen){
        const dot = trigger.querySelector('.inbox-dot');
        if(dot) dot.remove();
      }
    }

    function markActiveTab(){
      const active = modalEl.querySelector('.nav-link.active');
      if(!active) return;
      if(active.id === 'followers-tab' && !followersSeen){
        followersSeen = true;
        fetch('/users/clear-new-followers',{method:'POST'}).catch(()=>{});
      }
      if(active.id === 'messages-tab' && !messagesSeen){
        messagesSeen = true;
      }
      updateBadge();
    }

    async function loadModal(threadId){
      try{
        const res = await fetch(`/inbox/modal${threadId?`?thread=${threadId}`:''}`);
        const html = await res.text();
        modalEl.querySelector('.modal-content').innerHTML = html;
        bsModal.show();
        markActiveTab();
        const msgContainer = modalEl.querySelector('#msgContainer');
        if(msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
      }catch(err){console.error(err);}
    }

    trigger.addEventListener('click', function(e){
      e.preventDefault();
      loadModal();
    });

    modalEl.addEventListener('shown.bs.tab', function(){
      markActiveTab();
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
  });
})();
