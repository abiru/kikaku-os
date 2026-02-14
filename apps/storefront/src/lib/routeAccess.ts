const PROTECTED_PATH_REGEXES = [
  /^\/admin(?:\/|$)/,
  /^\/account(?:\/|$)/,
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/inbox(?:\/|$)/,
  /^\/api\/r2(?:\/|$)/,
];

const LOGIN_PATH_REGEXES = [
  /^\/admin\/login(?:\/|$)/,
  /^\/sign-in(?:\/|$)/,
  /^\/sign-up(?:\/|$)/,
];

export const PROTECTED_ROUTE_PATTERNS = [
  '/admin(.*)',
  '/account(.*)',
  '/api/admin(.*)',
  '/api/inbox(.*)',
  '/api/r2(.*)',
];

export const LOGIN_ROUTE_PATTERNS = [
  '/admin/login(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
];

export const isProtectedPath = (pathname: string): boolean => {
  return PROTECTED_PATH_REGEXES.some((regex) => regex.test(pathname));
};

export const isLoginPath = (pathname: string): boolean => {
  return LOGIN_PATH_REGEXES.some((regex) => regex.test(pathname));
};
