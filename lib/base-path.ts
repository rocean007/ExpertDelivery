const RAW_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || '';

export const BASE_PATH =
  RAW_BASE_PATH && RAW_BASE_PATH !== '/'
    ? RAW_BASE_PATH.startsWith('/')
      ? RAW_BASE_PATH.replace(/\/$/, '')
      : `/${RAW_BASE_PATH.replace(/\/$/, '')}`
    : '';

export function withBasePath(path: string): string {
  if (!path) return BASE_PATH || '/';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
