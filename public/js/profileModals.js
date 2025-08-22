document.addEventListener('DOMContentLoaded', function () {
  const addGameBtn = document.getElementById('addGameBtn');
  if (addGameBtn) {
    addGameBtn.addEventListener('click', function () {
      const modalEl = document.getElementById('addGameModal');
      if (modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
  }

  const openUserModalBtn = document.getElementById('openUserModal');
  if (openUserModalBtn) {
    openUserModalBtn.addEventListener('click', function () {
      const modalEl = document.getElementById('userSearchModal');
      if (modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
  }

  const userSearchModal = document.getElementById('userSearchModal');
  if (userSearchModal) {
    userSearchModal.addEventListener('hidden.bs.modal', function () {
      const searchInput = document.getElementById('searchInput');
      const resultsEl = document.getElementById('searchResults');
      if (searchInput) {
        searchInput.value = '';
      }
      if (resultsEl) {
        resultsEl.innerHTML = '';
      }
    });
  }
});
