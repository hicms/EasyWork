export interface StartupEntry {
  readonly originalSrc: string;
  readonly src: string;
  readonly pathname: string;
  readonly source: string;
}
export declare function brandStartupScript(source: string): string;
export declare function readStartupEntry(indexPath: string): Promise<StartupEntry>;
export declare function brandStartupIndex(html: string, entry: StartupEntry): string;
