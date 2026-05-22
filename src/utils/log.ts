const isEnabled = () => process.env.DEBUG?.includes('bonbonus') ?? false;

export const createLogger = (scope: string) => {
  return (...args: unknown[]) => {
    if (!isEnabled()) return;
    console.error(`[bonbonus:${scope}]`, ...args);
  };
};
