const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const ensureDate = (value: string) => {
  if (!dateRegex.test(value)) return null;
  return value;
};
