export function filterStageBIntrinsicAutoWidthKeys(keys, settings = {}) {
  const sourceKeys = Array.isArray(keys) ? keys : [];
  const sourceSettings = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings
    : {};
  return sourceKeys.filter((key) => {
    const rawKey = String(key || '');
    const baseKey = rawKey.split(':')[0];
    const value = typeof sourceSettings[rawKey] === 'string'
      ? sourceSettings[rawKey].trim().toLowerCase()
      : '';
    return !(baseKey === '_width' && value === 'auto');
  });
}
