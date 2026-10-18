/** Is the Settings form holding unsaved edits? (set by SettingsPage, read by the "Lock Settings" button) */
let dirty = false;
export const setSettingsDirty = (value) => {
  dirty = Boolean(value);
};
export const isSettingsDirty = () => dirty;
