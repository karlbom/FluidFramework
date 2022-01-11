import type { Readable } from "stream";
import { S3, S3ClientConfig } from "@aws-sdk/client-s3";
import { encode, decode } from "isomorphic-textencoder";
import { IBackend, EncodingOpts, StatLike } from "./filesystem";

const SHA_MATCHER = new RegExp("([0-9a-f]{4,40}-[0-9a-f]{4,40}-[0-9a-f]{4,40}-[0-9a-f]{4,40}-)[0-9a-f]{4,40}");

function streamToUint8Array(stream: Readable): Promise<Uint8Array> {
    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.once("end", () => resolve(Buffer.concat(chunks)));
        stream.once("error", reject);
    });
}

export class S3PromisifiedFileSystem implements IBackend {
    private readonly client: S3;

    constructor(config: S3ClientConfig, private readonly bucket: string) {
        this.client = new S3(config);
    }
    async readFile(filepath: string, opts: EncodingOpts): Promise<string | Uint8Array> {
        const path = this.normalizePath(filepath);
        try {
            const data = await this.client.getObject({ Bucket: this.bucket, Key: path });
            const stream = data.Body as Readable;
            if (stream) {
                const array = await streamToUint8Array(stream);

                if (opts.encoding === "utf8") {
                    return decode(array) as string;
                }
                return array;
            } else {
                // TODO(marcus): figure out the behaviour of readFile in node fs does it throw?
                // copy throw behaviour of FS
                throw new Error("no stream found");
            }
        } catch (error) {
            const typed = error as unknown as any;
            const e = new Error(typed.message) as any;
            e.code = "ENOENT";
            throw e;
        }
    }
    private normalizePath(filepath: string) {
        let p = filepath.startsWith("/") ? filepath.slice(1) : filepath;
        const found_sha = SHA_MATCHER.exec(p);
        if (!!found_sha && !p.includes("objects")) {
            const start = p.slice(0, p.indexOf(".git/") + 5);
            const sha = found_sha[0];
            p = `${start}refs/heads/${sha}`;
        }
        return p;
    }
    async writeFile(filepath: string, input: string | Uint8Array, opts: EncodingOpts): Promise<void> {
        const path = this.normalizePath(filepath);
        try {
            let data = input;
            const { encoding = "utf8" } = opts;
            if (typeof data === "string") {
                if (encoding !== "utf8") {
                    throw new Error('Only "utf8" encoding is supported in writeFile');
                }
                data = encode(data);
            }
            await this.client.putObject({ Bucket: this.bucket, Key: path, Body: data });
        } catch (error) {
            const typed = error as unknown as any;
            const e = new Error(typed.message) as any;
            e.code = "ENOENT";
            console.log("WRITE FILE FAILED FOR ", path);

            throw e;
        }
    }
    async unlink(filepath: string, opts: any): Promise<void> {
        try {
            await this.client.deleteObject({ Bucket: this.bucket, Key: filepath });
        } catch (error) {
            const typed = error as unknown as any;
            const e = new Error(typed.message) as any;
            e.code = "ENOENT";
            throw e;
        }
    }
    async readdir(filepath: string, opts: any): Promise<string[]> {
        const path = this.normalizePath(filepath);
        try {
            const result = await this.client.listObjects({ Bucket: this.bucket, Delimiter: "/", Prefix: path });
            // TODO(marcus): pagination
            const files_folders: string[] = [];
            if (result.CommonPrefixes) {
                result.CommonPrefixes.forEach((p) => {
                    const subfolders = p.Prefix.slice(path.length, p.Prefix.length - 1);
                    files_folders.push(subfolders);
                });
            }
            if (result.Contents) {
                result.Contents.forEach((c) => {
                    const file = c.Key.slice(path.length, c.Key.endsWith("/") ? c.Key.length - 1 : undefined);
                    if (file.length > 0) {
                        files_folders.push(file);
                    }
                });
            }
            return files_folders;
        } catch (error) {
            const typed = error as unknown as any;
            const e = new Error(typed.message) as any;
            // TODO(marcus): Can throw ENOENT and ENODIR make sure the behvious makes sense
            e.code = "ENOENT";
            throw e;
        }
    }
    async mkdir(filepath: string, opts: any): Promise<void> {
        const path = this.normalizePath(filepath);
        await this.client.putObject({
            Bucket: this.bucket,
            Key: path.endsWith("/") ? path : `${path}/`,
        });
    }
    async rmdir(filepath: string, opts: any): Promise<void> {
        const path = this.normalizePath(filepath);
        await this.client.deleteObject({
            Bucket: this.bucket,
            Key: filepath.endsWith("/") ? path : `${path}/`,
        });
    }
    async stat(filepath: string, opts: any): Promise<StatLike> {
        if (filepath.endsWith("/")) {
            const date = new Date().getTime() / 1000;
            return {
                type: "dir",
                mode: 0,
                size: 0,
                ino: "0",
                mtimeMs: date,
            };
        } else {
            try {
                const result = await this.client.headObject({ Bucket: this.bucket, Key: filepath });
                return {
                    type: "file",
                    mode: 0,
                    size: result.ContentLength,
                    ino: "0",
                    mtimeMs: result.LastModified.getTime() / 1000,
                };
            } catch (error) {
                const typed = error as unknown as any;
                const e = new Error(typed.message) as any;
                e.code = "ENOENT";
                throw e;
            }
        }
    }

    async lstat(filepath: string, opts: any): Promise<StatLike> {
        if (filepath.endsWith("/")) {
            const date = new Date().getTime() / 1000;
            return {
                type: "dir",
                mode: 0,
                size: 0,
                ino: "0",
                mtimeMs: date,
            };
        } else {
            const result = await this.client.headObject({ Bucket: this.bucket, Key: filepath });
            return {
                type: "file",
                mode: 0,
                size: result.ContentLength,
                ino: "0",
                mtimeMs: result.LastModified.getTime() / 1000,
            };
        }
    }

    saveSuperblock() {
        // TODO(marcus): not sure about the purpose but it needs to exist
    }
}
