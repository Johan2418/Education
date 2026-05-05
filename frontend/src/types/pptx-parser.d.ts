declare module "pptx-parser" {
  const parsePptx: (input: ArrayBuffer | Blob | string) => Promise<any>;
  export default parsePptx;
  export function vf(input: any, options: any): Promise<any>;
}
