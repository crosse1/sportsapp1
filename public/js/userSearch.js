// Handles user search autocomplete in profile header modal

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('searchInput');
  const dropdown = document.getElementById('searchDropdown');
  const spinner = document.getElementById('loadingSpinner');

  if (!input || !dropdown) return;

  const hideDropdown = () => {
    dropdown.classList.add('d-none');
    dropdown.innerHTML = '';
  };

  input.addEventListener('input', async () => {
    const q = input.value.trim();
    if (!q) {
      hideDropdown();
      return;
    }
    spinner && spinner.classList.remove('d-none');
    try {
      const res = await fetch('/users/search?q=' + encodeURIComponent(q));
      if (!res.ok) {
        hideDropdown();
        return;
      }
      const users = await res.json();
      if (!Array.isArray(users) || !users.length) {
        hideDropdown();
        return;
      }
      dropdown.innerHTML = users.map(u => `

        <div class="suggestion-item d-flex align-items-center gap-2" data-id="${u._id}" data-following="${u.isFollowing}">
          <img src="/users/${u._id}/profile-image" class="avatar avatar-sm" alt="${u.username}">
          <span class="flex-grow-1">@${u.username}</span>
          <button class="btn btn-sm glassy-btn follow-btn">${u.isFollowing ? 'Unfollow' : 'Follow'}</button>

        </div>
      `).join('');
      dropdown.classList.remove('d-none');
    } catch (err) {
      hideDropdown();
    } finally {
      spinner && spinner.classList.add('d-none');
    }
  });

  dropdown.addEventListener('click', async (e) => {

    const btn = e.target.closest('.follow-btn');
    if (!btn) return;
    const item = btn.closest('.suggestion-item');
    if (!item) return;
    const userId = item.dataset.id;

    const following = item.dataset.following === 'true';
    const endpoint = following ? `/users/${userId}/unfollow` : `/users/${userId}/follow`;
    btn.disabled = true;
    try {
      const res = await fetch(endpoint, { method: 'POST' });

      if (res.ok) {
        item.remove();
        if (!dropdown.children.length) {
          hideDropdown();
        }

      } else {
        btn.disabled = false;
      }
    } catch (err) {
      console.error(err);
      btn.disabled = false;

    }
  });

  input.addEventListener('focus', () => {
    if (input.value.trim() && dropdown.innerHTML.trim()) {
      dropdown.classList.remove('d-none');
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(hideDropdown, 200); // allow click
  });
});

