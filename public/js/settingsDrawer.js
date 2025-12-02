(function () {
  const gearButton = document.getElementById('settingsButton');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const settingsOverlay = document.getElementById('settingsDrawerOverlay');
  const closeButton = document.getElementById('settingsDrawerClose');
  const notifyToggle = document.getElementById('notifyWaitlistToggle');
  const passwordForm = document.getElementById('passwordChangeForm');
  const togglePasswordFormButton = document.getElementById('togglePasswordForm');
  const statusBanner = document.getElementById('settingsStatus');

  if (!gearButton || !settingsDrawer || !settingsOverlay) return;

  const hideStatus = () => {
    if (!statusBanner) return;
    statusBanner.classList.add('d-none');
    statusBanner.classList.remove('show', 'alert-success', 'alert-danger');
    statusBanner.textContent = '';
  };

  const showStatus = (message, type = 'success') => {
    if (!statusBanner) return;
    statusBanner.classList.remove('d-none', 'alert-success', 'alert-danger');
    statusBanner.classList.add(`alert-${type}`);
    statusBanner.textContent = message;
    statusBanner.classList.add('show');
    setTimeout(hideStatus, 3500);
  };

  const openDrawer = () => {
    settingsOverlay.classList.add('active');
    settingsDrawer.classList.add('open');
  };

  const closeDrawer = () => {
    settingsOverlay.classList.remove('active');
    settingsDrawer.classList.remove('open');
    hideStatus();
  };

  gearButton.addEventListener('click', openDrawer);
  settingsOverlay.addEventListener('click', closeDrawer);
  if (closeButton) {
    closeButton.addEventListener('click', closeDrawer);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && settingsDrawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  if (notifyToggle) {
    const initial = notifyToggle.dataset.initial === 'true';
    notifyToggle.checked = initial;

    notifyToggle.addEventListener('change', async () => {
      const desiredState = notifyToggle.checked;
      try {
        const response = await fetch('/settings/notify-waitlist', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ notifyWaitlist: desiredState })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          notifyToggle.checked = !desiredState;
          showStatus(payload.error || 'Unable to update notifications.', 'danger');
          return;
        }

        showStatus(desiredState ? 'Notifications enabled.' : 'Notifications disabled.', 'success');
      } catch (err) {
        notifyToggle.checked = !desiredState;
        showStatus('Connection problem updating settings.', 'danger');
      }
    });
  }

  if (togglePasswordFormButton && passwordForm) {
    togglePasswordFormButton.addEventListener('click', () => {
      passwordForm.classList.toggle('d-none');
    });

    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideStatus();
      const formData = new FormData(passwordForm);
      const payload = {
        oldPassword: formData.get('oldPassword'),
        newPassword: formData.get('newPassword'),
        confirmPassword: formData.get('confirmPassword')
      };

      try {
        const response = await fetch('/settings/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          showStatus(data.error || 'Unable to change password.', 'danger');
          return;
        }

        showStatus('Password updated successfully.', 'success');
        passwordForm.reset();
        passwordForm.classList.add('d-none');
      } catch (err) {
        showStatus('Connection problem updating password.', 'danger');
      }
    });
  }
})();
