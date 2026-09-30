// pdfmake 0.3 ships no types; this is the slice lib/stats/burnedReportPdf.ts uses.
declare module "pdfmake" {
  type FontFiles = Record<string, Record<string, string>>;
  const pdfmake: {
    setFonts(fonts: FontFiles): void;
    setLocalAccessPolicy(cb: (path: string) => boolean): void;
    setUrlAccessPolicy(cb: (url: string) => boolean): void;
    createPdf(doc: object): { getBuffer(): Promise<Buffer> };
  };
  export default pdfmake;
}

declare module "pdfmake/fonts/Roboto" {
  const fonts: Record<string, Record<string, string>>;
  export default fonts;
}
