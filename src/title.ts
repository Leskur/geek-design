export const productLabel = `GeekDesign ${__APP_VERSION__}`;

export function setPageTitle(name?: string) {
  document.title = name ? `${name} - GeekDesign` : 'GeekDesign';
}

export function displayName(filename: string) {
  return filename.replace(/\.sketch$/i, '') || filename;
}
