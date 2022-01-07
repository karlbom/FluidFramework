import * as fs from "fs";
import nconf from "nconf";
import FS from "@isomorphic-git/lightning-fs";
import { S3PromisifiedFileSystem } from "./s3Filesystem";

export interface EncodingOpts {
    encoding?: "utf8";
}

export interface StatLike {
    type: "file" | "dir" | "symlink";
    mode: number;
    size: number;
    ino: number | string | BigInt;
    mtimeMs: number;
    ctimeMs?: number;
}

export interface IBackend {
    // highly recommended - usually necessary for apps to work
    readFile(filepath: string, opts: EncodingOpts): Promise<Uint8Array | string>; // throws ENOENT
    writeFile(filepath: string, data: Uint8Array | string, opts: EncodingOpts): void; // throws ENOENT
    unlink(filepath: string, opts: any): void; // throws ENOENT
    readdir(filepath: string, opts: any): Promise<string[]>; // throws ENOENT, ENOTDIR
    mkdir(filepath: string, opts: any): void; // throws ENOENT, EEXIST
    rmdir(filepath: string, opts: any): void; // throws ENOENT, ENOTDIR, ENOTEMPTY

    // recommended - often necessary for apps to work
    stat(filepath: string, opts: any): Promise<StatLike>; // throws ENOENT
    lstat(filepath: string, opts: any): Promise<StatLike>; // throws ENOENT

    // suggested - used occasionally by apps
    // rename(oldFilepath: string, newFilepath: string): void; // throws ENOENT
    // readlink(filepath: string, opts: any): Promise<string>; // throws ENOENT
    // symlink(target: string, filepath: string): void; // throws ENOENT

    // bonus - not part of the standard `fs` module
    // backFile(filepath: string, opts: any): void;
    // du(filepath: string): Promise<number>;

    // lifecycle - useful if your backend needs setup and teardown
    // init?(name: string, opts: any): Promise<void>; // passes initialization options
    // activate?(): Promise<void>; // called before fs operations are started
    // deactivate?(): Promise<void>; // called after fs has been idle for a while
    // destroy?(): Promise<void>; // called before hotswapping backends
}

export function createFs(store: nconf.Provider): FS {
    const backend = store.get("storage:backend") as string;

    switch (backend) {
        case "S3":
            {
                const bucket = store.get("storage:s3:bucket") as string;
                const region = store.get("storage:s3:region") as string;

                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return new FS("S3FS", { backend: new S3PromisifiedFileSystem({ region }, bucket) });
            }
        case "FS": {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return fs;
        }
        default:
            throw new Error(`Unknown backend ${backend}`);
    }
}
