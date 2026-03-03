declare module "vitest" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export const vi: {
    mock(path: string, factory?: () => unknown | Promise<unknown>): void;
    importActual<T>(path: string): Promise<T>;
    resetModules(): void;
  };
}
