declare module "html-to-docx" {
    interface HtmlToDocxOptions {
        table?: { row?: { cantSplit?: boolean } };
        footer?: boolean;
        pageNumber?: boolean;
        [key: string]: unknown;
    }

    type HtmlToDocx = (
        html: string,
        headerHtml?: string | null,
        options?: HtmlToDocxOptions,
        footerHtml?: string | null,
    ) => Promise<Buffer>;

    const htmlToDocx: HtmlToDocx;
    export default htmlToDocx;
}
