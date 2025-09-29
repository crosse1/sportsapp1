(function(){
    const body = document.body;
    if(!body) return;

    const viewerId = body.dataset.viewerId || '';
    const coordinationBlocks = document.querySelectorAll('.waitlist-coordination');
    if(!coordinationBlocks.length) return;

    const pollers = new Map();

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

    function setupInviteSearch(container){
        const wrapper = container.querySelector('.invite-search-wrapper');
        if(!wrapper || wrapper.dataset.bound === 'true') return;
        wrapper.dataset.bound = 'true';

        const input = wrapper.querySelector('.invite-search-input');
        const dropdown = wrapper.querySelector('.invite-search-dropdown');
        const spinner = wrapper.querySelector('.invite-loading');
        if(!input || !dropdown) return;

        const gameId = container.dataset.gameId;
        const ownerId = container.dataset.ownerId;

        let results = [];
        let activeIndex = -1;
        let searchTimer = null;
        let searchController = null;
        let loadingCount = 0;

        const pushLoading = () => {
            loadingCount += 1;
            if(spinner){
                spinner.classList.remove('d-none');
            }
        };

        const popLoading = () => {
            loadingCount = Math.max(0, loadingCount - 1);
            if(spinner && loadingCount === 0){
                spinner.classList.add('d-none');
            }
        };

        const hideDropdown = () => {
            dropdown.classList.add('d-none');
            dropdown.innerHTML = '';
            activeIndex = -1;
            results = [];
        };

        const renderResults = (users) => {
            dropdown.innerHTML = '';
            if(!users.length){
                hideDropdown();
                return;
            }
            const fragment = document.createDocumentFragment();
            users.forEach((user, index) => {
                const item = document.createElement('div');
                item.className = 'invite-suggestion';
                item.dataset.index = String(index);
                item.dataset.userId = user.id;

                const avatar = document.createElement('img');
                avatar.className = 'invite-suggestion-avatar';
                avatar.src = user.profileImageUrl;
                avatar.alt = user.username ? `@${user.username}` : 'User avatar';
                avatar.loading = 'lazy';

                const text = document.createElement('div');
                text.className = 'invite-suggestion-text';

                const handle = document.createElement('span');
                handle.className = 'invite-suggestion-handle';
                handle.textContent = user.username ? `@${user.username}` : (user.displayName || 'User');
                text.appendChild(handle);

                if(user.displayName && user.displayName !== user.username){
                    const name = document.createElement('span');
                    name.className = 'invite-suggestion-name';
                    name.textContent = user.displayName;
                    text.appendChild(name);
                }

                item.appendChild(avatar);
                item.appendChild(text);
                fragment.appendChild(item);
            });
            dropdown.appendChild(fragment);
            dropdown.classList.remove('d-none');
            activeIndex = -1;
        };

        const highlightIndex = (index) => {
            const items = dropdown.querySelectorAll('.invite-suggestion');
            items.forEach((item, idx) => {
                if(idx === index){
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                }
            });
            activeIndex = index;
        };

        const cancelPendingSearch = () => {
            if(searchTimer){
                clearTimeout(searchTimer);
                searchTimer = null;
            }
            if(searchController){
                searchController.abort();
                searchController = null;
            }
        };

        const performSearch = async (query) => {
            if(searchController){
                searchController.abort();
            }
            const controller = new AbortController();
            searchController = controller;
            pushLoading();
            try {
                const res = await fetch(`/users/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
                if(!res.ok){
                    hideDropdown();
                    return;
                }
                const data = await res.json();
                const users = Array.isArray(data) ? data : [];
                results = users.map(user => ({
                    id: user && user._id ? user._id : '',
                    username: user && user.username ? user.username : '',
                    displayName: user && user.displayName ? user.displayName : '',
                    profileImageUrl: user && user._id ? `/users/${user._id}/profile-image` : '/images/placeholder.jpg'
                })).filter(user => user.id);
                if(!results.length){
                    hideDropdown();
                    return;
                }
                dropdown.innerHTML = '';
                renderResults(results);
            } catch (err){
                if(err.name !== 'AbortError'){
                    console.error('Failed to search users for invite', err);
                    hideDropdown();
                }
            } finally {
                if(searchController === controller){
                    searchController = null;
                }
                popLoading();
            }
        };


        const inviteUser = async (user) => {
            if(!user || !user.id) return;
            cancelPendingSearch();
            hideDropdown();
            const previousValue = input.value;
            input.value = '';
            input.disabled = true;
            pushLoading();
            let restoreQuery = false;
            try {
                const res = await fetch(`/games/${gameId}/invite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ownerId, userId: user.id })
                });
                if(res.ok){
                    await loadCoordination(container);
                } else if(res.status === 409){
                    alert('That user has already been invited.');
                    input.value = previousValue;
                    restoreQuery = true;
                } else {
                    alert('Unable to invite that user right now.');
                    input.value = previousValue;
                    restoreQuery = true;
                }
            } catch (err){
                console.error('Failed to invite user', err);
                alert('Unable to invite that user right now.');
                input.value = previousValue;
                restoreQuery = true;
            } finally {
                input.disabled = false;
                input.focus();
                popLoading();
                if(restoreQuery){
                    input.dispatchEvent(new Event('input'));
                }
            }
        };

        input.addEventListener('input', () => {
            if(input.disabled) return;
            const query = input.value.trim();
            if(searchTimer){
                clearTimeout(searchTimer);
                searchTimer = null;
            }
            if(!query){
                cancelPendingSearch();
                hideDropdown();
                return;
            }
            searchTimer = setTimeout(() => {
                performSearch(query);
                searchTimer = null;
            }, 180);
        });

        input.addEventListener('keydown', (event) => {
            if(dropdown.classList.contains('d-none')) return;
            if(event.key === 'ArrowDown'){
                event.preventDefault();
                if(!results.length) return;
                const next = activeIndex + 1 >= results.length ? 0 : activeIndex + 1;
                highlightIndex(next);
            } else if(event.key === 'ArrowUp'){
                event.preventDefault();
                if(!results.length) return;
                const prev = activeIndex <= 0 ? results.length - 1 : activeIndex - 1;
                highlightIndex(prev);
            } else if(event.key === 'Enter'){
                if(activeIndex >= 0 && activeIndex < results.length){
                    event.preventDefault();
                    inviteUser(results[activeIndex]);
                }
            } else if(event.key === 'Escape'){
                hideDropdown();
            }
        });

        input.addEventListener('focus', () => {
            if(results.length){
                dropdown.classList.remove('d-none');
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(() => hideDropdown(), 120);
        });

        dropdown.addEventListener('mousedown', (event) => {
            const item = event.target.closest('.invite-suggestion');
            if(!item) return;
            event.preventDefault();
            const index = Number(item.dataset.index);
            if(Number.isNaN(index)) return;
            inviteUser(results[index]);
        });

        dropdown.addEventListener('mouseover', (event) => {
            const item = event.target.closest('.invite-suggestion');
            if(!item) return;
            const index = Number(item.dataset.index);
            if(Number.isNaN(index)) return;
            highlightIndex(index);
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
        setupInviteSearch(container);
        loadCoordination(container);
    });
})();
