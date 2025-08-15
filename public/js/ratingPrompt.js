window.addEventListener('DOMContentLoaded', () => {
  const entries = window.unratedGameEntries || [];
  if (!entries.length) return;

  let shown = [];
  try {
    shown = JSON.parse(localStorage.getItem('shownRatingPrompts') || '[]');
  } catch (e) {
    shown = [];
  }

  const entry = entries.find(e => !shown.includes(e._id));
  if (!entry) return;

  const proceed = window.confirm('Are you ready to rate this game?');
  if (proceed) {
    window.location.href = `/addGame/${entry._id}`;
  } else {
    shown.push(entry._id);
    localStorage.setItem('shownRatingPrompts', JSON.stringify(shown));
  }
});
