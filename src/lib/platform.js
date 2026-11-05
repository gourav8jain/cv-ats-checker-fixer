import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // 'web' | 'ios' | 'android'

export async function openExternal(url) {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
  } else {
    window.location.href = url;
  }
}

export async function closeExternal() {
  if (!isNative()) return;
  try { const { Browser } = await import('@capacitor/browser'); await Browser.close(); } catch { /* not open */ }
}

export async function saveFile(blob, filename) {
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const data = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  const saved = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  await Share.share({ title: filename, url: saved.uri, dialogTitle: 'Save or share your resume' });
}

export async function onDeepLink(handler) {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  App.addListener('appUrlOpen', ({ url }) => handler(url));
}
