(function(){
    const body = document.body;
    if(!body) return;

    const viewerId = body.dataset.viewerId || '';
    const coordinationBlocks = document.querySelectorAll('.waitlist-coordination');
    if(!coordinationBlocks.length) return;

    const pollers = new Map();
    let cachedInviteSuggestions = null;

    const responseLabels = {
        yes: 'Going',
        no: 'Not going',
        maybe: 'Maybe',
        null: 'Awaiting response',
        undefined: 'Awaiting response'
    };

    const classForResponse = (response) => {
        switch(response){
            case 'yes':
                return 'invited-tile invited-tile--yes';
            case 'no':
                return 'invited-tile invited-tile--no';
            case 'maybe':
                return 'invited-tile invited-tile--maybe';
            default:
                return 'invited-tile invited-tile--pending';
        }
    };

    function renderInvitedUsers(container, invitedUsers){
        const list = container.querySelector('.invited-users');
        const emptyState = container.querySelector('.empty-invites');
        if(!list) return;
        list.innerHTML = '';
        if(!invitedUsers || !invitedUsers.length){
            if(emptyState) emptyState.classList.remove('d-none');
            return;
        }
        if(emptyState) emptyState.classList.add('d-none');
        invitedUsers.forEach(user => {
            const tile = document.createElement('div');
            tile.className = classForResponse(user.response);
            tile.innerHTML = `
                <div class="invited-avatar">
                    <img src="${user.profileImageUrl}" alt="${user.username || 'User'}">
                </div>
                <div class="invited-meta">
                    <span class="invited-name">${user.username || 'User'}</span>
                    <span class="invited-status">${responseLabels[user.response || 'undefined']}</span>
                </div>
            `;
            list.appendChild(tile);
        });
    }

    function updateResponseControls(container, data){
        const controls = container.querySelector('.response-controls');
        if(!controls) return;
        const ownerId = container.dataset.ownerId;
        if(!data.canRespond || !viewerId || String(ownerId) === String(viewerId)){
            controls.classList.add('d-none');
            return;
        }
        controls.classList.remove('d-none');
        const current = data.currentUserResponse || '';
        controls.querySelectorAll('.response-btn').forEach(btn => {
            const btnResp = btn.dataset.response;
            if(btnResp === current){
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        if(!controls.dataset.bound){
            controls.addEventListener('click', async (event) => {
                const target = event.target.closest('.response-btn');
                if(!target) return;
                const desired = target.dataset.response;
                if(!desired) return;
                if(target.classList.contains('disabled')) return;
                try{
                    target.classList.add('disabled');
                    await submitResponse(container, desired);
                } catch (err){
                    console.error(err);
                    alert('Unable to update your response right now.');
                } finally {
                    target.classList.remove('disabled');
                }
            });
            controls.dataset.bound = 'true';
        }
    }

    async function submitResponse(container, response){
        const gameId = container.dataset.gameId;
        const ownerId = container.dataset.ownerId;
        const res = await fetch(`/games/${gameId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response, ownerId })
        });
        if(!res.ok){
            throw new Error('Failed to update response');
        }
        await loadCoordination(container);
    }

    function stopPolling(key){
        const interval = pollers.get(key);
        if(interval){
            clearInterval(interval);
            pollers.delete(key);
        }
    }

    function renderChatMessages(container, messages){
        const stream = container.querySelector('.chat-message-stream');
        const empty = container.querySelector('.chat-empty');
        if(!stream) return;
        stream.innerHTML = '';
        if(!messages || !messages.length){
            if(empty) empty.classList.remove('d-none');
            return;
        }
        if(empty) empty.classList.add('d-none');
        messages.forEach(msg => {
            const bubble = document.createElement('div');
            const senderId = msg.sender && msg.sender._id ? String(msg.sender._id) : '';
            const isOwn = viewerId && senderId === String(viewerId);
            bubble.className = `chat-bubble${isOwn ? ' chat-bubble--own' : ''}`;
            const senderName = msg.sender && msg.sender.username ? msg.sender.username : 'User';
            const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
            const formatted = timestamp.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
            bubble.innerHTML = `
                <div class="chat-bubble-header d-flex justify-content-between">
                    <span class="chat-bubble-name">${senderName}</span>
                    <span class="chat-bubble-time">${formatted}</span>
                </div>
                <div class="chat-bubble-body">${escapeHtml(msg.message || '')}</div>
            `;
            stream.appendChild(bubble);
        });
        stream.scrollTop = stream.scrollHeight;
    }

    function escapeHtml(text){
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function fetchChatMessages(container){
        const state = container.__coordinationState;
        if(!state || !state.chatEnabled) return;
        const gameId = container.dataset.gameId;
        const ownerId = container.dataset.ownerId;
        try{
            const res = await fetch(`/games/${gameId}/chat?owner=${ownerId}`);
            if(!res.ok) return;
            const data = await res.json();
            renderChatMessages(container, data.messages || []);
        } catch (err){
            console.error('Failed to fetch chat messages', err);
        }
    }

    function setupChat(container, data){
        const wrapper = container.querySelector('.chat-wrapper');
        if(!wrapper) return;
        const chatKey = `${container.dataset.gameId}-${container.dataset.ownerId}`;
        if(!data.chatEnabled){
            wrapper.classList.add('d-none');
            stopPolling(chatKey);
            return;
        }
        wrapper.classList.remove('d-none');

        const collapse = wrapper.querySelector('.chat-section');
        if(collapse && !collapse.dataset.bound){
            collapse.addEventListener('show.bs.collapse', () => {
                fetchChatMessages(container);
                if(!pollers.has(chatKey)){
                    const interval = setInterval(() => fetchChatMessages(container), 7000);
                    pollers.set(chatKey, interval);
                }
            });
            collapse.addEventListener('hide.bs.collapse', () => {
                stopPolling(chatKey);
            });
            collapse.dataset.bound = 'true';
        }

        const form = wrapper.querySelector('.chat-form');
        const input = wrapper.querySelector('.chat-input');
        const sendBtn = wrapper.querySelector('.chat-send');
        const canSend = !!data.canSendChat;
        if(form){
            form.classList.toggle('d-none', !canSend);
            form.dataset.enabled = canSend ? 'true' : 'false';
            if(!form.dataset.bound){
                form.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    if(form.dataset.enabled !== 'true') return;
                    const value = input.value.trim();
                    if(!value) return;
                    try{
                        if(sendBtn) sendBtn.disabled = true;
                        await sendChatMessage(container, value);
                        input.value = '';
                        fetchChatMessages(container);
                    } catch (err){
                        console.error(err);
                        alert('Unable to send message right now.');
                    } finally {
                        if(sendBtn) sendBtn.disabled = false;
                    }
                });
                form.dataset.bound = 'true';
            }
        }
        if(input){
            input.disabled = !canSend;
            input.placeholder = canSend ? 'Share your plan...' : 'Waiting for invite confirmation...';
        }
        if(sendBtn){
            sendBtn.disabled = !canSend;
        }
    }

    async function sendChatMessage(container, message){
        const gameId = container.dataset.gameId;
        const ownerId = container.dataset.ownerId;
        const res = await fetch(`/games/${gameId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerId, message })
        });
        if(!res.ok){
            throw new Error('Failed to send message');
        }
    }

    async function setupInviteSelect(container){
        const select = container.querySelector('.invite-select');
        if(!select || typeof $ === 'undefined' || !$.fn.select2) return;
        const gameId = container.dataset.gameId;
        const ownerId = container.dataset.ownerId;

        if(!Array.isArray(cachedInviteSuggestions)){
            try {
                const suggestionResponse = await fetch('/users/search');
                if(suggestionResponse.ok){
                    cachedInviteSuggestions = await suggestionResponse.json();
                } else {
                    cachedInviteSuggestions = [];
                }
            } catch (err){
                console.error('Failed to preload invite suggestions', err);
                cachedInviteSuggestions = [];
            }
        }

        if(Array.isArray(cachedInviteSuggestions) && cachedInviteSuggestions.length && !select.options.length){
            cachedInviteSuggestions.forEach(user => {
                const option = document.createElement('option');
                option.value = user._id;
                option.textContent = user.username;
                option.dataset.profileImageUrl = user.profileImageUrl || `/users/${user._id}/profile-image`;
                option.dataset.isFollowing = user.isFollowing ? 'true' : 'false';
                select.appendChild(option);
            });
        }

        const extractMeta = (data) => {
            const element = data.element || null;
            return {
                username: data.text || data.username || (element ? element.textContent : ''),
                profileImageUrl: data.profileImageUrl || (element && element.dataset.profileImageUrl) || '/images/placeholder.jpg',
                isFollowing: typeof data.isFollowing === 'boolean' ? data.isFollowing : (element ? element.dataset.isFollowing === 'true' : false)
            };
        };

        const renderOption = (data) => {
            if(data.loading){
                return data.text;
            }
            const meta = extractMeta(data);
            const wrapper = document.createElement('div');
            wrapper.className = 'invite-option';
            const avatar = document.createElement('span');
            avatar.className = 'invite-option-avatar';
            const img = document.createElement('img');
            img.src = meta.profileImageUrl;
            img.alt = meta.username || 'User';
            avatar.appendChild(img);
            const name = document.createElement('span');
            name.className = 'invite-option-name';
            name.textContent = meta.username || 'User';
            wrapper.appendChild(avatar);
            wrapper.appendChild(name);
            if(meta.isFollowing){
                const badge = document.createElement('span');
                badge.className = 'invite-option-follow';
                badge.textContent = 'Following';
                wrapper.appendChild(badge);
            }
            return $(wrapper);
        };

        const renderSelection = (data) => data.text || data.username || '';

        $(select).select2({
            placeholder: select.dataset.placeholder || 'Invite by username',
            dropdownParent: $(select).closest('.invite-area'),
            width: '100%',
            minimumInputLength: 0,
            ajax: {
                url: '/users/search',
                dataType: 'json',
                delay: 200,
                data: params => ({ q: params.term || '' }),
                processResults: data => ({
                    results: data.map(user => ({
                        id: user._id,
                        text: user.username,
                        profileImageUrl: user.profileImageUrl,
                        isFollowing: !!user.isFollowing
                    }))
                })
            },
            templateResult: renderOption,
            templateSelection: renderSelection,
            escapeMarkup: markup => markup
        });

        $(select).on('select2:select', async (event) => {
            const userId = event.params.data.id;
            try {
                $(select).prop('disabled', true);
                const res = await fetch(`/games/${gameId}/invite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ownerId, userId })
                });
                if(res.ok){
                    await loadCoordination(container);
                } else if(res.status === 409){
                    alert('That user has already been invited.');
                } else {
                    alert('Unable to invite that user right now.');
                }
            } catch (err){
                console.error(err);
                alert('Unable to invite that user right now.');
            } finally {
                $(select).val(null).trigger('change');
                $(select).prop('disabled', false);
            }
        });

        $(select).on('select2:open', () => {
            const searchField = document.querySelector('.select2-container--open .select2-search__field');
            if(searchField){
                searchField.placeholder = 'Search by username';
            }
        });
    }

    async function loadCoordination(container){
        const gameId = container.dataset.gameId;
        const ownerId = container.dataset.ownerId;
        try{
            const res = await fetch(`/games/${gameId}/coordination?owner=${ownerId}`);
            if(!res.ok){
                throw new Error('Failed to fetch coordination data');
            }
            const data = await res.json();
            container.__coordinationState = data;
            renderInvitedUsers(container, data.invitedUsers || []);
            updateResponseControls(container, data);
            setupChat(container, data);
        } catch (err){
            console.error(err);
        }
    }

    coordinationBlocks.forEach(container => {
        container.dataset.gameId = container.dataset.gameId || container.closest('[data-game-id]')?.dataset.gameId || '';
        setupInviteSelect(container);
        loadCoordination(container);
    });
})();
