const PUBLIC_TOKEN_REGEX = /^(?=.*[A-Za-z])[A-Za-z0-9]{16,64}$/;

export const isPublicToken = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return PUBLIC_TOKEN_REGEX.test(value);
};
