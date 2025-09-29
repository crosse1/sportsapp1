(function () {
  const modalId = 'gameInviteModal';
  let invitesQueue = [];
  let activeInvite = null;
  let selectedResponse = null;
  let modalInstance = null;
  let modalEl = null;
  let optionButtons = [];
  let submitButton = null;
  let feedbackEl = null;
  let titleEl = null;
  let teamBlocks = [];
  let datetimeEl = null;
  let venueEl = null;

  function initElements() {
    if (modalEl) return true;
    modalEl = document.getElementById(modalId);
    if (!modalEl) return false;
    modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    optionButtons = Array.from(modalEl.querySelectorAll('.invite-option'));
    submitButton = modalEl.querySelector('.invite-submit-btn');
    feedbackEl = modalEl.querySelector('.invite-feedback');
    titleEl = modalEl.querySelector('.invite-modal-title');
    teamBlocks = Array.from(modalEl.querySelectorAll('.invite-team'));
    datetimeEl = modalEl.querySelector('.invite-game-datetime');
    venueEl = modalEl.querySelector('.invite-game-venue');

    optionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleResponseSelection(button.dataset.response || null);
      });
    });

    if (submitButton) {
      submitButton.addEventListener('click', handleSubmit);
    }

    modalEl.addEventListener('hidden.bs.modal', () => {
      const advance = modalEl.dataset.advanceQueue === 'true';
      modalEl.dataset.advanceQueue = '';
      activeInvite = null;
      selectedResponse = null;
      clearSelection();
      feedback('');
      if (advance) {
        setTimeout(() => {
          if (invitesQueue.length) {
            showNextInvite();
          }
        }, 180);
      }
    });

    return true;
  }

  function feedback(message, isError = false) {
    if (!feedbackEl) return;
    if (!message) {
      feedbackEl.classList.add('d-none');
      feedbackEl.textContent = '';
      return;
    }
    feedbackEl.textContent = message;
    feedbackEl.classList.toggle('text-danger', isError);
    feedbackEl.classList.toggle('text-success', !isError);
    feedbackEl.classList.remove('d-none');
  }

  function clearSelection() {
    optionButtons.forEach((btn) => btn.classList.remove('active'));
    selectedResponse = null;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.remove('enabled');
    }
  }

  function handleResponseSelection(response) {
    if (!response) return;
    selectedResponse = response;
    optionButtons.forEach((btn) => {
      const isActive = btn.dataset.response === response;
      btn.classList.toggle('active', isActive);
    });
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.classList.add('enabled');
    }
  }

  function formatDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  }

  function updateGameDetails(invite) {
    if (!modalEl) return;
    if (titleEl) {
      const name = invite.ownerDisplayName || invite.ownerName || 'A friend';
      titleEl.textContent = `${name} has invited you to a game group`;
    }
    if (teamBlocks.length >= 2) {
      const teams = [invite.game?.awayTeam, invite.game?.homeTeam];
      teamBlocks.forEach((block, index) => {
        const team = teams[index] || {};
        const logoEl = block.querySelector('img');
        const nameEl = block.querySelector('.invite-team-name');
        if (logoEl) {
          logoEl.src = team.logo || '/images/placeholder.jpg';
          logoEl.alt = `${team.name || 'Team'} logo`;
        }
        if (nameEl) {
          nameEl.textContent = team.name || '';
          nameEl.title = team.name || '';
        }
      });
    }
    if (datetimeEl) {
      datetimeEl.textContent = formatDateTime(invite.game?.startDate);
    }
    if (venueEl) {
      venueEl.textContent = invite.game?.venue || '';
    }
    clearSelection();
  }

  async function handleSubmit() {
    if (!activeInvite || !selectedResponse || !submitButton) return;
    submitButton.disabled = true;
    submitButton.classList.remove('enabled');
    feedback('');

    try {
      const res = await fetch(`/games/${activeInvite.gameId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          response: selectedResponse,
          ownerId: activeInvite.ownerId
        })
      });

      if (!res.ok) {
        throw new Error('Failed to save response');
      }

      feedback('Response saved!', false);
      if (modalEl) {
        modalEl.dataset.advanceQueue = 'true';
      }
      setTimeout(() => modalInstance.hide(), 450);
    } catch (err) {
      console.error('Failed to submit invite response', err);
      feedback('We could not save your response. Please try again.', true);
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.add('enabled');
      }
    }
  }

  function showNextInvite() {
    if (!invitesQueue.length) {
      return;
    }
    const nextInvite = invitesQueue.shift();
    activeInvite = nextInvite;
    updateGameDetails(nextInvite);
    modalInstance.show();
  }

  async function fetchQueuedInvites() {
    try {
      const res = await fetch('/users/invites/queued', {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.invites) ? data.invites : [];
    } catch (err) {
      console.error('Failed to fetch queued invites', err);
      return [];
    }
  }

  async function init() {
    if (!window.hasQueuedGameInvites) return;
    if (!initElements()) return;
    const invites = await fetchQueuedInvites();
    if (!invites.length) return;
    invitesQueue = invites;
    showNextInvite();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
