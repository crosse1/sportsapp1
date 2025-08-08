function getBadgeStyleClass(badgeID) {
  if (badgeID >= 231 && badgeID <= 364) return 'special-badge-container';
  if (badgeID >= 365 && badgeID <= 594) return 'gold-badge-container';
  if (badgeID >= 595 && badgeID <= 730) return 'bronze-badge-container';
  return '';
}

module.exports = { getBadgeStyleClass };
