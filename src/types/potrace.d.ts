declare module "potrace" {
  type PotraceCallback = (err: Error | null, svg: string) => void;
  export function trace(input: Buffer | string, options: Record<string, unknown>, cb: PotraceCallback): void;
  export function posterize(input: Buffer | string, options: Record<string, unknown>, cb: PotraceCallback): void;
  export class Potrace {}
  export class Posterizer {}
}
